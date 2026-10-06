import { badRequest, forbidden } from './http.js'
import type { AuthUser, Organizer } from './types.js'

/**
 * An organiser is run by several accounts, and one of them is in charge.
 *
 * Every account carrying `role: 'organizer'` and this `organizerId` already
 * passes `assertCanAccessOrganizer`, so a helper is nothing more than another
 * such account: every route that lets the owner touch a competition lets the
 * helper touch it, with no change to any of them. What this module adds is the
 * one thing the helpers do not share, which is who comes and goes. Inviting,
 * removing and handing over the organiser are the owner's alone, and so is the
 * organiser's own record (its name, which is also its public address).
 *
 * The same arrangement as a club's head manager (`lib/club-managers.ts`), and
 * for the same reason the field may be absent: every organiser from before it
 * has exactly one account, which is its owner, and needs no migration.
 */

/** How many helpers an organiser may have, live accounts and open invitations together. */
export const MAX_HELPERS = 5

/**
 * The live accounts that run this organiser, longest-serving first.
 *
 * Ordered by when they joined it, not when the account was made: a coach who
 * takes up a helper invitation brings an account older than the owner's, and
 * ordering by `createdAt` handed them the organiser the moment they joined.
 *
 * A switched-off account keeps its `organizerId` (that is what lets the same
 * organiser bring it back), so "runs it" also means "can sign in". A super
 * admin carrying an organizerId is a mistake in the data, not a member.
 */
export function membersOf(organizerId: string, accounts: AuthUser[]): AuthUser[] {
  return accounts
    .filter(
      (account) =>
        account.organizerId === organizerId &&
        account.role === 'organizer' &&
        account.isActive !== false,
    )
    .sort((a, b) => joinedAt(a).localeCompare(joinedAt(b)) || a.id.localeCompare(b.id))
}

const joinedAt = (account: AuthUser) => String(account.organizerSince ?? account.createdAt ?? '')

/**
 * Who is in charge.
 *
 * The named owner while they are still a live member; otherwise the oldest
 * member. Falling back rather than answering nobody is deliberate: an owner
 * whose account the super admin deleted would otherwise leave an organiser
 * that nobody could invite to or remove anybody from, and the oldest remaining
 * account is the one most likely to have been there from the start.
 */
export function ownerOf(
  organizer: Pick<Organizer, 'id' | 'ownerUserId'>,
  accounts: AuthUser[],
): AuthUser | null {
  const members = membersOf(organizer.id, accounts)
  return members.find((member) => member.id === organizer.ownerUserId) ?? members[0] ?? null
}

/** The owner, or the super admin. Everybody else is refused, helpers included. */
export function assertOrganizerOwner(
  user: AuthUser,
  organizer: Pick<Organizer, 'id' | 'ownerUserId'>,
  accounts: AuthUser[],
): void {
  if (user.role === 'super_admin') return
  if (user.organizerId !== organizer.id) {
    throw forbidden('This resource belongs to another organizer')
  }
  if (ownerOf(organizer, accounts)?.id !== user.id) {
    throw forbidden('Only the owner of this organizer can do that')
  }
}

/**
 * What taking a helper invitation up does to whatever already sits on the
 * address, or why it cannot be taken up at all.
 *
 * An account has one role and one `organizerId`, which is what decides all of
 * this:
 *
 * - `new`: nothing there. An organiser's account is opened.
 * - `signin`: a club manager's account. It becomes an organiser's account and
 *   keeps its clubs, because an organiser may run clubs as well and the bar
 *   already offers them. The person signs in first: the link proves the inbox,
 *   not the password.
 * - `reactivate`: this organiser's own helper, switched off when they were
 *   removed. It comes back on with the password it already had. Not a new one
 *   chosen at the link: the owner who issued the link holds it too, and could
 *   otherwise sign in as the person they removed.
 *
 * Refused: a referee (refereeing would be lost, since the role is the only
 * thing that says somebody referees), an account of another organiser (it has
 * room for one), a live account of this one (already in), a super admin, and a
 * club manager who was switched off (somebody locked them out on purpose).
 */
export type HelperClaimMode = 'new' | 'signin' | 'reactivate'

export function helperClaimMode(
  existing: AuthUser | null,
  organizerId: string,
): { mode: HelperClaimMode } | { refused: string } {
  if (!existing) return { mode: 'new' }
  const active = existing.isActive !== false

  if (existing.role === 'team_manager') {
    return active
      ? { mode: 'signin' }
      : { refused: 'The account on this address is switched off.' }
  }
  if (existing.role === 'organizer' && existing.organizerId === organizerId) {
    return active
      ? { refused: 'This address already helps run this organizer.' }
      : { mode: 'reactivate' }
  }
  if (existing.role === 'organizer') {
    return { refused: 'This address already runs another organizer. An account can run one.' }
  }
  if (existing.role === 'referee') {
    return {
      refused:
        'This address belongs to a referee. An account has one role, so helping run competitions needs a login on another address.',
    }
  }
  return { refused: 'This address cannot be invited.' }
}

/**
 * What removing a helper does to their account.
 *
 * A helper who also runs a club stays a club manager: the organiser's half is
 * taken away and the clubs are left alone. A helper with nothing else is
 * switched off rather than deleted, because the audit log names authors by
 * account id and a deleted id is an author nobody can identify; switched off,
 * the address stays taken and inviting them again brings the same account back.
 */
export function revocationOf(account: Pick<AuthUser, 'teamIds'>): 'demote' | 'deactivate' {
  return (account.teamIds?.length ?? 0) > 0 ? 'demote' : 'deactivate'
}

/**
 * Whether an organiser account's link to a club came from owning the club
 * rather than from an invitation.
 *
 * An organiser may put themselves on one of their own clubs (`managers/me`),
 * and that link stands for ownership, so it goes when the club moves away or
 * the organiser goes. A coach who became a helper ran their club before; that
 * link came from an invitation and is theirs. The dates tell them apart: a link
 * older than the account's `organizerSince` predates the organiser.
 *
 * A link with no date is from before dates were kept. On an organiser's first
 * login (no `organizerSince`) it counts as ownership, which is what every such
 * link was when nobody but the owner had an organizerId. On a helper it does
 * not: every link written since helpers exist carries a date, so an undated
 * one predates their joining.
 */
export function grantedByOrganizer(
  team: { organizerId?: string; managerLinkedAt?: Record<string, string> },
  account: Pick<AuthUser, 'id' | 'role' | 'organizerId' | 'organizerSince'>,
  organizerId: string,
): boolean {
  if (account.role !== 'organizer' || account.organizerId !== organizerId) return false
  if (team.organizerId !== organizerId) return false
  if (!account.organizerSince) return true
  const linkedAt = team.managerLinkedAt?.[account.id]
  return Boolean(linkedAt && linkedAt >= account.organizerSince)
}

export function readHelperEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!email.includes('@') || email.length > 254 || /\s/.test(email)) {
    throw badRequest('A valid email address is required')
  }
  return email
}
