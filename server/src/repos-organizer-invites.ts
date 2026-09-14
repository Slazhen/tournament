import { ddb, DeleteCommand, scanAll } from './lib/ddb.js'
import { TABLES } from './lib/env.js'
import {
  inviteEnvelope,
  putInvite,
  readInvite,
  spendInvite,
  type InviteBase,
} from './lib/invites.js'
import type { Organizer } from './lib/types.js'

/**
 * Invitations to run an organiser.
 *
 * The organiser record is created by the super admin and exists from that
 * moment; what this invites somebody to is the *login* for it. That is the same
 * shape as a club invitation — the club exists, the coach is invited to run it
 * — and it is why nothing here creates an organiser: an invitation nobody
 * answers leaves a record the super admin can still edit, invite again, or
 * delete, rather than a token holding the only copy of what was typed.
 *
 * The address is not optional, unlike a club's. A club invitation without one
 * is a link passed on by hand over WhatsApp; this one opens an account that can
 * run competitions, and binding it to the address it was sent to is what stops
 * a link going astray from becoming an account on somebody else's email.
 */
export type OrganizerInvite = InviteBase & {
  kind: 'organizer'
  organizerId: string
  /**
   * The organiser's name as it was when the invitation went out.
   *
   * Copied for the same reason a club invitation copies its competition's: the
   * claim page can say what is being taken on without a second read, and a
   * record renamed in the meantime still reads sensibly.
   */
  organizerName: string
  /** Required here, where the base type leaves it optional. */
  email: string
}

export async function createOrganizerInvite(
  organizer: Organizer,
  createdBy: string,
  email: string,
): Promise<OrganizerInvite> {
  const invite: OrganizerInvite = {
    ...inviteEnvelope('organizer', createdBy, email),
    kind: 'organizer',
    organizerId: organizer.id,
    organizerName: organizer.name,
    email,
  }

  await putInvite(invite)
  return invite
}

/** Reads one without spending it, to show what is being taken on. */
export async function peekOrganizerInvite(token: string): Promise<OrganizerInvite | null> {
  return readInvite<OrganizerInvite>(token, 'organizer')
}

/** Spends it. One account, once. */
export async function consumeOrganizerInvite(token: string): Promise<OrganizerInvite | null> {
  const invite = await peekOrganizerInvite(token)
  if (!invite) return null
  return (await spendInvite(token)) ? invite : null
}

/**
 * The invitations still outstanding, so the organiser list can say who has been
 * asked and has not answered.
 *
 * One scan of a table that holds a handful of rows and expires them itself,
 * rather than a read per organiser. Expired ones are filtered here as well as
 * by DynamoDB's TTL, which is not prompt: an item can sit there for hours after
 * its time, and "invitation sent" against a link that no longer works is worse
 * than saying nothing.
 */
export async function pendingOrganizerInvites(): Promise<OrganizerInvite[]> {
  const all = await scanAll<OrganizerInvite>(TABLES.INVITES)
  const now = Date.now()
  return all.filter(
    (invite) => invite.kind === 'organizer' && new Date(invite.expiresAt).getTime() >= now,
  )
}

/**
 * Drops the outstanding invitations for one organiser.
 *
 * Issuing a second invitation is the ordinary way to deal with a link somebody
 * lost, and the first one keeps working for a fortnight unless it is taken
 * away. Two live links to the same account is one more than anybody meant.
 */
export async function deleteOrganizerInvites(organizerId: string): Promise<number> {
  const pending = await pendingOrganizerInvites()
  const doomed = pending.filter((invite) => invite.organizerId === organizerId)
  for (const invite of doomed) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.INVITES, Key: { token: invite.token } }))
  }
  return doomed.length
}
