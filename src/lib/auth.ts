import { dynamoDB, TABLES } from './aws-config'
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
// Browser-compatible crypto utilities

// Types
export type UserRole = 'super_admin' | 'organizer'
export type AuthUser = {
  id: string
  email: string // Changed from username to email
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
export const authenticateUser = async (email: string, password: string): Promise<{ user: AuthUser; session: AuthSession } | null> => {
  try {
    console.log('Authenticating user:', email)
    
    // Initialize super admin if it doesn't exist and this is the super admin login attempt
    if (email === 'admin@myfootballtournament.com') {
      console.log('Checking/creating super admin...')
      await initializeSuperAdmin()
    }
    
    const user = await getUserByEmail(email)
    if (!user) {
      console.log('User not found:', email)
      return null
    }
    
    console.log('User found, verifying password...')
    const isValidPassword = await verifyPassword(password, user.passwordHash, user.salt)
    if (!isValidPassword) {
      console.log('Invalid password for user:', email)
      return null
    }
    
    console.log('Authentication successful for user:', email)

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
    const existingAdmin = await getUserByEmail('admin@myfootballtournament.com')
    if (existingAdmin) {
      console.log('Super admin already exists')
      return // Super admin already exists
    }

    console.log('Creating super admin account...')
    await createUser({
      email: 'admin@myfootballtournament.com',
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
