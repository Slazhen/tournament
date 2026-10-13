#!/usr/bin/env node
/**
 * Put every group-stage fixture of one season back under the group its clubs
 * are in.
 *
 * `groupIndex` used to be the slot the generator drew a fixture in, and
 * changing the clubs on a fixture by hand left it where it was (CLAUDE.md, "A
 * fixture's group is its two clubs"). The API now derives it on every write;
 * this is for the records written before that.
 *
 *   node scripts/fix-group-indexes.mjs <tournamentId>            # prints the plan
 *   node scripts/fix-group-indexes.mjs <tournamentId> --apply    # writes it
 *
 * One write per fixture, setting `groupIndex` and nothing else, conditional on
 * the fixture still holding the id and the two clubs this script read - so a
 * fixture somebody re-paired in the meantime is skipped and reported, not
 * filed under a group worked out from clubs it no longer has. Only fixtures in
 * `matches`: the hand-built playoff rounds have no group.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_TOURNAMENTS = process.env.TABLE_TOURNAMENTS ?? 'football-tournaments-tournaments'
const TABLE_AUDIT = process.env.TABLE_AUDIT ?? 'football-tournaments-audit'

const [tournamentId] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const apply = process.argv.includes('--apply')
if (!tournamentId) {
  console.error('Usage: node scripts/fix-group-indexes.mjs <tournamentId> [--apply]')
  process.exit(1)
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const { Item: tournament } = await ddb.send(
  new GetCommand({ TableName: TABLE_TOURNAMENTS, Key: { id: tournamentId }, ConsistentRead: true }),
)
if (!tournament) {
  console.error(`No tournament ${tournamentId}`)
  process.exit(1)
}

const config = tournament.format?.groupsWithDivisionsConfig
const groups = tournament.format?.mode === 'groups_with_divisions' && Array.isArray(config?.groups) ? config.groups : []
if (groups.length === 0) {
  console.error(`${tournament.name} has no stored groups; nothing to derive from.`)
  process.exit(1)
}

const groupOf = (home, away) => {
  const index = groups.findIndex((ids) => Array.isArray(ids) && ids.includes(home) && ids.includes(away))
  return index >= 0 ? index + 1 : undefined
}

const plan = []
const matches = Array.isArray(tournament.matches) ? tournament.matches : []
matches.forEach((match, index) => {
  if (!match || typeof match !== 'object' || match.isPlayoff) return
  const number = groupOf(match.homeTeamId, match.awayTeamId)
  if (number === undefined) {
    console.log(`  left alone, clubs not in one group: ${match.id}`)
    return
  }
  if (match.groupIndex === number) return
  plan.push({ index, match, number })
})

console.log(`${tournament.name}: ${plan.length} of ${matches.length} fixture(s) to renumber`)
for (const { match, number } of plan) console.log(`  ${match.id}: ${match.groupIndex ?? '-'} -> ${number}`)

if (!apply) {
  console.log('\nDry run. Re-run with --apply to write.')
  process.exit(0)
}

let written = 0
for (const { index, match, number } of plan) {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_TOURNAMENTS,
        Key: { id: tournamentId },
        UpdateExpression: `SET #matches[${index}].#groupIndex = :number`,
        ConditionExpression:
          `#matches[${index}].#id = :id AND #matches[${index}].#home = :home AND #matches[${index}].#away = :away`,
        ExpressionAttributeNames: {
          '#matches': 'matches',
          '#groupIndex': 'groupIndex',
          '#id': 'id',
          '#home': 'homeTeamId',
          '#away': 'awayTeamId',
        },
        ExpressionAttributeValues: {
          ':number': number,
          ':id': match.id,
          ':home': match.homeTeamId,
          ':away': match.awayTeamId,
        },
      }),
    )
    written++
  } catch (error) {
    if (error.name !== 'ConditionalCheckFailedException') throw error
    console.log(`  skipped, changed since it was read: ${match.id}`)
  }
}

if (written > 0) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_AUDIT,
      Item: {
        pk: 'log',
        at: `${new Date().toISOString()}#groups`,
        actorId: 'script:fix-group-indexes',
        actorEmail: 'scripts/fix-group-indexes.mjs',
        actorRole: 'super_admin',
        action: 'tournament.update',
        entity: 'tournament',
        entityId: tournamentId,
        organizerId: tournament.organizerId,
        summary: `Renumbered the groups of ${written} fixture(s) in ${tournament.name} from the clubs on them`,
      },
    }),
  )
}

console.log(`\nWrote ${written} of ${plan.length}.`)
