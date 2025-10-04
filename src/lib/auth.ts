import { dynamoDB, TABLES } from './aws-config'
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
// Browser-compatible crypto utilities

// Types
export type UserRole = 'super_admin' | 'organizer'
export type AuthUser = {
  id: string
  email?: string // For new organizer accounts
  username?: string // For backward compatibility and super admin
  role: UserRole
  passwordHash: string
  salt: string
  organizerId?: string // Only for organizer users
  createdAt: string
  lastLogin?: string
  isActive: boolean
}

export type AuthSession = {
  id: string
  userId: string
  token: string
  expiresAt: string
  createdAt: string
  userAgent?: string
  ipAddress?: string
}

// Browser-compatible crypto utilities
const generateRandomBytes = (length: number): Uint8Array => {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return array
}

const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Password utilities
export const generateSalt = (): string => {
  const bytes = generateRandomBytes(32)
  return arrayBufferToHex(bytes.buffer)
}

export const hashPassword = async (password: string, salt: string): Promise<string> => {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-512'
    },
    keyMaterial,
    512
  )
  
  return arrayBufferToHex(derivedBits)
}

export const verifyPassword = async (password: string, hash: string, salt: string): Promise<boolean> => {
  const passwordHash = await hashPassword(password, salt)
  return passwordHash === hash
}

// Session utilities
export const generateSessionToken = (): string => {
  const bytes = generateRandomBytes(32)
  return arrayBufferToHex(bytes.buffer)
}

export const isSessionExpired = (expiresAt: string): boolean => {
  return new Date(expiresAt) < new Date()
}

// User management
export const createUser = async (userData: Omit<AuthUser, 'id' | 'passwordHash' | 'salt' | 'createdAt'>, password: string): Promise<AuthUser> => {
  const salt = generateSalt()
  const passwordHash = await hashPassword(password, salt)
  
  const user: AuthUser = {
    id: arrayBufferToHex(generateRandomBytes(16).buffer),
    ...userData,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
    isActive: true
  }

  await dynamoDB.send(new PutCommand({
    TableName: TABLES.AUTH_USERS,
    Item: user
  }))

  return user
}

export const getUserByEmail = async (email: string): Promise<AuthUser | null> => {
  const result = await dynamoDB.send(new ScanCommand({
    TableName: TABLES.AUTH_USERS,
    FilterExpression: 'email = :email AND isActive = :isActive',
    ExpressionAttributeValues: {
      ':email': email,
      ':isActive': true
    }
  }))

  return result.Items?.[0] as AuthUser || null
}

// Backward compatibility function for username-based login
export const getUserByUsername = async (username: string): Promise<AuthUser | null> => {
  const result = await dynamoDB.send(new ScanCommand({
    TableName: TABLES.AUTH_USERS,
    FilterExpression: 'username = :username AND isActive = :isActive',
    ExpressionAttributeValues: {
      ':username': username,
      ':isActive': true
    }
  }))

  return result.Items?.[0] as AuthUser || null
}

export const getUserById = async (id: string): Promise<AuthUser | null> => {
  const result = await dynamoDB.send(new GetCommand({
    TableName: TABLES.AUTH_USERS,
    Key: { id }
  }))

  return result.Item as AuthUser || null
}

export const updateUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  const salt = generateSalt()
  const passwordHash = await hashPassword(newPassword, salt)

  await dynamoDB.send(new UpdateCommand({
    TableName: TABLES.AUTH_USERS,
    Key: { id: userId },
    UpdateExpression: 'SET passwordHash = :passwordHash, salt = :salt, lastLogin = :lastLogin',
    ExpressionAttributeValues: {
      ':passwordHash': passwordHash,
      ':salt': salt,
      ':lastLogin': new Date().toISOString()
    }
  }))
}

// Session management
export const createSession = async (userId: string, userAgent?: string, ipAddress?: string): Promise<AuthSession> => {
  const session: AuthSession = {
    id: arrayBufferToHex(generateRandomBytes(16).buffer),
    userId,
    token: generateSessionToken(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    createdAt: new Date().toISOString(),
    userAgent,
    ipAddress
  }

  await dynamoDB.send(new PutCommand({
    TableName: TABLES.AUTH_SESSIONS,
    Item: session
  }))

  return session
}

export const getSessionByToken = async (token: string): Promise<AuthSession | null> => {
  const result = await dynamoDB.send(new ScanCommand({
    TableName: TABLES.AUTH_SESSIONS,
    FilterExpression: 'token = :token',
    ExpressionAttributeValues: {
      ':token': token
    }
  }))

  const session = result.Items?.[0] as AuthSession
  if (!session || isSessionExpired(session.expiresAt)) {
    return null
  }

  return session
}

export const deleteSession = async (token: string): Promise<void> => {
  const session = await getSessionByToken(token)
  if (session) {
    await dynamoDB.send(new DeleteCommand({
      TableName: TABLES.AUTH_SESSIONS,
      Key: { id: session.id }
    }))
  }
}

export const deleteAllUserSessions = async (userId: string): Promise<void> => {
  const result = await dynamoDB.send(new ScanCommand({
    TableName: TABLES.AUTH_SESSIONS,
    FilterExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  }))

  const deletePromises = result.Items?.map(item => 
    dynamoDB.send(new DeleteCommand({
      TableName: TABLES.AUTH_SESSIONS,
      Key: { id: item.id }
    }))
  ) || []

  await Promise.all(deletePromises)
}

// Authentication functions
export const authenticateUser = async (loginCredential: string, password: string): Promise<{ user: AuthUser; session: AuthSession } | null> => {
  try {
    console.log('Authenticating user:', loginCredential)
    
    // Initialize super admin if it doesn't exist and this is the super admin login attempt
    if (loginCredential === 'Slazhen') {
      console.log('Checking/creating super admin...')
      await initializeSuperAdmin()
    }
    
    // Try to find user by email first, then by username (for backward compatibility)
    let user = await getUserByEmail(loginCredential)
    if (!user) {
      // For backward compatibility, also try to find by username
      user = await getUserByUsername(loginCredential)
    }
    
    if (!user) {
      console.log('User not found:', loginCredential)
      return null
    }
    
    console.log('User found, verifying password...')
    const isValidPassword = await verifyPassword(password, user.passwordHash, user.salt)
    if (!isValidPassword) {
      console.log('Invalid password for user:', loginCredential)
      return null
    }
    
    console.log('Authentication successful for user:', loginCredential)

    // Update last login
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLES.AUTH_USERS,
      Key: { id: user.id },
      UpdateExpression: 'SET lastLogin = :lastLogin',
      ExpressionAttributeValues: {
        ':lastLogin': new Date().toISOString()
      }
    }))

    // Create new session
    const session = await createSession(user.id)

    return { user, session }
  } catch (error) {
    console.error('Error in authenticateUser:', error)
    return null
  }
}

export const verifySession = async (token: string): Promise<{ user: AuthUser; session: AuthSession } | null> => {
  const session = await getSessionByToken(token)
  if (!session) {
    return null
  }

  const user = await getUserById(session.userId)
  if (!user || !user.isActive) {
    return null
  }

  return { user, session }
}

// Initialize super admin
export const initializeSuperAdmin = async (): Promise<void> => {
  try {
    console.log('Checking for existing super admin...')
    const existingAdmin = await getUserByUsername('Slazhen')
    if (existingAdmin) {
      console.log('Super admin already exists')
      return // Super admin already exists
    }

    console.log('Creating super admin account...')
    await createUser({
      username: 'Slazhen',
      role: 'super_admin',
      isActive: true
    }, '123')
    console.log('Super admin created successfully')
  } catch (error) {
    console.error('Error in initializeSuperAdmin:', error)
    throw error
  }
}

// Create organizer account
export const createOrganizerAccount = async (organizerEmail: string, organizerId: string, password?: string): Promise<AuthUser> => {
  return await createUser({
    email: organizerEmail,
    role: 'organizer',
    organizerId: organizerId,
    isActive: true
  }, password || '123')
}

// Delete organizer account
export const deleteOrganizerAccount = async (organizerEmail: string): Promise<void> => {
  const user = await getUserByEmail(organizerEmail)
  if (user) {
    // Delete all sessions for this user
    await deleteAllUserSessions(user.id)
    
    // Delete the user account
    await dynamoDB.send(new DeleteCommand({
      TableName: TABLES.AUTH_USERS,
      Key: { id: user.id }
    }))
  }
}

// Reset organizer password
export const resetOrganizerPassword = async (organizerEmail: string, newPassword: string): Promise<void> => {
  console.log('Looking for organizer with email:', organizerEmail)
  const user = await getUserByEmail(organizerEmail)
  console.log('Found user:', user)
  
  if (!user) {
    // Let's also check if there are any users with similar emails
    const allUsers = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.AUTH_USERS,
      FilterExpression: 'role = :role',
      ExpressionAttributeValues: {
        ':role': 'organizer'
      }
    }))
    console.log('All organizer users:', allUsers.Items?.map(u => ({ email: u.email, id: u.id })))
    throw new Error(`Organizer not found: ${organizerEmail}`)
  }
  
  await updateUserPassword(user.id, newPassword)
}

// Role-based access control
export const hasPermission = (user: AuthUser, action: string, resource?: string): boolean => {
  switch (user.role) {
    case 'super_admin':
      return true // Super admin has access to everything
    case 'organizer':
      // Organizers can only access their own data
      if (action === 'access_organizer_data' && resource === user.organizerId) {
        return true
      }
      return false
    default:
      return false
  }
}

export const canAccessOrganizer = (user: AuthUser, organizerId: string): boolean => {
  if (user.role === 'super_admin') {
    return true
  }
  return user.role === 'organizer' && user.organizerId === organizerId
}

// Migration function to add email to existing auth accounts
export const migrateOrganizerToEmail = async (organizerEmail: string, organizerId: string): Promise<boolean> => {
  try {
    console.log('Migrating organizer to email-based auth:', organizerEmail)
    
    // First, check if there's already an auth account for this organizer
    const existingUser = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.AUTH_USERS,
      FilterExpression: 'organizerId = :organizerId',
      ExpressionAttributeValues: {
        ':organizerId': organizerId
      }
    }))
    
    if (existingUser.Items && existingUser.Items.length > 0) {
      const user = existingUser.Items[0] as AuthUser
      console.log('Found existing auth account:', user)
      
      // Update the existing account to include email
      await dynamoDB.send(new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: user.id },
        UpdateExpression: 'SET email = :email',
        ExpressionAttributeValues: {
          ':email': organizerEmail
        }
      }))
      
      console.log('Successfully migrated organizer to email-based auth')
      return true
    } else {
      console.log('No existing auth account found for organizer:', organizerId)
      return false
    }
  } catch (error) {
    console.error('Error migrating organizer to email-based auth:', error)
    return false
  }
}

// Diagnostic function to check organizer and auth data
export const diagnoseOrganizerAuth = async (organizerEmail: string): Promise<void> => {
  try {
    console.log('=== DIAGNOSTIC REPORT ===')
    console.log('Looking for organizer with email:', organizerEmail)
    
    // Check organizers table
    const organizersResult = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.ORGANIZERS,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': organizerEmail
      }
    }))
    
    console.log('Organizers found:', organizersResult.Items?.length || 0)
    if (organizersResult.Items && organizersResult.Items.length > 0) {
      const organizer = organizersResult.Items[0]
      console.log('Organizer data:', {
        id: organizer.id,
        name: organizer.name,
        email: organizer.email
      })
      
      // Check auth users table
      const authResult = await dynamoDB.send(new ScanCommand({
        TableName: TABLES.AUTH_USERS,
        FilterExpression: 'organizerId = :organizerId',
        ExpressionAttributeValues: {
          ':organizerId': organizer.id
        }
      }))
      
      console.log('Auth users found:', authResult.Items?.length || 0)
      if (authResult.Items && authResult.Items.length > 0) {
        const authUser = authResult.Items[0]
        console.log('Auth user data:', {
          id: authUser.id,
          username: authUser.username,
          email: authUser.email,
          role: authUser.role,
          organizerId: authUser.organizerId
        })
      } else {
        console.log('❌ No auth account found for this organizer')
      }
    } else {
      console.log('❌ No organizer found with this email')
      
      // Let's also search by name in case the email is different
      const nameSearchResult = await dynamoDB.send(new ScanCommand({
        TableName: TABLES.ORGANIZERS,
        FilterExpression: 'contains(#name, :name)',
        ExpressionAttributeNames: {
          '#name': 'name'
        },
        ExpressionAttributeValues: {
          ':name': 'Homebush'
        }
      }))
      
      console.log('Organizers with "Homebush" in name:', nameSearchResult.Items?.length || 0)
      if (nameSearchResult.Items && nameSearchResult.Items.length > 0) {
        nameSearchResult.Items.forEach((org, index) => {
          console.log(`Organizer ${index + 1}:`, {
            id: org.id,
            name: org.name,
            email: org.email
          })
        })
      }
    }
    
    console.log('=== END DIAGNOSTIC ===')
  } catch (error) {
    console.error('Error in diagnostic:', error)
  }
}

// Function to manually fix a specific organizer's auth account
export const fixOrganizerAuth = async (organizerEmail: string): Promise<boolean> => {
  try {
    console.log('Fixing auth account for organizer:', organizerEmail)
    
    // Find organizer by email
    const organizersResult = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.ORGANIZERS,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': organizerEmail
      }
    }))
    
    if (!organizersResult.Items || organizersResult.Items.length === 0) {
      console.log('❌ No organizer found with email:', organizerEmail)
      return false
    }
    
    const organizer = organizersResult.Items[0]
    console.log('Found organizer:', organizer.name, 'with ID:', organizer.id)
    
    // Find auth account for this organizer
    const authResult = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.AUTH_USERS,
      FilterExpression: 'organizerId = :organizerId',
      ExpressionAttributeValues: {
        ':organizerId': organizer.id
      }
    }))
    
    if (!authResult.Items || authResult.Items.length === 0) {
      console.log('❌ No auth account found for organizer')
      return false
    }
    
    const authUser = authResult.Items[0]
    console.log('Found auth account:', {
      id: authUser.id,
      username: authUser.username,
      email: authUser.email,
      role: authUser.role
    })
    
    // Update the auth account with the email
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLES.AUTH_USERS,
      Key: { id: authUser.id },
      UpdateExpression: 'SET email = :email',
      ExpressionAttributeValues: {
        ':email': organizerEmail
      }
    }))
    
    console.log('✅ Successfully updated auth account with email:', organizerEmail)
    return true
  } catch (error) {
    console.error('Error fixing organizer auth:', error)
    return false
  }
}

// Function to sync organizer emails with auth accounts
export const syncOrganizerEmails = async (): Promise<void> => {
  try {
    console.log('Starting organizer email sync...')
    
    // Get all organizers
    const organizersResult = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.ORGANIZERS
    }))
    
    const organizers = organizersResult.Items || []
    console.log('Found organizers:', organizers.length)
    
    // Get all auth users
    const authUsersResult = await dynamoDB.send(new ScanCommand({
      TableName: TABLES.AUTH_USERS,
      FilterExpression: 'role = :role',
      ExpressionAttributeValues: {
        ':role': 'organizer'
      }
    }))
    
    const authUsers = authUsersResult.Items || []
    console.log('Found auth users:', authUsers.length)
    
    // Match organizers with auth users and sync emails
    for (const organizer of organizers) {
      const matchingAuthUser = authUsers.find(authUser => authUser.organizerId === organizer.id)
      
      if (matchingAuthUser && organizer.email && !matchingAuthUser.email) {
        console.log(`Syncing email for organizer ${organizer.name}: ${organizer.email}`)
        
        await dynamoDB.send(new UpdateCommand({
          TableName: TABLES.AUTH_USERS,
          Key: { id: matchingAuthUser.id },
          UpdateExpression: 'SET email = :email',
          ExpressionAttributeValues: {
            ':email': organizer.email
          }
        }))
        
        console.log(`Successfully synced email for ${organizer.name}`)
      }
    }
    
    console.log('Organizer email sync completed')
  } catch (error) {
    console.error('Error syncing organizer emails:', error)
  }
}
