#!/usr/bin/env node
/**
 * Delete an organizer and everything that hangs off it.
 *
 * The API has no cascade on purpose: `DELETE /admin/organizers/:id` removes one
 * row, and every tournament, club, entry, invitation and account that pointed
 * at it stays behind. Orphans are worse than the record they came from — they
 * are unreachable in the UI, they still count towards anything computed from a
 * table scan, and nothing in the app will ever show them to you again. So
 * removing an organizer for real is this script's job, not a button's.
 *
 * Run it from your own machine with your own AWS credentials. It prints what it
 * would delete and stops; nothing is written without --yes:
 *
 *   node scripts/delete-organizer.mjs org_1756952663916_54m3xarx6
 *   node scripts/delete-organizer.mjs org_1756952663916_54m3xarx6 --yes
 *
 * A tournament with a played result in it is treated as real data and blocks
 * the whole run. --force says you meant it anyway.
 *
 * Deletion is permanent: these tables have no point-in-time restore turned on
 * unless you turned it on yourself.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

const PREFIX = process.env.TABLE_PREFIX ?? 'football-tournaments'

const TABLES = {
  ORGANIZERS: process.env.TABLE_ORGANIZERS ?? `${PREFIX}-organizers`,
  TEAMS: process.env.TABLE_TEAMS ?? `${PREFIX}-teams`,
  TOURNAMENTS: process.env.TABLE_TOURNAMENTS ?? `${PREFIX}-tournaments`,
  USERS: process.env.TABLE_AUTH_USERS ?? `${PREFIX}-auth-users`,
  ENTRIES: process.env.TABLE_ENTRIES ?? `${PREFIX}-entries`,
  INVITES: process.env.TABLE_INVITES ?? `${PREFIX}-invites`,
}

const args = process.argv.slice(2)
const organizerId = args.find((arg) => !arg.startsWith('--'))
const confirmed = args.includes('--yes')
const force = args.includes('--force')

if (!organizerId) {
  console.error('Usage: node scripts/delete-organizer.mjs <organizerId> [--yes] [--force]')
  process.exit(1)
}

// Everything in this project lives in us-east-1; a shell without AWS_REGION set
// would otherwise fail with "Region is missing" before printing anything.
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1'
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }))

async function scanAll(TableName) {
  const items = []
  let ExclusiveStartKey
  do {
    const page = await ddb.send(new ScanCommand({ TableName, ExclusiveStartKey }))
    items.push(...(page.Items ?? []))
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return items
}

/** A score counts as played only when it is a number — undefined is an unplayed fixture. */
const playedCount = (tournament) =>
  (tournament.matches ?? []).filter(
    (match) => typeof match?.homeScore === 'number' && typeof match?.awayScore === 'number',
  ).length

const [organizers, tournaments, teams, users] = await Promise.all([
  scanAll(TABLES.ORGANIZERS),
  scanAll(TABLES.TOURNAMENTS),
  scanAll(TABLES.TEAMS),
  scanAll(TABLES.USERS),
])

const organizer = organizers.find((item) => item.id === organizerId)
if (!organizer) {
  console.error(`No organizer with id ${organizerId}. Nothing done.`)
  process.exit(1)
}

const theirTournaments = tournaments.filter((item) => item.organizerId === organizerId)
const theirTeams = teams.filter((item) => item.organizerId === organizerId)
const theirUsers = users.filter((item) => item.organizerId === organizerId)

// A club of this organizer may be registered in somebody else's competition, and
// a club of somebody else's may be registered in one of these. Both directions
// have to be found before anything is removed.
const teamIds = new Set(theirTeams.map((team) => team.id))
const tournamentIds = new Set(theirTournaments.map((tournament) => tournament.id))

const entries = []
for (const id of tournamentIds) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.ENTRIES,
      KeyConditionExpression: 'tournamentId = :tournamentId',
      ExpressionAttributeValues: { ':tournamentId': id },
    }),
  )
  entries.push(...(result.Items ?? []))
}
for (const id of teamIds) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.ENTRIES,
      IndexName: 'teamId-index',
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': id },
    }),
  )
  for (const entry of result.Items ?? []) {
    if (!entries.some((seen) => seen.tournamentId === entry.tournamentId && seen.teamId === entry.teamId)) {
      entries.push(entry)
    }
  }
}

const invites = (await scanAll(TABLES.INVITES)).filter(
  (invite) => invite.organizerId === organizerId || teamIds.has(invite.teamId),
)

// Managers of these clubs are not this organizer's accounts and are not deleted;
// the clubs simply stop being theirs, so the stale ids come off their record.
const managersToTrim = users.filter((user) =>
  (user.teamIds ?? []).some((id) => teamIds.has(id)),
)

// A club of this organizer sitting in someone else's competition would leave that
// competition holding an id that resolves to nothing.
const foreignTournamentsHolding = tournaments.filter(
  (tournament) =>
    tournament.organizerId !== organizerId &&
    (tournament.teamIds ?? []).some((id) => teamIds.has(id)),
)

console.log(`Organizer: ${organizer.name} (${organizer.id})`)
console.log('')
console.log(`Tournaments (${theirTournaments.length}):`)
for (const tournament of theirTournaments) {
  const played = playedCount(tournament)
  console.log(
    `  ${tournament.name} — ${(tournament.teamIds ?? []).length} teams, ` +
      `${(tournament.matches ?? []).length} fixtures, ${played} played` +
      (played > 0 ? '   <-- REAL RESULTS' : ''),
  )
}
console.log('')
console.log(`Clubs (${theirTeams.length}):`)
for (const team of theirTeams) {
  console.log(`  ${team.name} — ${(team.players ?? []).length} players`)
}
console.log('')
console.log(`Accounts belonging to this organizer (${theirUsers.length}):`)
for (const user of theirUsers) {
  console.log(`  ${user.email ?? user.id} (${user.role ?? 'no role'})`)
}
console.log('')
console.log(`Competition entries: ${entries.length}`)
console.log(`Invitations: ${invites.length}`)
console.log(`Club-manager accounts to unlink: ${managersToTrim.length}`)

if (foreignTournamentsHolding.length > 0) {
  console.log('')
  console.log('These competitions belong to somebody else and list a club of this organizer:')
  for (const tournament of foreignTournamentsHolding) {
    console.log(`  ${tournament.name} (${tournament.id})`)
  }
  console.log('Their teamIds will be left alone. Fix them in the app afterwards.')
}

const withResults = theirTournaments.filter((tournament) => playedCount(tournament) > 0)
if (withResults.length > 0 && !force) {
  console.log('')
  console.log(
    `Refusing: ${withResults.length} tournament(s) have played results. ` +
      'This does not look like test data. Pass --force if you are certain.',
  )
  process.exit(1)
}

if (!confirmed) {
  console.log('')
  console.log('Dry run. Nothing was deleted. Add --yes to do it.')
  process.exit(0)
}

for (const entry of entries) {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLES.ENTRIES,
      Key: { tournamentId: entry.tournamentId, teamId: entry.teamId },
    }),
  )
}
for (const invite of invites) {
  await ddb.send(new DeleteCommand({ TableName: TABLES.INVITES, Key: { token: invite.token } }))
}
for (const manager of managersToTrim) {
  const remaining = (manager.teamIds ?? []).filter((id) => !teamIds.has(id))
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.USERS,
      Key: { id: manager.id },
      UpdateExpression: 'SET teamIds = :teamIds',
      ExpressionAttributeValues: { ':teamIds': remaining },
    }),
  )
}
for (const tournament of theirTournaments) {
  await ddb.send(new DeleteCommand({ TableName: TABLES.TOURNAMENTS, Key: { id: tournament.id } }))
}
for (const team of theirTeams) {
  await ddb.send(new DeleteCommand({ TableName: TABLES.TEAMS, Key: { id: team.id } }))
}
for (const user of theirUsers) {
  await ddb.send(new DeleteCommand({ TableName: TABLES.USERS, Key: { id: user.id } }))
}
await ddb.send(new DeleteCommand({ TableName: TABLES.ORGANIZERS, Key: { id: organizerId } }))

console.log('')
console.log(
  `Deleted ${organizer.name}: ${theirTournaments.length} tournament(s), ${theirTeams.length} club(s), ` +
    `${theirUsers.length} account(s), ${entries.length} entry/entries, ${invites.length} invitation(s).`,
)
console.log('Images in S3 are not touched. The API caches organizers for a minute.')
