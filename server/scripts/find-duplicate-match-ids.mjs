#!/usr/bin/env node
/**
 * Competitions holding one match id twice.
 *
 * A fixture is written by its id — a score, a teamsheet — and until now the
 * lookup took the first match that carried it. Ids of hand-built playoff rounds
 * have been generated from the round number and the position in it
 * (`progressive_2_0_<teamId>`), and deleting a round does not renumber the ones
 * after it, so a season can end up holding the same id twice. `locateMatch` now
 * refuses rather than guessing, which means any such fixture stops accepting a
 * result until its id is made unique.
 *
 * Run this before deploying that change, with your own AWS credentials:
 *
 *   node scripts/find-duplicate-match-ids.mjs
 *
 * It only reads. Nothing is written, and nothing is repaired: what to do with a
 * clash depends on which of the two fixtures the results belong to, and that is
 * a decision, not a migration.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'

const TABLE = process.env.TABLE_TOURNAMENTS ?? 'football-tournaments-tournaments'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

async function scanAll() {
  const items = []
  let ExclusiveStartKey
  do {
    const page = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }))
    items.push(...(page.Items ?? []))
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return items
}

/** Every fixture a competition holds, and where it is stored. */
function fixtures(tournament) {
  const out = []

  for (const [index, match] of (tournament.matches ?? []).entries()) {
    if (match?.id) out.push({ id: match.id, where: `matches[${index}]`, match })
  }

  const rounds = tournament.format?.customPlayoffConfig?.playoffRounds
  for (const [roundIndex, round] of (Array.isArray(rounds) ? rounds : []).entries()) {
    for (const [position, match] of (round?.matches ?? []).entries()) {
      if (match?.id) {
        out.push({
          id: match.id,
          where: `playoffRounds[${roundIndex}].matches[${position}]`,
          match,
        })
      }
    }
  }

  return out
}

const played = (match) =>
  typeof match?.homeGoals === 'number' || typeof match?.awayGoals === 'number'

const tournaments = await scanAll()
let clashes = 0

for (const tournament of tournaments) {
  const byId = new Map()
  for (const fixture of fixtures(tournament)) {
    if (!byId.has(fixture.id)) byId.set(fixture.id, [])
    byId.get(fixture.id).push(fixture)
  }

  for (const [id, held] of byId) {
    if (held.length < 2) continue
    clashes++
    console.log(`\n${tournament.name} (${tournament.id})`)
    console.log(`  ${id} is held ${held.length} times:`)
    for (const one of held) {
      const score = played(one.match)
        ? `${one.match.homeGoals ?? '-'}:${one.match.awayGoals ?? '-'}`
        : 'no result'
      const sheets = one.match.lineups ? ', has a teamsheet' : ''
      const goals = one.match.goals?.length ? `, ${one.match.goals.length} goal events` : ''
      console.log(`    ${one.where} — ${score}${goals}${sheets}`)
    }
  }
}

console.log(
  clashes === 0
    ? `\nNo duplicate match ids in ${tournaments.length} competitions.`
    : `\n${clashes} duplicated ${clashes === 1 ? 'id' : 'ids'}. Those fixtures cannot be saved until the ids are made unique.`,
)
