#!/usr/bin/env node
/**
 * What the live records hold before referees become accounts.
 *
 * Two things in the tournaments table decide how the referee feature lands:
 * the free-text `referee` an organiser could already type on a match, and the
 * shape of the `cards` list, which is about to get per-event routes and an
 * author on every row. This counts both, and prints the distinct referee names
 * so that a decision about carrying them over is made from what is there.
 *
 * It only reads:
 *
 *   node scripts/survey-referees.mjs
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

function fixturesOf(tournament) {
  const out = []
  for (const match of Array.isArray(tournament.matches) ? tournament.matches : []) out.push(match)
  const rounds = tournament.format?.customPlayoffConfig?.playoffRounds
  for (const round of Array.isArray(rounds) ? rounds : []) {
    for (const match of Array.isArray(round?.matches) ? round.matches : []) out.push(match)
  }
  return out.filter((m) => m && typeof m === 'object')
}

const tournaments = await scanAll()
const refereeNames = new Map()
let fixtures = 0
let withRefereeText = 0
let withRefereeOther = 0
let cardLists = 0
let cardsNotList = 0
let cards = 0
let cardsWithoutId = 0
let cardsDuplicateId = 0
const cardKeys = new Map()
const cardTypes = new Map()

for (const t of tournaments) {
  for (const match of fixturesOf(t)) {
    fixtures += 1
    if (typeof match.referee === 'string' && match.referee.trim()) {
      withRefereeText += 1
      const key = `${t.name} :: ${match.referee.trim()}`
      refereeNames.set(key, (refereeNames.get(key) ?? 0) + 1)
    } else if (match.referee !== undefined && match.referee !== null && match.referee !== '') {
      withRefereeOther += 1
    }
    if (match.cards === undefined) continue
    if (!Array.isArray(match.cards)) {
      cardsNotList += 1
      continue
    }
    cardLists += 1
    const seen = new Set()
    for (const card of match.cards) {
      cards += 1
      if (!card || typeof card !== 'object' || typeof card.id !== 'string') {
        cardsWithoutId += 1
        continue
      }
      if (seen.has(card.id)) cardsDuplicateId += 1
      seen.add(card.id)
      for (const key of Object.keys(card)) cardKeys.set(key, (cardKeys.get(key) ?? 0) + 1)
      cardTypes.set(String(card.type), (cardTypes.get(String(card.type)) ?? 0) + 1)
    }
  }
}

console.log(`Competitions: ${tournaments.length}, fixtures: ${fixtures}`)
console.log(`Fixtures with a referee typed in: ${withRefereeText}; with a non-text referee: ${withRefereeOther}`)
for (const [key, count] of [...refereeNames].sort()) console.log(`  ${key}  (${count})`)
console.log(`Fixtures with a cards list: ${cardLists}; cards stored as something else: ${cardsNotList}`)
console.log(`Cards: ${cards}; without an id: ${cardsWithoutId}; duplicate ids within a match: ${cardsDuplicateId}`)
console.log('Card fields:', Object.fromEntries(cardKeys))
console.log('Card types:', Object.fromEntries(cardTypes))
