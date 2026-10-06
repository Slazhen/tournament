import { ddb, DeleteCommand, QueryCommand, scanAll, UpdateCommand } from './lib/ddb.js'
import { TABLES } from './lib/env.js'
import { invalidate } from './lib/cache.js'
import {
  inviteEnvelope,
  putInvite,
  readInvite,
  spendInvite,
  type InviteBase,
} from './lib/invites.js'
import type { AuthUser, Organizer } from './lib/types.js'

/**
 * Invitations to help run an organiser, and the account writes that taking one
 * up or being removed makes.
 *
 * A kind of its own rather than `organizer`: the super admin's invitation to
 * an organiser is one live link per organiser, and issuing a second takes the
 * first away. Helpers are several people at once, so their links live side by
 * side, one per address, and must not be swept up by that rule or sweep it.
 */
export type HelperInvite = InviteBase & {
  kind: 'organizer_helper'
  organizerId: string
  /** Copied for the claim page, as every other invitation copies its names. */
  organizerName: string
  /** Required here, where the base type leaves it optional. */
  email: string
}

export async function createHelperInvite(
  organizer: Organizer,
  createdBy: string,
  email: string,
): Promise<HelperInvite> {
  const invite: HelperInvite = {
    ...inviteEnvelope('organizer_helper', createdBy, email),
    kind: 'organizer_helper',
    organizerId: organizer.id,
    organizerName: organizer.name,
    email,
  }
  await putInvite(invite)
  return invite
}

export async function peekHelperInvite(token: string): Promise<HelperInvite | null> {
  return readInvite<HelperInvite>(token, 'organizer_helper')
}

export async function consumeHelperInvite(token: string): Promise<HelperInvite | null> {
  const invite = await peekHelperInvite(token)
  if (!invite) return null
  return (await spendInvite(token)) ? invite : null
}

/** One organiser's live helper links. Expired ones are filtered: the table's TTL is not prompt. */
export async function pendingHelperInvites(organizerId: string): Promise<HelperInvite[]> {
  const all = await scanAll<HelperInvite>(TABLES.INVITES)
  const now = Date.now()
  return all.filter((invite) => {
    if (invite.kind !== 'organizer_helper' || invite.organizerId !== organizerId) return false
    const expiresAt = new Date(invite.expiresAt).getTime()
    return Number.isFinite(expiresAt) && expiresAt >= now
  })
}

/**
 * Takes away an organiser's helper links: to one address, or all of them.
 *
 * One live link per address, because a second invitation is how a lost link is
 * dealt with and the first must not keep working beside it. All of them when
 * the organiser goes.
 */
export async function deleteHelperInvites(organizerId: string, email?: string): Promise<number> {
  const all = await scanAll<HelperInvite>(TABLES.INVITES)
  const doomed = all.filter(
    (invite) =>
      invite.kind === 'organizer_helper' &&
      invite.organizerId === organizerId &&
      (email === undefined || invite.email === email),
  )
  for (const invite of doomed) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.INVITES, Key: { token: invite.token } }))
  }
  return doomed.length
}

/**
 * Every open invitation, of any kind, that one account wrote for this
 * organiser: clubs, referees, other helpers.
 *
 * Removing a helper has to take these with them, except the ones they wrote
 * as a club's head. A club link with no address
 * on it is a door into one of the organiser's clubs, and one written by
 * somebody who has since been removed would let them walk back in on another
 * login.
 */
export async function deleteInvitesWrittenBy(organizerId: string, userId: string): Promise<number> {
  const all = await scanAll<InviteBase & { organizerId?: string; issuedBy?: string }>(TABLES.INVITES)
  // Not a club's own links (`issuedBy: 'club'`): a helper who is also a club's
  // head wrote those as the head, and keeps the club.
  const doomed = all.filter(
    (invite) =>
      invite.organizerId === organizerId && invite.createdBy === userId && invite.issuedBy !== 'club',
  )
  for (const invite of doomed) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.INVITES, Key: { token: invite.token } }))
  }
  return doomed.length
}

/**
 * The account on an address, switched off or not.
 *
 * `findUserByCredential` filters on `isActive`, which is right for signing in
 * and wrong here: a removed helper is a switched-off account, and the question
 * is what is on the address, not whether it can sign in. No filter, so
 * `Limit: 1` reads one row and means it.
 */
export async function anyAccountOnEmail(email: string): Promise<AuthUser | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.AUTH_USERS,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    }),
  )
  return (result.Items?.[0] as AuthUser | undefined) ?? null
}

const isConditionFailure = (error: unknown) =>
  (error as { name?: string }).name === 'ConditionalCheckFailedException'

/**
 * Turns a club manager's account into a helper's, keeping its clubs.
 *
 * Conditional on it still being a live club manager's account: the read that
 * decided this is a moment old, and the same account taking up another
 * organiser's link in another tab must not end up belonging to both.
 */
export async function makeClubManagerHelper(userId: string, organizerId: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: userId },
        UpdateExpression: 'SET #role = :organizer, #organizerId = :organizerId, #since = :now',
        ConditionExpression: '#role = :manager AND #isActive = :true',
        ExpressionAttributeNames: {
          '#role': 'role',
          '#organizerId': 'organizerId',
          '#isActive': 'isActive',
          '#since': 'organizerSince',
        },
        ExpressionAttributeValues: {
          ':organizer': 'organizer',
          ':manager': 'team_manager',
          ':organizerId': organizerId,
          ':true': true,
          ':now': new Date().toISOString(),
        },
      }),
    )
    return true
  } catch (error) {
    if (isConditionFailure(error)) return false
    throw error
  }
}

/**
 * Brings a removed helper back, with the password the account already has.
 *
 * Never a password chosen at the link: the owner who issued it holds the link
 * as well, and would otherwise be able to sign in as the person they removed.
 * `organizerSince` starts again, because the clubs this account linked to
 * while it was away were not linked as this organiser's helper.
 */
export async function reactivateHelper(userId: string, organizerId: string): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: userId },
        UpdateExpression: 'SET #isActive = :true, #since = :now',
        ConditionExpression:
          '#role = :organizer AND #organizerId = :organizerId AND #isActive = :false',
        ExpressionAttributeNames: {
          '#isActive': 'isActive',
          '#since': 'organizerSince',
          '#role': 'role',
          '#organizerId': 'organizerId',
        },
        ExpressionAttributeValues: {
          ':true': true,
          ':false': false,
          ':now': new Date().toISOString(),
          ':organizer': 'organizer',
          ':organizerId': organizerId,
        },
      }),
    )
    return true
  } catch (error) {
    if (isConditionFailure(error)) return false
    throw error
  }
}

/**
 * Takes the organiser away from an account: back to a club manager if it runs
 * clubs, switched off if it does not (`revocationOf` says why).
 *
 * Both conditional on the account still belonging to this organiser, so a
 * removal that crosses with the account being handed the organiser, or being
 * removed in another tab, writes nothing.
 */
export async function revokeHelper(
  userId: string,
  organizerId: string,
  how: 'demote' | 'deactivate',
): Promise<boolean> {
  const names: Record<string, string> = { '#role': 'role', '#organizerId': 'organizerId' }
  const values: Record<string, unknown> = { ':organizer': 'organizer', ':organizerId': organizerId }
  let update: string
  if (how === 'demote') {
    update = 'SET #role = :manager REMOVE #organizerId'
    values[':manager'] = 'team_manager'
  } else {
    update = 'SET #isActive = :false'
    names['#isActive'] = 'isActive'
    values[':false'] = false
  }
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: userId },
        UpdateExpression: update,
        ConditionExpression: '#role = :organizer AND #organizerId = :organizerId',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    )
    return true
  } catch (error) {
    if (isConditionFailure(error)) return false
    throw error
  }
}

/**
 * Names the owner.
 *
 * Conditional on the stored value being what the caller read, absent included:
 * an owner who handed the organiser on in another tab was still the owner in
 * this request's read, and must not then hand it on a second time.
 */
export async function setOrganizerOwner(
  organizerId: string,
  userId: string,
  storedOwnerId: string | undefined,
): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.ORGANIZERS,
        Key: { id: organizerId },
        UpdateExpression: 'SET #owner = :userId',
        ConditionExpression:
          storedOwnerId === undefined
            ? 'attribute_exists(#id) AND attribute_not_exists(#owner)'
            : 'attribute_exists(#id) AND #owner = :stored',
        ExpressionAttributeNames: { '#owner': 'ownerUserId', '#id': 'id' },
        ExpressionAttributeValues:
          storedOwnerId === undefined
            ? { ':userId': userId }
            : { ':userId': userId, ':stored': storedOwnerId },
      }),
    )
    invalidate('organizers:')
    return true
  } catch (error) {
    if (isConditionFailure(error)) return false
    throw error
  }
}
