import {
  ddb,
  DeleteCommand,
  GetCommand,
  PutCommand,
  queryAll,
  scanAll,
  UpdateCommand,
} from './lib/ddb.js'
import { INVITE_TTL_MS, TABLES } from './lib/env.js'
import { generateId, generateToken } from './lib/passwords.js'
import type { AuthUser, Team } from './lib/types.js'

/**
 * Clubs, the people who run them, and their applications to competitions.
 *
 * Two ideas live here, and keeping them apart is what makes the permissions
 * simple: a **club** is the club — its name, crest and squad — and belongs to
 * whoever runs it; an **entry** is that club's participation in one
 * competition, and belongs to the organizer of that competition.
 */

/* ------------------------------------------------------------------ *
 * Invitations
 * ------------------------------------------------------------------ */

export type TeamInvite = {
  token: string
  teamId: string
  teamName: string
  organizerId: string
  createdBy: string
  email?: string
  createdAt: string
  expiresAt: string
  expiresAtEpoch: number
  /**
   * The competition the club joins the moment the invitation is taken up.
   *
   * An organizer inviting a coach from inside a competition is not only handing
   * over a club, they are entering it: making the manager apply afterwards, to
   * the person who just invited them, is a decision already taken. The name is
   * copied so the claim page can say where the club is going without a second
   * read, and so a competition renamed in the meantime still reads sensibly.
   */
  tournamentId?: string
  tournamentName?: string
}

export async function createInvite(
  team: Team,
  createdBy: string,
  options: { email?: string; tournament?: { id: string; name: string } } = {},
): Promise<TeamInvite> {
  const expires = new Date(Date.now() + INVITE_TTL_MS)

  const invite: TeamInvite = {
    token: generateToken(),
    teamId: team.id,
    teamName: team.name,
    organizerId: team.organizerId,
    createdBy,
    email: options.email,
    tournamentId: options.tournament?.id,
    tournamentName: options.tournament?.name,
    createdAt: new Date().toISOString(),
    expiresAt: expires.toISOString(),
    expiresAtEpoch: Math.floor(expires.getTime() / 1000),
  }

  await ddb.send(new PutCommand({ TableName: TABLES.INVITES, Item: invite }))
  return invite
}

/** Reads an invitation without spending it, to show who is being invited where. */
export async function peekInvite(token: string): Promise<TeamInvite | null> {
  if (!token) return null
  const result = await ddb.send(new GetCommand({ TableName: TABLES.INVITES, Key: { token } }))
  const invite = result.Item as TeamInvite | undefined
  if (!invite) return null
  return new Date(invite.expiresAt).getTime() < Date.now() ? null : invite
}

/**
 * Spends it. An invitation opens one door, once.
 *
 * The delete is conditional and its success is the only thing that counts as
 * having spent the invitation. Reading first and deleting unconditionally meant
 * "once" was only true if nobody was in a hurry: twenty simultaneous claims all
 * read the same live invitation and all went through, each creating an account
 * — and account creation is otherwise the super admin's alone — and each adding
 * a manager to somebody else's club.
 */
export async function consumeInvite(token: string): Promise<TeamInvite | null> {
  const invite = await peekInvite(token)
  if (!invite) return null

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLES.INVITES,
        Key: { token },
        ConditionExpression: 'attribute_exists(token)',
      }),
    )
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return null
    throw error
  }

  return invite
}

/* ------------------------------------------------------------------ *
 * Who runs a club
 * ------------------------------------------------------------------ */

/**
 * Records that a person runs a club, on both records at once.
 *
 * The link is stored on the team and on the user because both directions are
 * asked constantly — "who may edit this club" and "which clubs are mine" — and
 * neither should cost a table scan. Writing them anywhere but here is how they
 * would drift apart.
 */
export async function linkManagerToTeam(user: AuthUser, team: Team): Promise<void> {
  // Both lists are appended to in place rather than written from a copy read a
  // moment ago. The whole-list write this replaces lost data in two directions:
  // two people claiming clubs at the same time dropped one of them, and a claim
  // overlapping the organizer removing a manager put the removed manager back —
  // and `managerUserIds` is the list permissions are decided from, so that
  // handed a club back to somebody who had just lost it.
  //
  // The date map has to exist before a key inside it can be written, and the
  // two cannot be one expression: DynamoDB rejects overlapping paths.
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.TEAMS,
      Key: { id: team.id },
      UpdateExpression: 'SET managerLinkedAt = if_not_exists(managerLinkedAt, :emptyMap)',
      ExpressionAttributeValues: { ':emptyMap': {} },
    }),
  )

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.TEAMS,
        Key: { id: team.id },
        UpdateExpression:
          'SET managerUserIds = list_append(if_not_exists(managerUserIds, :emptyList), :one), managerLinkedAt.#user = :at',
        ConditionExpression:
          'attribute_not_exists(managerUserIds) OR NOT contains(managerUserIds, :userId)',
        ExpressionAttributeNames: { '#user': user.id },
        ExpressionAttributeValues: {
          ':emptyList': [],
          ':one': [user.id],
          ':userId': user.id,
          ':at': new Date().toISOString(),
        },
      }),
    )
  } catch (error) {
    // Already runs this club. The link and the date it came with are there, and
    // opening a second invitation should not move the date.
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: user.id },
        UpdateExpression: 'SET teamIds = list_append(if_not_exists(teamIds, :emptyList), :one)',
        ConditionExpression: 'attribute_not_exists(teamIds) OR NOT contains(teamIds, :teamId)',
        ExpressionAttributeValues: {
          ':emptyList': [],
          ':one': [team.id],
          ':teamId': team.id,
        },
      }),
    )
  } catch (error) {
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
  }
}

/**
 * Takes somebody off a club, on both records.
 *
 * Removed by index with the index checked in the same request, the way one
 * player is edited inside a squad. Writing the filtered list back whole would
 * erase a manager linked in the same moment — and the reverse of that mistake,
 * a whole-list write on the linking side, is the one that used to restore a
 * manager the organizer had just removed.
 */
export async function unlinkManagerFromTeam(userId: string, team: Team): Promise<void> {
  let current: Team | null = team

  for (let attempt = 0; attempt < 3 && current; attempt++) {
    const index = (current.managerUserIds ?? []).indexOf(userId)
    if (index === -1) break

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.TEAMS,
          Key: { id: team.id },
          UpdateExpression: `REMOVE managerUserIds[${index}], managerLinkedAt.#user`,
          ConditionExpression: `managerUserIds[${index}] = :userId`,
          ExpressionAttributeNames: { '#user': userId },
          ExpressionAttributeValues: { ':userId': userId },
        }),
      )
      break
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      // Somebody else moved the list between the read and the write. Read it
      // again rather than removing whatever now sits at that position.
      const fresh = await ddb.send(new GetCommand({ TableName: TABLES.TEAMS, Key: { id: team.id } }))
      current = (fresh.Item as Team | undefined) ?? null
    }
  }

  const result = await ddb.send(new GetCommand({ TableName: TABLES.AUTH_USERS, Key: { id: userId } }))
  let account = result.Item as AuthUser | undefined
  if (!account) return

  for (let attempt = 0; attempt < 3 && account; attempt++) {
    const index = (account.teamIds ?? []).indexOf(team.id)
    if (index === -1) break

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.AUTH_USERS,
          Key: { id: userId },
          UpdateExpression: `REMOVE teamIds[${index}]`,
          ConditionExpression: `teamIds[${index}] = :teamId`,
          ExpressionAttributeValues: { ':teamId': team.id },
        }),
      )
      break
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      const fresh = await ddb.send(
        new GetCommand({ TableName: TABLES.AUTH_USERS, Key: { id: userId } }),
      )
      account = fresh.Item as AuthUser | undefined
    }
  }
}

/* ------------------------------------------------------------------ *
 * Entries: a club's participation in one competition
 * ------------------------------------------------------------------ */

export type EntryStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

export type Entry = {
  tournamentId: string
  teamId: string
  organizerId: string
  status: EntryStatus
  requestedBy: string
  requestedByRole: string
  decidedBy?: string
  createdAt: string
  decidedAt?: string
  /** Why an application was turned down, when the organizer says. */
  note?: string
  /**
   * The decision this application replaced, when a club asks again after having
   * been turned down. One row holds one status, so without these the organizer
   * would see a fresh request with no sign they had already answered it, and
   * the reason they gave would be gone.
   */
  previousNote?: string
  previousDecidedAt?: string
}

/**
 * Writes an entry, optionally only while it is still in the state the caller
 * read.
 *
 * This is a whole-item Put, and both sides can write the same row: the club
 * applies, the organizer decides. Passing `expected` makes the write fail
 * rather than land on top of a decision made in between — a manager pressing
 * "apply again" at the moment the organizer pressed "accept" would otherwise
 * put the row back to 'pending' while the club is already in the competition.
 * `null` means the row must not exist at all.
 */
export async function putEntry(entry: Entry, expected?: EntryStatus | null): Promise<Entry> {
  const condition =
    expected === undefined
      ? {}
      : expected === null
        ? { ConditionExpression: 'attribute_not_exists(tournamentId)' }
        : {
            ConditionExpression: '#status = :expected',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':expected': expected },
          }

  await ddb.send(new PutCommand({ TableName: TABLES.ENTRIES, Item: entry, ...condition }))
  return entry
}

export async function getEntry(tournamentId: string, teamId: string): Promise<Entry | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.ENTRIES, Key: { tournamentId, teamId } }),
  )
  return (result.Item as Entry | undefined) ?? null
}

export async function entriesForTournament(tournamentId: string): Promise<Entry[]> {
  return queryAll<Entry>({
    TableName: TABLES.ENTRIES,
    KeyConditionExpression: 'tournamentId = :tournamentId',
    ExpressionAttributeValues: { ':tournamentId': tournamentId },
  })
}

/**
 * Invitations an organizer issued, which die with them.
 *
 * An invitation is a link that hands a club to whoever opens it, and claiming
 * one creates an account. Left behind, an invitation written by a deleted
 * organizer would still work a fortnight later — against a club that has since
 * moved to somebody else, who never invited anybody. Deleting the organizer's
 * sessions and leaving these would be closing one door and leaving the other
 * open.
 */
export async function deleteInvitesOfOrganizer(organizerId: string): Promise<number> {
  const all = await scanAll<TeamInvite>(TABLES.INVITES)
  const doomed = all.filter((invite) => invite.organizerId === organizerId)
  for (const invite of doomed) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.INVITES, Key: { token: invite.token } }))
  }
  return doomed.length
}

/**
 * Removes every application to a competition that is going away.
 *
 * An entry is keyed by the tournament it belongs to, so once the tournament is
 * deleted the row is unreachable through the interface but still counts against
 * the club: `entriesForTeam` keeps returning it, and the club shows as pending
 * in a competition nobody can open.
 */
export async function deleteEntriesForTournament(tournamentId: string): Promise<number> {
  const entries = await entriesForTournament(tournamentId)
  for (const entry of entries) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLES.ENTRIES,
        Key: { tournamentId: entry.tournamentId, teamId: entry.teamId },
      }),
    )
  }
  return entries.length
}

export async function entriesForTeam(teamId: string): Promise<Entry[]> {
  return queryAll<Entry>({
    TableName: TABLES.ENTRIES,
    IndexName: 'teamId-index',
    KeyConditionExpression: 'teamId = :teamId',
    ExpressionAttributeValues: { ':teamId': teamId },
  })
}

export async function decideEntry(
  tournamentId: string,
  teamId: string,
  status: EntryStatus,
  decidedBy: string,
  note?: string,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.ENTRIES,
      Key: { tournamentId, teamId },
      UpdateExpression:
        'SET #status = :status, decidedBy = :decidedBy, decidedAt = :decidedAt, note = :note',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':decidedBy': decidedBy,
        ':decidedAt': new Date().toISOString(),
        ':note': note ?? null,
      },
    }),
  )
}

export const newEntryId = generateId
