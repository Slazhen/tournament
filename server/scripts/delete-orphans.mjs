#!/usr/bin/env node
/**
 * Deletes tournaments, clubs, entries and invitations whose organizer no longer
 * exists.
 *
 * These are what the old delete-organizer route left behind: it removed the
 * organizer row and nothing else, so the competitions stayed on the public site
 * with nobody able to administer them, and the clubs sat in a list no screen
 * shows. The route no longer works that way; this clears up what it did before
 * it was fixed.
 *
 * Run it from your own machine with your own AWS credentials. It prints what it
 * would delete and stops, unless you pass --apply:
 *
 *   node scripts/delete-orphans.mjs
 *   node scripts/delete-orphans.mjs --apply
 *
 * Two things it deliberately will not do. A club still playing in a competition
 * whose organizer is alive is left alone and reported instead — deleting it
 * would leave that organizer's fixtures pointing at nothing. And a row with no
 * `organizerId` at all is not treated as an orphan: that is a missing field,
 * not a deleted organizer, and the two look identical to a lookup.
 *
 * Images in S3 are not touched: they cost almost nothing, and deleting one that
 * another club is also using cannot be undone.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_ORGANIZERS = process.env.TABLE_ORGANIZERS ?? 'football-tournaments-organizers'
const TABLE_TEAMS = process.env.TABLE_TEAMS ?? 'football-tournaments-teams'
const TABLE_TOURNAMENTS = process.env.TABLE_TOURNAMENTS ?? 'football-tournaments-tournaments'
const TABLE_ENTRIES = process.env.TABLE_ENTRIES ?? 'football-tournaments-entries'
const TABLE_INVITES = process.env.TABLE_INVITES ?? 'football-tournaments-invites'

const apply = process.argv.includes('--apply')
const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

async function scanAll(TableName, ProjectionExpression, ExpressionAttributeNames) {
  const items = []
  let ExclusiveStartKey
  do {
    const page = await ddb.send(
      new ScanCommand({ TableName, ProjectionExpression, ExpressionAttributeNames, ExclusiveStartKey }),
    )
    items.push(...(page.Items ?? []))
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return items
}

// Which stack this is about to rewrite. Exporting one table name for a test
// stack and forgetting the rest would otherwise read every organizer from one
// database and call the whole of another database orphaned.
console.log(`Region: ${await client.config.region()}`)
console.log(`Tables: ${[TABLE_ORGANIZERS, TABLE_TEAMS, TABLE_TOURNAMENTS, TABLE_ENTRIES, TABLE_INVITES].join(', ')}\n`)

const organizers = await scanAll(TABLE_ORGANIZERS, 'id')
const alive = new Set(organizers.map((organizer) => organizer.id))

const tournaments = await scanAll(TABLE_TOURNAMENTS, 'id, #name, organizerId, teamIds', {
  '#name': 'name',
})
const teams = await scanAll(TABLE_TEAMS, 'id, #name, organizerId, managerUserIds', {
  '#name': 'name',
})
const entries = await scanAll(TABLE_ENTRIES, 'tournamentId, teamId')
const invites = await scanAll(TABLE_INVITES, '#token, teamId, organizerId', { '#token': 'token' })

const orphaned = (row) => typeof row.organizerId === 'string' && row.organizerId !== '' && !alive.has(row.organizerId)
const unowned = (row) => typeof row.organizerId !== 'string' || row.organizerId === ''

const orphanedTournaments = tournaments.filter(orphaned)
const doomedTournamentIds = new Set(orphanedTournaments.map((t) => t.id))

// A club playing in a competition that survives is not ours to delete.
const survivingTournaments = tournaments.filter((t) => !doomedTournamentIds.has(t.id))
const stillPlaying = new Set(survivingTournaments.flatMap((t) => t.teamIds ?? []))

const orphanedTeams = teams.filter((team) => orphaned(team) && !stillPlaying.has(team.id))
const keptTeams = teams.filter((team) => orphaned(team) && stillPlaying.has(team.id))
const doomedTeamIds = new Set(orphanedTeams.map((t) => t.id))

const orphanedEntries = entries.filter(
  (entry) => doomedTournamentIds.has(entry.tournamentId) || doomedTeamIds.has(entry.teamId),
)
// An invitation dies with the club it names or with the organizer that wrote it:
// a link written by an organizer who no longer exists still hands over a club.
const orphanedInvites = invites.filter(
  (invite) => doomedTeamIds.has(invite.teamId) || orphaned(invite),
)

const unownedRows = [...tournaments.filter(unowned), ...teams.filter(unowned)]

console.log(`Organizers that exist: ${alive.size}`)
console.log(`\nTournaments to delete (${orphanedTournaments.length}):`)
for (const t of orphanedTournaments) console.log(`  ${t.name}  [${t.id}] of ${t.organizerId}`)
console.log(`\nClubs to delete (${orphanedTeams.length}):`)
for (const t of orphanedTeams) {
  const managers = (t.managerUserIds ?? []).length
  console.log(`  ${t.name}  [${t.id}] of ${t.organizerId}${managers ? `, ${managers} manager(s) lose it` : ''}`)
}
if (keptTeams.length > 0) {
  console.log(`\nClubs kept — their organizer is gone but they still play somewhere (${keptTeams.length}):`)
  for (const t of keptTeams) console.log(`  ${t.name}  [${t.id}] — give them an organizer by hand`)
}
if (unownedRows.length > 0) {
  console.log(`\nRows with no organizerId at all, left alone (${unownedRows.length}):`)
  for (const row of unownedRows) console.log(`  ${row.name ?? '(unnamed)'}  [${row.id}]`)
}
console.log(`\nEntries to delete: ${orphanedEntries.length}`)
console.log(`Invitations to delete: ${orphanedInvites.length}`)

if (!apply) {
  console.log('\nNothing was deleted. Run again with --apply to do it.')
  process.exit(0)
}

for (const entry of orphanedEntries) {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_ENTRIES,
      Key: { tournamentId: entry.tournamentId, teamId: entry.teamId },
    }),
  )
}
for (const invite of orphanedInvites) {
  await ddb.send(new DeleteCommand({ TableName: TABLE_INVITES, Key: { token: invite.token } }))
}
for (const tournament of orphanedTournaments) {
  await ddb.send(new DeleteCommand({ TableName: TABLE_TOURNAMENTS, Key: { id: tournament.id } }))
}
for (const team of orphanedTeams) {
  await ddb.send(new DeleteCommand({ TableName: TABLE_TEAMS, Key: { id: team.id } }))
}

console.log('\nDone.')
