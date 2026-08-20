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

export type UserRole = 'super_admin' | 'organizer'

/** The user as the API returns it: no password hash, no salt. */
export type AuthUser = {
  id: string
  email?: string
  username?: string
  role: UserRole
  organizerId?: string
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
): Promise<AuthUser> {
  return api.post<AuthUser>('/admin/accounts', {
    email: organizerEmail,
    organizerId,
    password,
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
