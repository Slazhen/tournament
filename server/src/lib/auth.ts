import { forbidden, unauthorized } from './http.js'
import { findSessionByToken, getUserById } from './sessions.js'
import type { AuthUser } from './types.js'

/**
 * Resolves the caller from the Authorization header.
 *
 * This is the check the old app never had. Before, "who are you" was decided in
 * React and the database accepted whatever the browser sent; a session token
 * was only ever compared client-side. Now every non-public route resolves the
 * token here, server-side, and the request stops if it does not.
 */
export async function authenticate(authorizationHeader: string | undefined): Promise<AuthUser> {
  const token = extractBearerToken(authorizationHeader)
  if (!token) throw unauthorized()

  const session = await findSessionByToken(token)
  if (!session) throw unauthorized('Session expired or invalid')

  const user = await getUserById(session.userId)
  if (!user || !user.isActive) throw unauthorized('Account is not active')

  return user
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1]!.trim() : null
}

export function isSuperAdmin(user: AuthUser): boolean {
  return user.role === 'super_admin'
}

/** Only the super admin may manage organizers and accounts. */
export function assertSuperAdmin(user: AuthUser): void {
  if (!isSuperAdmin(user)) throw forbidden('Super admin privileges required')
}

/**
 * An organizer may only touch resources belonging to their own organizer id.
 * The super admin may touch anything.
 */
export function assertCanAccessOrganizer(user: AuthUser, organizerId: string | undefined): void {
  if (isSuperAdmin(user)) return
  if (!organizerId || user.organizerId !== organizerId) {
    throw forbidden('This resource belongs to another organizer')
  }
}

/**
 * A club is run by its managers, and by the organizer whose competition it was
 * created in until somebody claims it.
 *
 * This is the second question the API has to answer now — "is this your team"
 * as well as "is this your organizer" — and it lives here rather than in the
 * routes so that there is one answer rather than one per endpoint.
 */
export function managesTeam(user: AuthUser, team: { id: string; managerUserIds?: string[] }): boolean {
  return Array.isArray(team.managerUserIds) && team.managerUserIds.includes(user.id)
}

export function assertManagesTeam(
  user: AuthUser,
  team: { id: string; organizerId?: string; managerUserIds?: string[] },
): void {
  if (isSuperAdmin(user)) return
  if (managesTeam(user, team)) return
  if (user.role === 'organizer' && user.organizerId && user.organizerId === team.organizerId) return
  throw forbidden('This club belongs to someone else')
}
