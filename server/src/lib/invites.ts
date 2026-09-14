import { ddb, DeleteCommand, GetCommand, PutCommand } from './ddb.js'
import { INVITE_TTL_MS, TABLES } from './env.js'
import { generateToken } from './passwords.js'

/**
 * One-time invitation tokens.
 *
 * Two things are invited on this system — somebody to run a club, and somebody
 * to run an organiser's competitions — and they share a table, a token shape
 * and a lifetime. What they must not share is a door. A token issued for one
 * kind must not be spendable at the other's claim route: an invitation to keep
 * a squad list up to date would otherwise open an account that runs a league.
 * So every item carries its `kind` and every read names the kind it expects.
 *
 * `kind` is absent on every invitation written before this field existed, and
 * all of those are club invitations, which is how `readInvite` reads a missing
 * one.
 */

export type InviteKind = 'team' | 'organizer'

/** What every invitation carries, whatever it invites somebody to. */
export type InviteBase = {
  token: string
  kind?: InviteKind
  createdBy: string
  /**
   * The address it was sent to, where there is one.
   *
   * An invitation sent to somebody is for them: the claim routes refuse an
   * account on any other address, or holding a link would be a way to open an
   * account at will, and account creation is otherwise the super admin's alone.
   */
  email?: string
  createdAt: string
  expiresAt: string
  /** In seconds, for DynamoDB's own TTL. */
  expiresAtEpoch: number
}

/** The parts of an invitation that do not depend on what is being invited to. */
export function inviteEnvelope(
  kind: InviteKind,
  createdBy: string,
  email?: string,
): InviteBase & { kind: InviteKind } {
  const expires = new Date(Date.now() + INVITE_TTL_MS)
  return {
    token: generateToken(),
    kind,
    createdBy,
    email,
    createdAt: new Date().toISOString(),
    expiresAt: expires.toISOString(),
    expiresAtEpoch: Math.floor(expires.getTime() / 1000),
  }
}

/**
 * Whether a stored item is an invitation of the kind being asked for.
 *
 * Written as a function of the record rather than a comparison at each call
 * site because the default matters and is easy to get wrong in either
 * direction: an old club invitation carries no `kind` and must still work, and
 * an organizer invitation must never answer a request for a club one.
 */
export function isInviteKind(item: { kind?: string } | null | undefined, kind: InviteKind): boolean {
  if (!item) return false
  return (item.kind ?? 'team') === kind
}

export async function putInvite(item: InviteBase): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLES.INVITES, Item: item }))
}

/** Reads an invitation without spending it. Null when it is expired, gone or of another kind. */
export async function readInvite<T extends InviteBase>(
  token: string,
  kind: InviteKind,
): Promise<T | null> {
  if (!token) return null
  const result = await ddb.send(new GetCommand({ TableName: TABLES.INVITES, Key: { token } }))
  const invite = result.Item as T | undefined
  if (!invite) return null
  if (!isInviteKind(invite, kind)) return null
  // Asked the way round that fails closed. `NaN < Date.now()` is false, so a
  // row with a missing or malformed expiry read as valid forever — and the
  // table's own TTL, which is the backstop, is not prompt.
  const expiresAt = new Date(invite.expiresAt).getTime()
  return Number.isFinite(expiresAt) && expiresAt >= Date.now() ? invite : null
}

/**
 * Spends it. An invitation opens one door, once.
 *
 * The delete is conditional and its success is the only thing that counts as
 * having spent the invitation. Reading first and deleting unconditionally meant
 * "once" was only true if nobody was in a hurry: twenty simultaneous claims all
 * read the same live invitation and all went through, each creating an account.
 */
export async function spendInvite(token: string): Promise<boolean> {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLES.INVITES,
        Key: { token },
        // `token` is a DynamoDB reserved word and cannot appear in a
        // ConditionExpression by name.
        ConditionExpression: 'attribute_exists(#token)',
        ExpressionAttributeNames: { '#token': 'token' },
      }),
    )
    return true
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false
    throw error
  }
}
