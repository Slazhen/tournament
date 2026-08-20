export type UserRole = 'super_admin' | 'organizer'

export type AuthUser = {
  id: string
  email?: string
  username?: string
  role: UserRole
  passwordHash: string
  salt: string
  organizerId?: string
  createdAt: string
  lastLogin?: string
  isActive: boolean
}

/** An AuthUser with the secret fields removed. This is the only user shape the API ever returns. */
export type PublicUser = Omit<AuthUser, 'passwordHash' | 'salt'>

export type AuthSession = {
  id: string
  userId: string
  token: string
  expiresAt: string
  createdAt: string
  userAgent?: string
  ipAddress?: string
}

export type Organizer = {
  id: string
  name: string
  email: string
  createdAtISO: string
  logo?: string
  description?: string
}

export type Team = {
  id: string
  name: string
  organizerId: string
  [key: string]: unknown
}

export type Tournament = {
  id: string
  name: string
  organizerId: string
  createdAtISO: string
  teamIds: string[]
  matches: unknown[]
  visibility?: 'public' | 'private'
  [key: string]: unknown
}

/** Strips the password hash and salt. Never return an AuthUser directly. */
export function toPublicUser(user: AuthUser): PublicUser {
  const { passwordHash: _hash, salt: _salt, ...rest } = user
  return rest
}
