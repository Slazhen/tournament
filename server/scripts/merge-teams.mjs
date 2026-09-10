#!/usr/bin/env node
/**
 * Merges one club record into another.
 *
 * A club was created twice — the same real club, two rows in the teams table —
 * and only one of them can survive. The id of a club is written in a dozen
 * places that have nothing to do with the club record itself: a season's team
 * list, its registrations, every fixture the club appears in, the applications
 * it made, the lists organisers keep, the accounts that manage it. Deleting the
 * duplicate without moving all of that would leave a fixture pointing at
 * nothing, which is how a league table loses a club and keeps its results.
 *
 * Run it from your own machine with your own AWS credentials. It reads
 * everything and prints what it would do, and writes nothing unless you pass
 * --apply:
 *
 *   node scripts/merge-teams.mjs --from <duplicate id> --into <surviving id>
 *   node scripts/merge-teams.mjs --from <duplicate id> --into <surviving id> --apply
 *
 * Players keep their own ids when they move. That is the whole reason this is a
 * merge and not a re-entry: goals, cards and teamsheets name a player by id and
 * nothing else, so a player who arrives under a new id takes every appearance
 * and every goal he ever scored off the record and shows up as "Former player"
 * in the tables of a season that has already been played.
 *
 * What it refuses rather than guesses:
 *
 *   - Both clubs in the same competition. The merge would produce a fixture in
 *     which the club plays itself, and which of the two results is the real one
 *     is a decision, not a migration.
 *   - Two clubs belonging to different organisers, unless you say
 *     --allow-different-organizer. Merging then moves one organiser's history
 *     into another organiser's club.
 *   - A player id that exists in both squads. That is not a duplicate club, it
 *     is the same record read twice, and continuing would lose one of them.
 *
 * The window this does not close: it re-reads every record immediately before
 * writing it and refuses if it changed since the report, but a write landing in
 * the microseconds after that read is still lost. Run it when nobody is editing.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'

const TABLE_TEAMS = process.env.TABLE_TEAMS ?? 'football-tournaments-teams'
const TABLE_TOURNAMENTS = process.env.TABLE_TOURNAMENTS ?? 'football-tournaments-tournaments'
const TABLE_ORGANIZERS = process.env.TABLE_ORGANIZERS ?? 'football-tournaments-organizers'
const TABLE_ENTRIES = process.env.TABLE_ENTRIES ?? 'football-tournaments-entries'
const TABLE_INVITES = process.env.TABLE_INVITES ?? 'football-tournaments-invites'
const TABLE_AUTH_USERS = process.env.TABLE_AUTH_USERS ?? 'football-tournaments-auth-users'
const TABLE_AUDIT = process.env.TABLE_AUDIT ?? 'football-tournaments-audit'

function flag(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const fromId = flag('from')
const intoId = flag('into')
const apply = process.argv.includes('--apply')
const allowDifferentOrganizer = process.argv.includes('--allow-different-organizer')
// Which record has the history and which has the better crest are two different
// questions, and the answer to the second is often the record being deleted:
// the duplicate is usually the one somebody made carefully, having forgotten
// that the club was already there. So the survivor can take the name and the
// crest of the record it absorbs, and neither is assumed.
const takeName = process.argv.includes('--take-name')
const takeCrest = process.argv.includes('--take-crest')
// Puts the surviving club on the list of any organiser whose competition the
// duplicate was playing in. Without it their season keeps its fixtures and
// loses the club's name on their own screens; with it, it is a permission they
// did not ask for. Neither is a default worth assuming.
const grantShortlist = process.argv.includes('--grant-shortlist')
// Whose copy of a player wins where the two clubs hold the same id with
// different contents. There is no safe default: on a resumed run the survivor's
// copy is this script's own snapshot and the duplicate's is what the manager
// has been editing since, but a club's own manager can reach both records, so
// which is newer is a fact to look at rather than to assume.
const prefer = flag('prefer')
if (prefer && prefer !== 'duplicate' && prefer !== 'survivor') {
  console.error('--prefer takes "duplicate" or "survivor"')
  process.exit(1)
}
const actorEmail = flag('actor') ?? 'scripts/merge-teams.mjs'

if (!fromId || !intoId || fromId === intoId) {
  console.error('Usage: node scripts/merge-teams.mjs --from <duplicate id> --into <surviving id> [--apply]')
  process.exit(1)
}

const client = new DynamoDBClient({})
const ddb = DynamoDBDocumentClient.from(client)

// Which stack this is about to rewrite. Exporting one table name for a test
// stack and forgetting the rest would read the clubs from one database and
// rewrite the seasons of another.
console.log(`Region:  ${await client.config.region()}`)
console.log(`Tables:  ${[TABLE_TEAMS, TABLE_TOURNAMENTS, TABLE_ENTRIES].join(', ')}`)
console.log(`Mode:    ${apply ? 'APPLY — this writes' : 'dry run — nothing is written'}\n`)

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

async function getTeam(id) {
  const result = await ddb.send(new GetCommand({ TableName: TABLE_TEAMS, Key: { id } }))
  return result.Item
}

const clone = (value) => JSON.parse(JSON.stringify(value))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function fail(message) {
  console.error(`\nRefused: ${message}`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * What is there
 * ------------------------------------------------------------------ */

const from = await getTeam(fromId)
const into = await getTeam(intoId)

if (!from) fail(`no club with id ${fromId}`)
if (!into) fail(`no club with id ${intoId}`)

// Every organiser, read once: their names are what makes this report readable,
// and their `shortlistedTeamIds` is one of the places the duplicate's id is
// written. An id in a refusal message tells the person reading nothing.
const allOrganizers = await scanAll(TABLE_ORGANIZERS)
const organizerById = new Map(allOrganizers.map((organizer) => [organizer.id, organizer]))
const organizerName = (id) => {
  const organizer = organizerById.get(id)
  return organizer ? `${organizer.name} <${organizer.email ?? 'no email'}>` : `unknown (${id})`
}

/**
 * Why a dry run collects refusals instead of stopping at the first one.
 *
 * The point of running this without --apply is to find out what is there. A
 * script that exits on the first objection answers a different question — the
 * one thing that is wrong — and hides the competitions, fixtures and entries
 * the decision actually turns on. So the report is always printed in full and
 * the objections come at the end; --apply is what refuses to proceed.
 */
const refusals = []

function describe(label, team) {
  const managers = team.managerUserIds ?? []
  console.log(`${label}: ${team.name}`)
  console.log(`  id           ${team.id}`)
  console.log(`  organizer    ${organizerName(team.organizerId)}`)
  console.log(`  players      ${(team.players ?? []).filter(Boolean).length}`)
  console.log(`  crest        ${team.logo ? 'yes' : 'no'}`)
  console.log(`  managers     ${managers.length ? managers.join(', ') : 'none'}`)
}

describe('Duplicate (goes away)', from)
console.log()
describe('Survivor (stays)', into)
console.log()

if (from.organizerId !== into.organizerId && !allowDifferentOrganizer) {
  refusals.push(
    'the two clubs belong to different organisers — ' +
      `${organizerName(from.organizerId)} and ${organizerName(into.organizerId)}. ` +
      'Merging moves one organiser\'s history into the other\'s club. ' +
      'Pass --allow-different-organizer if that is what you mean.',
  )
}

/* ------------------------------------------------------------------ *
 * Where the duplicate's id is written
 * ------------------------------------------------------------------ */

/** Every fixture a competition holds, wherever it is stored. */
function fixturesOf(tournament) {
  const out = []
  for (const [index, match] of (tournament.matches ?? []).entries()) {
    if (match) out.push({ match, where: `matches[${index}]` })
  }
  const rounds = tournament.format?.customPlayoffConfig?.playoffRounds ?? []
  for (const [r, round] of rounds.entries()) {
    for (const [m, match] of (round?.matches ?? []).entries()) {
      if (match) out.push({ match, where: `playoffRounds[${r}].matches[${m}]` })
    }
  }
  return out
}

const tournaments = await scanAll(TABLE_TOURNAMENTS)

/** What one competition would have to change, and whether it is safe to. */
function inspect(tournament) {
  const teamIds = tournament.teamIds ?? []
  const fixtures = fixturesOf(tournament)
  const holdsFrom =
    teamIds.includes(fromId) ||
    Boolean(tournament.squads?.[fromId]) ||
    fixtures.some(({ match }) => match.homeTeamId === fromId || match.awayTeamId === fromId)
  const holdsInto =
    teamIds.includes(intoId) ||
    Boolean(tournament.squads?.[intoId]) ||
    fixtures.some(({ match }) => match.homeTeamId === intoId || match.awayTeamId === intoId)

  if (!holdsFrom) return null

  return {
    tournament,
    holdsInto,
    inTeamIds: teamIds.includes(fromId),
    squadEntry: tournament.squads?.[fromId],
    hasSquadsMap: Boolean(tournament.squads),
    strict: Boolean(tournament.squadsStrict),
    matches: fixtures.filter(
      ({ match }) => match.homeTeamId === fromId || match.awayTeamId === fromId,
    ),
    // A hand-built playoff fixture's id was assembled out of a club id, so some
    // of them carry the duplicate's id inside their own. They are left exactly
    // as they are: an id is an identity, renaming one would orphan the result
    // saved against it, and two rounds can already share an id.
    idsNamingFrom: fixtures.filter(({ match }) => String(match.id ?? '').includes(fromId)),
  }
}

const affected = tournaments.map(inspect).filter(Boolean)
const collisions = affected.filter((report) => report.holdsInto)

console.log(`Competitions holding the duplicate: ${affected.length}`)
for (const report of affected) {
  const { tournament: t } = report
  console.log(`\n  ${t.name ?? t.id}  (${t.id})`)
  console.log(`    in teamIds        ${report.inTeamIds ? 'yes' : 'no'}`)
  console.log(
    `    registration      ${
      report.squadEntry
        ? `${report.squadEntry.length} player(s) listed`
        : report.strict
          ? 'none, and squadsStrict is on — nobody was registered'
          : 'absent, and squadsStrict is off — the whole squad was registered'
    }`,
  )
  console.log(`    fixtures          ${report.matches.length}`)
  for (const { match, where } of report.matches) {
    const played = typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'
    console.log(
      `      ${where}  ${match.homeTeamId} ${played ? `${match.homeGoals}-${match.awayGoals}` : 'v'} ${match.awayTeamId}` +
        `  goals:${(match.goals ?? []).length} cards:${(match.cards ?? []).length}` +
        `  lineups:${Object.keys(match.lineups ?? {}).length}`,
    )
  }
  if (report.idsNamingFrom.length) {
    console.log(
      `    fixture ids containing the old club id (left as they are): ${report.idsNamingFrom.length}`,
    )
  }
  if (report.holdsInto) {
    console.log('    BOTH clubs play in this competition')
  }
}

const entriesFrom = (
  await ddb.send(
    new QueryCommand({
      TableName: TABLE_ENTRIES,
      IndexName: 'teamId-index',
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': fromId },
    }),
  )
).Items ?? []

const entriesInto = (
  await ddb.send(
    new QueryCommand({
      TableName: TABLE_ENTRIES,
      IndexName: 'teamId-index',
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': intoId },
    }),
  )
).Items ?? []

const intoEntryTournaments = new Set(entriesInto.map((entry) => entry.tournamentId))

const organizers = allOrganizers.filter((organizer) =>
  (organizer.shortlistedTeamIds ?? []).includes(fromId),
)

const accounts = (await scanAll(TABLE_AUTH_USERS)).filter((account) =>
  (account.teamIds ?? []).includes(fromId),
)

const invites = (await scanAll(TABLE_INVITES)).filter((invite) => invite.teamId === fromId)

console.log(`\nApplications and invitations (entries): ${entriesFrom.length}`)
for (const entry of entriesFrom) {
  console.log(
    `  ${entry.tournamentId}  status=${entry.status}` +
      (intoEntryTournaments.has(entry.tournamentId)
        ? '  — the survivor already has an entry here, this one is deleted'
        : ''),
  )
}
console.log(`Organisers with the duplicate on their list: ${organizers.length}`)
console.log(`Accounts managing the duplicate:            ${accounts.length}`)
console.log(`Unspent invitations to the duplicate:       ${invites.length}`)

/**
 * What a merge across organisers costs the other organiser's admin screens.
 *
 * A season keeps working publicly whatever happens here: the public routes
 * resolve a club by id and do not ask who owns it. The organiser's own screens
 * do ask. `/admin/teams` returns a club they do not own only where the club is
 * on their list from the pool or has an entry marked accepted in one of their
 * seasons, so after the merge a club with neither is a row in their team list
 * with no name and no crest — the season is not broken, it is unreadable.
 */
const foreign = affected.filter(
  (report) => report.tournament.organizerId && report.tournament.organizerId !== into.organizerId,
)
if (foreign.length) {
  console.log(`\nCompetitions that belong to another organiser: ${foreign.length}`)
  for (const report of foreign) {
    const owner = report.tournament.organizerId
    const entry = entriesFrom.find((row) => row.tournamentId === report.tournament.id)
    const listed = (organizerById.get(owner)?.shortlistedTeamIds ?? []).includes(fromId)
    const willResolve = entry?.status === 'accepted' || listed
    console.log(`  ${report.tournament.name ?? report.tournament.id} — ${organizerName(owner)}`)
    console.log(
      `    after the merge that organiser ${
        willResolve
          ? `still sees the club (${entry?.status === 'accepted' ? 'accepted entry' : 'on their list'})`
          : grantShortlist
            ? 'gets the club on their list, so it keeps its name, crest and squad on their screens'
            : 'sees a club with no name on their own screens — no accepted entry, not on their list. ' +
              'Pass --grant-shortlist to put the club on their list instead'
      }`,
    )
  }
}

// Which organisers would be granted the club, worked out once so the report and
// the write cannot disagree about it.
const grantees = grantShortlist
  ? [
      ...new Set(
        foreign
          .filter((report) => {
            const owner = report.tournament.organizerId
            const entry = entriesFrom.find((row) => row.tournamentId === report.tournament.id)
            return (
              entry?.status !== 'accepted' &&
              !(organizerById.get(owner)?.shortlistedTeamIds ?? []).includes(fromId)
            )
          })
          .map((report) => report.tournament.organizerId),
      ),
    ]
  : []

/* ------------------------------------------------------------------ *
 * The squad
 * ------------------------------------------------------------------ */

/**
 * A player already on both sides is a resumed run, not a clash.
 *
 * Every write here is conditional on the record not having changed since it was
 * read, so an ordinary edit landing mid-run stops the script part-way through —
 * which is the safe outcome and the expected one on a live database. What comes
 * next has to be another run of the same command, so each step has to recognise
 * its own work: a player id on both clubs carrying an identical record has been
 * moved already and is skipped. Only a player whose two records disagree is a
 * refusal, because then one of them is about to be lost and which one is a
 * question this script cannot answer.
 */
const moving = (from.players ?? []).filter(Boolean)
const survivorPlayers = new Map(
  (into.players ?? []).filter(Boolean).map((player) => [player.id, player]),
)
const alreadyMoved = moving.filter(
  (player) => survivorPlayers.has(player.id) && same(survivorPlayers.get(player.id), player),
)
const conflicting = moving.filter(
  (player) => survivorPlayers.has(player.id) && !same(survivorPlayers.get(player.id), player),
)
const toMove = moving.filter((player) => !survivorPlayers.has(player.id))

/**
 * The manager link moves with the club, or it is lost.
 *
 * Who runs a club is written in two places — `managerUserIds` on the club and
 * `teamIds` on the account — and this script repoints the account's list at the
 * survivor whatever happens. Leaving the club's own list alone would therefore
 * end with the two disagreeing: the account claims a club that does not claim
 * it back, and `/manager/overview` decides from the club's list, so that coach
 * signs in to nothing. Deleting the duplicate is what would drop the link, so
 * the union is written onto the survivor before that happens.
 */
const managersMoving = (from.managerUserIds ?? []).filter(
  (id) => !(into.managerUserIds ?? []).includes(id),
)

console.log('\nIdentity of the surviving record:')
console.log(`  name    ${takeName ? `${into.name} -> ${from.name}` : `${into.name} (unchanged)`}`)
console.log(
  `  crest   ${
    takeCrest
      ? from.logo
        ? `taken from ${from.name}`
        : `${from.name} has no crest — nothing to take`
      : into.logo
        ? 'kept'
        : 'none, and --take-crest was not given'
  }`,
)
console.log(
  `  managers ${
    managersMoving.length ? `${managersMoving.join(', ')} move across` : 'no change'
  }`,
)
if (managersMoving.length && !(into.managerUserIds ?? []).length) {
  // Worth saying plainly: this is the line beyond which the organiser stops
  // being able to edit the club, and it is easy to cross without noticing.
  console.log(
    '  note     once this club has a manager, its owning organiser can no longer edit the club, ' +
      'its squad or its crest — they keep the registration, the teamsheets and the results.',
  )
}

console.log(`\nPlayers moving across: ${toMove.length}`)
for (const player of toMove) {
  console.log(`  ${player.id}  ${player.firstName ?? ''} ${player.lastName ?? ''}`.trimEnd())
}

// Same first and last name on both sides is worth saying out loud: it is
// probably the same person entered twice, and this script will not decide that.
const namesThere = new Set(
  (into.players ?? [])
    .filter(Boolean)
    .map((player) => `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim().toLowerCase()),
)
const namesake = toMove.filter((player) =>
  namesThere.has(`${player.firstName ?? ''} ${player.lastName ?? ''}`.trim().toLowerCase()),
)
if (namesake.length) {
  console.log(
    `  ${namesake.length} of them share a name with somebody already in the surviving club. ` +
      'They are moved anyway — merging two player records would silently pick one set of goals.',
  )
}

if (alreadyMoved.length) {
  console.log(`  ${alreadyMoved.length} already on the survivor from an earlier run — skipped.`)
}

if (conflicting.length) {
  // Printed rather than summarised: "13 records disagree" is not something
  // anybody can decide from, and the difference is usually two or three fields
  // somebody filled in on one side after the copy was taken.
  console.log(`\n${conflicting.length} player(s) held by both clubs, with differences:`)
  const short = (value) => {
    const text = value === undefined ? '(absent)' : JSON.stringify(value)
    return text.length > 60 ? `${text.slice(0, 57)}...` : text
  }
  for (const player of conflicting) {
    const mine = survivorPlayers.get(player.id)
    const keys = [...new Set([...Object.keys(mine ?? {}), ...Object.keys(player)])].filter(
      (key) => !same(mine?.[key], player[key]),
    )
    console.log(`  ${player.id}  ${player.firstName ?? ''} ${player.lastName ?? ''}`.trimEnd())
    for (const key of keys) {
      console.log(`      ${key}: survivor ${short(mine?.[key])} | duplicate ${short(player[key])}`)
    }
  }
  console.log(
    prefer
      ? `  --prefer ${prefer}: the ${prefer}'s copy is kept for each of these.`
      : '  Pass --prefer duplicate or --prefer survivor to say which copy wins.',
  )
}

if (conflicting.length && !prefer) {
  refusals.push(
    `${conflicting.length} player id(s) exist in both clubs with different records. ` +
      'One of the two copies would be lost — say which with --prefer duplicate or --prefer survivor.',
  )
}

/**
 * The survivor's own seasons have the mirror of the registration problem.
 *
 * An open competition stores "everybody is registered" as no entry at all, and
 * the club is about to gain players it did not have. Left alone, every season
 * the survivor already plays in would register all of them retrospectively —
 * eight footballers who never played in that league turning up as eligible in a
 * season that has been played. So the registration those seasons already had is
 * written out as the list it actually was, before the squad grows.
 */
const survivorSeasons = tournaments.filter((tournament) => {
  const teamIds = tournament.teamIds ?? []
  return (
    teamIds.includes(intoId) ||
    Boolean(tournament.squads?.[intoId]) ||
    fixturesOf(tournament).some(
      ({ match }) => match.homeTeamId === intoId || match.awayTeamId === intoId,
    )
  )
})
// The list to write out is the survivor's own squad: the players that did not
// come from the duplicate. On a resumed run the arrivals are already sitting in
// `into.players`, so taking that list whole would write down precisely the
// retrospective registration this exists to prevent.
const arrivedIds = new Set(moving.map((player) => player.id))
const survivorPlayerIds = (into.players ?? [])
  .filter(Boolean)
  .filter((player) => !arrivedIds.has(player.id))
  .map((player) => player.id)
const freezing = moving.length
  ? survivorSeasons.filter(
      (tournament) => !tournament.squads?.[intoId] && !tournament.squadsStrict,
    )
  : []

if (freezing.length) {
  console.log(`\nOpen competitions the survivor already plays in: ${freezing.length}`)
  for (const tournament of freezing) {
    console.log(
      `  ${tournament.name ?? tournament.id} — registration written out as ` +
        `${survivorPlayerIds.length} player(s), so the arriving squad is not registered there retrospectively`,
    )
  }
}

if (collisions.length) {
  refusals.push(
    `both clubs play in ${collisions.length} of the same competition(s): ` +
      `${collisions.map((report) => report.tournament.name ?? report.tournament.id).join(', ')}. ` +
      'The merge would create a fixture in which the club plays itself.',
  )
}

if (refusals.length) {
  console.log('\nThis merge is refused:')
  for (const reason of refusals) console.log(`  - ${reason}`)
  console.log('\nNothing was written.')
  process.exit(1)
}

if (!apply) {
  console.log('\nNothing written. Re-run with --apply to carry it out.')
  process.exit(0)
}

/* ------------------------------------------------------------------ *
 * The merge
 * ------------------------------------------------------------------ */

/**
 * Applies a change to a record, computed against whatever is in it right now.
 *
 * These documents are written whole — a season carries its whole fixture list
 * and this touches several of its fields at once — which is exactly what an
 * ordinary route must never do. The first version of this refused whenever the
 * record had changed since the report and abandoned the run, which is right for
 * a write that would clobber and wrong for this one: the season being merged is
 * edited while the script runs, and a migration that can only finish in a quiet
 * minute never finishes. Every change here is the rewrite of one club's id, so
 * recomputing it against the freshest copy keeps whatever the person editing
 * has just saved and still does the thing. The re-read before the write leaves
 * a window of milliseconds, and the retry is what makes that window small
 * enough to close on a database somebody is using.
 *
 * A transform returning the record unchanged means the step was already done by
 * an earlier run, which is how this resumes rather than restarts.
 */
async function updateRecord(TableName, key, transform, label, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const current = (await ddb.send(new GetCommand({ TableName, Key: key }))).Item
    if (!current) {
      console.log(`  gone: ${label}`)
      return false
    }
    const next = transform(clone(current))
    if (!next || same(current, next)) {
      console.log(`  already done: ${label}`)
      return false
    }
    const check = (await ddb.send(new GetCommand({ TableName, Key: key }))).Item
    if (!same(check, current)) {
      console.log(`  ${label}: edited under us, reading again (attempt ${attempt})`)
      continue
    }
    await ddb.send(new PutCommand({ TableName, Item: next }))
    console.log(`  written: ${label}`)
    return true
  }
  fail(
    `${label} is being edited continuously — gave up after ${attempts} attempts. ` +
      'Nothing is broken and nothing was half-written: run the same command again.',
  )
}

console.log('\nWriting.\n')

// The squad first. If anything fails after this the players exist in both
// clubs, which is visible and repairable; the reverse order would leave
// fixtures pointing at a club whose squad has already gone.
await updateRecord(
  TABLE_TEAMS,
  { id: intoId },
  (team) => {
    const have = new Set((team.players ?? []).filter(Boolean).map((player) => player.id))
    team.players = [
      ...(team.players ?? []).filter(Boolean),
      ...clone(moving.filter((player) => !have.has(player.id))),
    ]
    if (prefer === 'duplicate' && conflicting.length) {
      const newer = new Map(conflicting.map((player) => [player.id, player]))
      team.players = team.players.map((player) =>
        player && newer.has(player.id) ? clone(newer.get(player.id)) : player,
      )
    }
    const managers = team.managerUserIds ?? []
    const arriving = (from.managerUserIds ?? []).filter((id) => !managers.includes(id))
    if (arriving.length) team.managerUserIds = [...managers, ...arriving]
    if (takeName && from.name) team.name = from.name
    if (takeCrest && from.logo) {
      team.logo = from.logo
      // The crest's colour was read from the file when it was uploaded and
      // cannot be read again — the image bucket answers a canvas without CORS
      // headers — so it travels with the crest or the club header falls back to
      // a colour that is wrong for about half of them.
      team.crestColor = from.crestColor ?? null
      team.crestOpaqueBackground = from.crestOpaqueBackground ?? null
    }
    return team
  },
  `club record of ${into.name}`,
)

for (const report of affected) {
  await updateRecord(
    TABLE_TOURNAMENTS,
    { id: report.tournament.id },
    (season) => {
      if (Array.isArray(season.teamIds)) {
        const mapped = season.teamIds.map((id) => (id === fromId ? intoId : id))
        season.teamIds = mapped.filter((id, index) => mapped.indexOf(id) === index)
      }

      // The registration is moved where it was written down, and written out
      // where it was not. An open competition stores "everybody" as no entry at
      // all, and the surviving club has players the duplicate never had —
      // leaving it absent would register them retrospectively in a season that
      // was played without them. The list is the arriving squad, not the
      // players still to be copied: on a resumed run they are already across.
      const entry = season.squads?.[fromId]
      if (entry) {
        season.squads = { ...season.squads }
        season.squads[intoId] = entry
        delete season.squads[fromId]
      } else if (!season.squadsStrict && moving.length && !season.squads?.[intoId]) {
        season.squads = { ...(season.squads ?? {}) }
        season.squads[intoId] = moving.map((player) => player.id)
      }

      for (const match of season.matches ?? []) {
        if (!match) continue
        if (match.homeTeamId === fromId) match.homeTeamId = intoId
        if (match.awayTeamId === fromId) match.awayTeamId = intoId
      }
      for (const round of season.format?.customPlayoffConfig?.playoffRounds ?? []) {
        for (const match of round?.matches ?? []) {
          if (!match) continue
          if (match.homeTeamId === fromId) match.homeTeamId = intoId
          if (match.awayTeamId === fromId) match.awayTeamId = intoId
        }
      }

      // Old records carry a bracket that names its clubs beside the fixtures.
      // Nothing reads it any more, and a stale id in it would still be a wrong
      // answer to anyone who looked.
      if (Array.isArray(season.playoffBrackets)) {
        const rewrite = (value) =>
          typeof value === 'string'
            ? value === fromId
              ? intoId
              : value
            : Array.isArray(value)
              ? value.map(rewrite)
              : value && typeof value === 'object'
                ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]))
                : value
        season.playoffBrackets = rewrite(season.playoffBrackets)
      }

      return season
    },
    `competition ${report.tournament.name ?? report.tournament.id}`,
  )
}

// Written before the squad grows would be better still, but the squad write has
// to come first for the reason given above; these seasons are the survivor's
// own, and the registration they are being given is the one they already had.
for (const season of freezing) {
  await updateRecord(
    TABLE_TOURNAMENTS,
    { id: season.id },
    (current) => {
      if (current.squads?.[intoId] || current.squadsStrict) return null
      current.squads = { ...(current.squads ?? {}) }
      current.squads[intoId] = survivorPlayerIds
      return current
    },
    `registration of ${into.name} in ${season.name ?? season.id}`,
  )
}

// An entry is keyed by the club, so it cannot be updated in place: the row is
// written under the surviving club's key and the old one deleted. Where the
// survivor already answered for itself, that answer stands and the duplicate's
// row goes — two entries for one club in one competition is a contradiction the
// decide routes have no way to resolve.
for (const entry of entriesFrom) {
  if (!intoEntryTournaments.has(entry.tournamentId)) {
    await ddb.send(
      new PutCommand({ TableName: TABLE_ENTRIES, Item: { ...entry, teamId: intoId } }),
    )
    console.log(`  written: entry ${entry.tournamentId} -> ${intoId}`)
  } else {
    console.log(`  dropped: entry ${entry.tournamentId} (the survivor already has one)`)
  }
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_ENTRIES,
      Key: { tournamentId: entry.tournamentId, teamId: fromId },
    }),
  )
}

for (const organizer of organizers) {
  await updateRecord(
    TABLE_ORGANIZERS,
    { id: organizer.id },
    (current) => {
      const mapped = (current.shortlistedTeamIds ?? []).map((id) =>
        id === fromId ? intoId : id,
      )
      current.shortlistedTeamIds = mapped.filter((id, index) => mapped.indexOf(id) === index)
      return current
    },
    `list of organiser ${organizer.name ?? organizer.id}`,
  )
}

// The grant is what keeps the other organiser's season readable: `/admin/teams`
// returns a club they do not own only where it is on this list or has agreed to
// play for them, and their fixtures already name it either way. It is capped at
// 200 by the route that normally writes it, and the cap is honoured here — that
// list is read on every admin request and every id on it costs a read.
for (const organizerId of grantees) {
  await updateRecord(
    TABLE_ORGANIZERS,
    { id: organizerId },
    (current) => {
      const listed = current.shortlistedTeamIds ?? []
      if (listed.includes(intoId)) return null
      if (listed.length >= 200) {
        console.log(`  skipped: ${current.name ?? organizerId} already lists 200 clubs`)
        return null
      }
      current.shortlistedTeamIds = [...listed, intoId]
      return current
    },
    `${into.name} added to the list of ${organizerName(organizerId)}`,
  )
}

for (const account of accounts) {
  await updateRecord(
    TABLE_AUTH_USERS,
    { id: account.id },
    (current) => {
      const mapped = (current.teamIds ?? []).map((id) => (id === fromId ? intoId : id))
      current.teamIds = mapped.filter((id, index) => mapped.indexOf(id) === index)
      return current
    },
    `account ${account.email ?? account.id}`,
  )
}

// An invitation is a link somebody is holding, and what it promises is a club.
// Repointing it keeps that promise; deleting it would leave a coach opening a
// dead link with no idea why.
for (const invite of invites) {
  await ddb.send(
    new PutCommand({ TableName: TABLE_INVITES, Item: { ...invite, teamId: intoId } }),
  )
  console.log(`  written: invitation ${invite.token} -> ${intoId}`)
}

// The duplicate last: everything that named it now names the survivor.
{
  const current = (await ddb.send(new GetCommand({ TableName: TABLE_TEAMS, Key: { id: fromId } })))
    .Item
  if (!same(current, from)) {
    fail('the duplicate club changed while this script was running. It was NOT deleted; re-run.')
  }
  await ddb.send(new DeleteCommand({ TableName: TABLE_TEAMS, Key: { id: fromId } }))
  console.log(`  deleted: ${from.name} (${fromId})`)
}

// The /changes screen is the answer to "who changed this result", and a merge
// that rewrote a season's fixtures without leaving a line there is exactly the
// edit that question gets asked about.
await ddb.send(
  new PutCommand({
    TableName: TABLE_AUDIT,
    Item: {
      pk: 'log',
      at: `${new Date().toISOString()}#merge`,
      actorId: 'script:merge-teams',
      actorEmail,
      actorRole: 'super_admin',
      action: 'merge',
      entity: 'team',
      entityId: intoId,
      organizerId: into.organizerId,
      summary:
        `Merged ${from.name} (${fromId}) into ${into.name} (${intoId}): ` +
        `${toMove.length} player(s), ${affected.length} competition(s), ${entriesFrom.length} entry/entries`,
    },
  }),
)

console.log('\nDone.')
console.log(
  'The API keeps table reads in Lambda memory for a minute, so a public page may ' +
    'still show the old club until that expires.',
)
