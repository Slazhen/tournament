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
 * The caller runs competitions at all.
 *
 * Not a question about one record, which is why it is not
 * `assertCanAccessOrganizer`: the club directory belongs to no organizer in
 * particular, so there is no id to compare against. A team manager carries no
 * `organizerId`, and the directory names other people's clubs and the people
 * who run them — a list a coach has no business reading.
 */
export function assertIsOrganizer(user: AuthUser): void {
  if (isSuperAdmin(user)) return
  if (user.role === 'organizer' && user.organizerId) return
  throw forbidden('Only an organizer can do that')
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
 * created in until somebody claims it — see `isClaimedTeam` below for where
 * that second half stops.
 *
 * This is the second question the API has to answer now — "is this your team"
 * as well as "is this your organizer" — and it lives here rather than in the
 * routes so that there is one answer rather than one per endpoint.
 */
export function managesTeam(user: AuthUser, team: { id: string; managerUserIds?: string[] }): boolean {
  return Array.isArray(team.managerUserIds) && team.managerUserIds.includes(user.id)
}

/**
 * Whether anybody has taken this club on.
 *
 * This is where the organizer's standing over a club ends. Most clubs have no
 * manager and never will, and a competition whose squads only a coach can fill
 * in is one the organizer cannot run — so an unclaimed club is theirs to edit,
 * squad and all. A claimed one is not: the invitation offers the coach "the
 * squad, the crest and entering competitions", and a promise the person who
 * issued it can overwrite at will is not one.
 *
 * What the organizer keeps is the competition, which was never the club's:
 * who is entered in it (`PUT /admin/tournaments/:t/squads/:teamId`), who played
 * (`.../matches/:m/lineup`), and whether the club is in it at all. Those are
 * guarded by `assertCanAccessOrganizer` and are deliberately untouched here.
 */
export function isClaimedTeam(team: { managerUserIds?: string[] }): boolean {
  return Array.isArray(team.managerUserIds) && team.managerUserIds.length > 0
}

export function assertManagesTeam(
  user: AuthUser,
  team: { id: string; organizerId?: string; managerUserIds?: string[] },
): void {
  if (isSuperAdmin(user)) return
  if (managesTeam(user, team)) return
  if (user.role === 'organizer' && user.organizerId && user.organizerId === team.organizerId) {
    // Owning the competition a club plays in is standing in for a manager it
    // does not have, not authority over one it does. An organizer who needs
    // the club back has to take its manager off it first — a deliberate act,
    // on its own screen, recorded in the audit log — rather than editing
    // around them.
    if (!isClaimedTeam(team)) return
    throw forbidden(
      'This club is run by its own manager. You can still enter it in your competitions and name its teamsheets.',
    )
  }
  throw forbidden('This club belongs to someone else')
}
