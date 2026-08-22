export type UserRole = 'super_admin' | 'organizer'

export type AuthUser = {
  id: string
  email?: string
  /** Legacy: accounts made before login was email-only. Never used to sign in now. */
  username?: string
  /** What the person is called on screen. The email is the login, not the name. */
  displayName?: string
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

/**
 * One line in the record of who changed what.
 *
 * Written for every write that reaches the database, because a super admin can
 * edit any organizer's data and, without this, "somebody changed our result"
 * has no answer.
 */
export type AuditEntry = {
  /** Everything lives in one partition: this is a small, append-only log. */
  pk: 'log'
  /** ISO timestamp plus a random suffix, so entries sort by time and stay unique. */
  at: string
  actorId: string
  actorEmail?: string
  actorRole: UserRole
  action: string
  entity: string
  entityId: string
  /** A short human sentence, not the whole document. */
  summary?: string
  organizerId?: string
}
