import { ddb, DeleteCommand, scanAll } from './lib/ddb.js'
import { TABLES } from './lib/env.js'
import { inviteEnvelope, putInvite, readInvite, spendInvite, type InviteBase } from './lib/invites.js'
import type { Referee } from './lib/referees.js'
import type { Organizer } from './lib/types.js'

/**
 * Invitations to take up a referee record.
 *
 * The record exists first - the organiser adds the person to their list - and
 * the invitation links an account to it, which is the shape both other
 * invitations have. Nothing is created at the claim except, for somebody new,
 * the login itself.
 *
 * The address is required, as it is for an organiser and unlike a club: a
 * referee's account may enter results, which is more than a club's manager may
 * do with the score, and a link that went astray must not become an account on
 * somebody else's address.
 */
export type RefereeInvite = InviteBase & {
  kind: 'referee'
  organizerId: string
  refereeId: string
  /** Copied for the claim page, as the other invitations copy their names. */
  organizerName: string
  refereeName: string
  email: string
}

export async function createRefereeInvite(
  organizer: Organizer,
  referee: Referee,
  createdBy: string,
  email: string,
): Promise<RefereeInvite> {
  const invite: RefereeInvite = {
    ...inviteEnvelope('referee', createdBy, email),
    kind: 'referee',
    organizerId: organizer.id,
    refereeId: referee.id,
    organizerName: organizer.name,
    refereeName: referee.name,
    email,
  }
  await putInvite(invite)
  return invite
}

export async function peekRefereeInvite(token: string): Promise<RefereeInvite | null> {
  return readInvite<RefereeInvite>(token, 'referee')
}

export async function consumeRefereeInvite(token: string): Promise<RefereeInvite | null> {
  const invite = await peekRefereeInvite(token)
  if (!invite) return null
  return (await spendInvite(token)) ? invite : null
}

/** The live invitations of one organiser's referees, so the list can say who has been asked. */
export async function pendingRefereeInvites(organizerId: string): Promise<RefereeInvite[]> {
  const all = await scanAll<RefereeInvite>(TABLES.INVITES)
  const now = Date.now()
  return all.filter((invite) => {
    if (invite.kind !== 'referee' || invite.organizerId !== organizerId) return false
    const expiresAt = new Date(invite.expiresAt).getTime()
    return Number.isFinite(expiresAt) && expiresAt >= now
  })
}

/**
 * Takes away every outstanding link to one referee record.
 *
 * Issuing a second invitation is how a lost link is dealt with, and the first
 * keeps working for a fortnight unless it goes. Removing the referee, or the
 * record being taken up, ends them for the same reason.
 */
export async function deleteRefereeInvites(organizerId: string, refereeId: string): Promise<number> {
  const all = await scanAll<RefereeInvite>(TABLES.INVITES)
  const doomed = all.filter(
    (invite) =>
      invite.kind === 'referee' && invite.organizerId === organizerId && invite.refereeId === refereeId,
  )
  for (const invite of doomed) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.INVITES, Key: { token: invite.token } }))
  }
  return doomed.length
}
