import { api, clearToken, setToken } from './api'

/**
 * Client side of authentication.
 *
 * Everything security-relevant now happens on the server: password hashing,
 * password checking, session lookup and every permission decision. What is left
 * here is bookkeeping — send the credentials, keep the returned token, ask the
 * API who we are.
 *
 * The previous version of this file ran PBKDF2 in the browser and compared the
 * result against a password hash it had just read out of DynamoDB with a key
 * that shipped in the public bundle.
 */

export type UserRole = 'super_admin' | 'organizer' | 'team_manager'

/** The user as the API returns it: no password hash, no salt. */
export type AuthUser = {
  id: string
  email?: string
  /** Legacy label on old accounts. It no longer signs anyone in. */
  username?: string
  /** What to call this person on screen. */
  displayName?: string
  role: UserRole
  organizerId?: string
  /** The clubs this account runs. */
  teamIds?: string[]
  createdAt: string
  lastLogin?: string
  isActive: boolean
}

export type AuthSession = {
  token: string
  expiresAt: string
}

type LoginResponse = { user: AuthUser; token: string; expiresAt: string }

export async function authenticateUser(
  loginCredential: string,
  password: string,
): Promise<{ user: AuthUser; session: AuthSession } | null> {
  try {
    const result = await api.post<LoginResponse>('/auth/login', { loginCredential, password })
    setToken(result.token)
    return { user: result.user, session: { token: result.token, expiresAt: result.expiresAt } }
  } catch {
    // Wrong login, wrong password and unknown account all look the same here,
    // exactly as the API reports them.
    return null
  }
}

/** Restores a session on page load. Returns null when the stored token is no longer valid. */
export async function verifySession(): Promise<{ user: AuthUser } | null> {
  try {
    return await api.get<{ user: AuthUser }>('/auth/session')
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout')
  } finally {
    clearToken()
  }
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const result = await api.post<LoginResponse>('/auth/password', { currentPassword, newPassword })
  setToken(result.token)
}

/* ---------------- account management (super admin) ---------------- */

/** Creates an organizer login. A real password is required — there is no default any more. */
export async function createOrganizerAccount(
  organizerEmail: string,
  organizerId: string,
  password: string,
  displayName?: string,
): Promise<AuthUser> {
  return api.post<AuthUser>('/admin/accounts', {
    email: organizerEmail,
    organizerId,
    password,
    displayName,
  })
}

/**
 * A second super admin.
 *
 * The role has nobody above it to reset its password, so a single account is
 * one forgotten password away from an unrecoverable system.
 */
export async function createSuperAdminAccount(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthUser> {
  return api.post<AuthUser>('/admin/accounts', {
    email,
    password,
    displayName,
    role: 'super_admin',
  })
}

export async function deleteOrganizerAccount(organizerEmail: string): Promise<void> {
  await api.delete(`/admin/accounts/${encodeURIComponent(organizerEmail)}`)
}

export async function resetOrganizerPassword(
  organizerEmail: string,
  newPassword: string,
): Promise<void> {
  await api.post('/admin/accounts/reset-password', {
    email: organizerEmail,
    password: newPassword,
  })
}

/* ---------------- local helpers ---------------- */

export const isSuperAdminUser = (user: AuthUser | null): boolean => user?.role === 'super_admin'

/**
 * Whether the signed-in user may see an organizer's admin pages.
 *
 * This only decides what the interface offers. The API makes the same decision
 * again on every request, and that one is the one that counts.
 */
export function canAccessOrganizer(user: AuthUser | null, organizerId: string): boolean {
  if (!user) return false
  if (user.role === 'super_admin') return true
  return user.organizerId === organizerId
}

/**
 * Asks for a password-reset link.
 *
 * The API answers the same whether or not the address has an account, so this
 * never reports "no such user" — that would tell a stranger which addresses are
 * worth guessing at.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/forgot', { email: email.trim().toLowerCase() })
}

/** Finishes a reset and signs the person straight in. */
export async function completePasswordReset(
  token: string,
  password: string,
): Promise<{ user: AuthUser; session: AuthSession }> {
  const result = await api.post<LoginResponse>('/auth/reset', { token, password })
  setToken(result.token)
  return { user: result.user, session: { token: result.token, expiresAt: result.expiresAt } }
}

/** A one-time link a super admin can pass on by hand. */
export async function issueResetLink(
  email: string,
  send = false,
): Promise<{ link: string; expiresAt: string; emailed: boolean }> {
  return api.post('/admin/accounts/reset-link', { email: email.trim().toLowerCase(), send })
}

export type AuditEntry = {
  at: string
  actorId: string
  actorEmail?: string
  actorRole: UserRole
  action: string
  entity: string
  entityId: string
  summary?: string
  organizerId?: string
}

/** The record of who changed what. Super admin only, on the server too. */
export async function fetchAuditLog(limit = 100): Promise<AuditEntry[]> {
  return api.get<AuditEntry[]>(`/admin/audit?limit=${limit}`)
}

/** Takes up an invitation to run a club, creating the account when there is none. */
export async function claimTeam(input: {
  token: string
  email?: string
  password?: string
  displayName?: string
}): Promise<{ user: AuthUser; teamId: string }> {
  const result = await api.post<{ user: AuthUser; token?: string; teamId: string }>(
    '/auth/claim',
    input,
  )
  if (result.token) setToken(result.token)
  return { user: result.user, teamId: result.teamId }
}
