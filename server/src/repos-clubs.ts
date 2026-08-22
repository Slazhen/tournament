import { ddb, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from './lib/ddb.js'
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
}

export async function createInvite(
  team: Team,
  createdBy: string,
  email?: string,
): Promise<TeamInvite> {
  const expires = new Date(Date.now() + INVITE_TTL_MS)

  const invite: TeamInvite = {
    token: generateToken(),
    teamId: team.id,
    teamName: team.name,
    organizerId: team.organizerId,
    createdBy,
    email,
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

/** Spends it. An invitation opens one door, once. */
export async function consumeInvite(token: string): Promise<TeamInvite | null> {
  const invite = await peekInvite(token)
  if (!invite) return null
  await ddb.send(new DeleteCommand({ TableName: TABLES.INVITES, Key: { token } }))
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
  const managers = new Set(team.managerUserIds ?? [])
  managers.add(user.id)

  const teams = new Set(user.teamIds ?? [])
  teams.add(team.id)

  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.TEAMS,
      Key: { id: team.id },
      UpdateExpression: 'SET managerUserIds = :managers',
      ExpressionAttributeValues: { ':managers': [...managers] },
    }),
  )

  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.AUTH_USERS,
      Key: { id: user.id },
      UpdateExpression: 'SET teamIds = :teams',
      ExpressionAttributeValues: { ':teams': [...teams] },
    }),
  )
}

export async function unlinkManagerFromTeam(userId: string, team: Team): Promise<void> {
  const managers = (team.managerUserIds ?? []).filter((id) => id !== userId)

  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.TEAMS,
      Key: { id: team.id },
      UpdateExpression: 'SET managerUserIds = :managers',
      ExpressionAttributeValues: { ':managers': managers },
    }),
  )

  const result = await ddb.send(new GetCommand({ TableName: TABLES.AUTH_USERS, Key: { id: userId } }))
  const user = result.Item as AuthUser | undefined
  if (!user) return

  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.AUTH_USERS,
      Key: { id: userId },
      UpdateExpression: 'SET teamIds = :teams',
      ExpressionAttributeValues: {
        ':teams': (user.teamIds ?? []).filter((id) => id !== team.id),
      },
    }),
  )
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
}

export async function putEntry(entry: Entry): Promise<Entry> {
  await ddb.send(new PutCommand({ TableName: TABLES.ENTRIES, Item: entry }))
  return entry
}

export async function getEntry(tournamentId: string, teamId: string): Promise<Entry | null> {
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.ENTRIES, Key: { tournamentId, teamId } }),
  )
  return (result.Item as Entry | undefined) ?? null
}

export async function entriesForTournament(tournamentId: string): Promise<Entry[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.ENTRIES,
      KeyConditionExpression: 'tournamentId = :tournamentId',
      ExpressionAttributeValues: { ':tournamentId': tournamentId },
    }),
  )
  return (result.Items ?? []) as Entry[]
}

export async function entriesForTeam(teamId: string): Promise<Entry[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.ENTRIES,
      IndexName: 'teamId-index',
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': teamId },
    }),
  )
  return (result.Items ?? []) as Entry[]
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
