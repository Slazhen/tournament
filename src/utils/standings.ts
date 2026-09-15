import type { Match, PointDeduction, TeamStanding, Tournament } from '../types'
import { allMatches } from './matches'
import { outcomeOf } from './ties'

/**
 * The table, derived in one place.
 *
 * Standings are drawn on the season page and, now, beside a match. Working them
 * out twice is two answers to "who is third" waiting to disagree — the same
 * mistake the card totals were making while they were stored beside the events
 * they come from. Everything that draws a table reads it from here.
 *
 * The row keeps the short keys the season page already renders rather than
 * `TeamStanding`: that type carries a `position` and tie-break fields nothing
 * here fills in, and inventing them would be a second set of numbers again.
 */

export type StandingsRow = {
  id: string
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  pts: number
  /**
   * Points this club has had taken off, already subtracted from `pts`.
   *
   * Zero for almost every row. It is carried here so that a table can mark the
   * row without asking a second question about the same club — and so that the
   * screens cannot answer it differently from the arithmetic that moved the
   * position.
   */
  deducted: number
}

const emptyRow = (id: string): StandingsRow => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, deducted: 0 })

/**
 * How a season's table is worked out.
 *
 * The rules belong to the season and not to the application. Every competition
 * created before they were a setting carries none of them, and that absence is
 * itself a rule: it means what this application did in September 2026 — three
 * points for a win, one for a draw, every playoff match counted, and the table
 * separated by goal difference and then by goals scored. A default changed here
 * must never move a table that has already been published, which is why the
 * legacy values below are read from the absence of the field rather than
 * written into old records by a migration.
 */
export type PlayoffScoring =
  /** Every playoff match gives points. What every season did before the setting. */
  | 'all'
  /** Only the rounds that are not knockouts — the custom scheme's league rounds. */
  | 'non_elimination'
  /** No playoff match touches the table. */
  | 'none'

export type ScoringRules = {
  win: number
  draw: number
  loss: number
  playoffMatches: PlayoffScoring
}

/**
 * What separates two clubs level on points, in order.
 *
 * Points are the table itself and are never in this list — a list that could
 * leave them out is a list somebody can misconfigure into nonsense.
 */
export type TiebreakerKey = 'headToHead' | 'goalDifference' | 'goalsFor' | 'wins'

export type TableRules = {
  scoring: ScoringRules
  tiebreakers: TiebreakerKey[]
}

const LEGACY_SCORING: ScoringRules = { win: 3, draw: 1, loss: 0, playoffMatches: 'all' }
const LEGACY_TIEBREAKERS: TiebreakerKey[] = ['goalDifference', 'goalsFor']

/** What a competition created from now on starts with, and may edit. */
export const DEFAULT_SCORING: ScoringRules = { win: 3, draw: 1, loss: 0, playoffMatches: 'none' }
export const DEFAULT_TIEBREAKERS: TiebreakerKey[] = ['headToHead', 'goalDifference', 'goalsFor']

const TIEBREAKER_KEYS: TiebreakerKey[] = ['headToHead', 'goalDifference', 'goalsFor', 'wins']
const PLAYOFF_SCORING: PlayoffScoring[] = ['all', 'non_elimination', 'none']

/** A stored number, or the fallback. These records are schemaless and `format` is written whole. */
const storedNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * The rules this season is played by.
 *
 * Read defensively: `format` is one of the few things the API passes through
 * whole, so anything can be sitting in these fields. An unreadable value falls
 * back to what the season would have done without the field at all.
 */
export function tableRules(tournament?: Tournament | null): TableRules {
  const stored = tournament?.format?.scoring
  const scoring: ScoringRules = stored
    ? {
        win: storedNumber(stored.win, LEGACY_SCORING.win),
        draw: storedNumber(stored.draw, LEGACY_SCORING.draw),
        loss: storedNumber(stored.loss, LEGACY_SCORING.loss),
        playoffMatches: PLAYOFF_SCORING.includes(stored.playoffMatches as PlayoffScoring)
          ? (stored.playoffMatches as PlayoffScoring)
          : DEFAULT_SCORING.playoffMatches,
      }
    : LEGACY_SCORING

  const list = tournament?.format?.tiebreakers
  const tiebreakers = Array.isArray(list)
    ? list.filter(
        (key, index): key is TiebreakerKey =>
          TIEBREAKER_KEYS.includes(key as TiebreakerKey) && list.indexOf(key) === index,
      )
    : []

  return { scoring, tiebreakers: tiebreakers.length > 0 ? tiebreakers : LEGACY_TIEBREAKERS }
}

/**
 * The punishments a season is carrying, read defensively.
 *
 * `POST /admin/tournaments` passes its body through, so anything at all can be
 * sitting under this key on a season created that way, and a row that is not a
 * deduction must cost the table nothing rather than turning every total into
 * NaN. Anything unreadable is dropped here and nowhere else.
 */
export function deductionsOf(tournament?: Tournament | null): PointDeduction[] {
  const stored = tournament?.pointDeductions
  if (!Array.isArray(stored)) return []
  return stored.filter(
    (entry): entry is PointDeduction =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof entry.teamId === 'string' &&
      typeof entry.points === 'number' &&
      Number.isFinite(entry.points) &&
      entry.points > 0,
  )
}

/** How many points one club has lost in this season, across every punishment. */
export function deductedFrom(tournament: Tournament | null | undefined, teamId: string): number {
  return deductionsOf(tournament)
    .filter((deduction) => deduction.teamId === teamId)
    .reduce((total, deduction) => total + deduction.points, 0)
}

/** The same, as a total per club, which is what a whole table needs. */
function deductionTotals(tournament?: Tournament | null): Map<string, number> {
  const totals = new Map<string, number>()
  for (const deduction of deductionsOf(tournament)) {
    totals.set(deduction.teamId, (totals.get(deduction.teamId) ?? 0) + deduction.points)
  }
  return totals
}

/**
 * The same, applied to the other answer to "who is first".
 *
 * `sortTeamsByStandings` in `schedule.ts` is a second ordering this repository
 * deliberately keeps — it seeds the playoff brackets, and routing it through
 * here would move the seeding of seasons already under way. But three things
 * read it to say where a club *stands* rather than who it plays: the champion
 * of a finished league, the club's own position on its dashboard and the window
 * beside it. Those are claims about the table, and a table that has had points
 * taken off it is the table. So the deduction is applied to the rows before
 * they are ordered, at those three call sites and nowhere else.
 */
export function afterDeductions(
  tournament: Tournament | null | undefined,
  standings: TeamStanding[],
): TeamStanding[] {
  const deducted = deductionTotals(tournament)
  if (deducted.size === 0) return standings
  return standings.map((row) => {
    const points = deducted.get(row.teamId) ?? 0
    return points > 0 ? { ...row, points: row.points - points } : row
  })
}

/**
 * Whether this fixture gives points at all.
 *
 * A group table asks its own question and never gets here: it is the group
 * stage by definition and filters the playoffs out before counting.
 */
export function countsForTable(match: Match, scoring: ScoringRules): boolean {
  if (!match.isPlayoff) return true
  if (scoring.playoffMatches === 'all') return true
  if (scoring.playoffMatches === 'none') return false
  return match.isElimination !== true
}

/** A fixture counts only when both scores are real numbers — NaN makes every total NaN. */
const decided = (match: Match): boolean =>
  typeof match.homeGoals === 'number' &&
  typeof match.awayGoals === 'number' &&
  !Number.isNaN(match.homeGoals) &&
  !Number.isNaN(match.awayGoals) &&
  match.homeGoals >= 0 &&
  match.awayGoals >= 0

function countRows(teamIds: string[], matches: Match[], scoring: ScoringRules): StandingsRow[] {
  const stats = new Map<string, StandingsRow>()
  for (const id of teamIds) if (id) stats.set(id, emptyRow(id))

  for (const match of matches) {
    if (!decided(match)) continue
    if (!countsForTable(match, scoring)) continue
    // A fixture naming the same club on both sides is a bye, not a result. The
    // two lookups below would be one row, and it would be given a played game,
    // a win and a defeat at once.
    if (match.homeTeamId === match.awayTeamId) continue
    const home = stats.get(match.homeTeamId)
    const away = stats.get(match.awayTeamId)
    // A club that is not in this table — a playoff opponent from another group,
    // or one removed from the competition after playing.
    if (!home || !away) continue

    const homeGoals = match.homeGoals as number
    const awayGoals = match.awayGoals as number

    home.p++
    away.p++
    home.gf += homeGoals
    home.ga += awayGoals
    away.gf += awayGoals
    away.ga += homeGoals

    if (homeGoals > awayGoals) {
      home.w++
      away.l++
      home.pts += scoring.win
      away.pts += scoring.loss
    } else if (homeGoals < awayGoals) {
      away.w++
      home.l++
      away.pts += scoring.win
      home.pts += scoring.loss
    } else {
      home.d++
      away.d++
      home.pts += scoring.draw
      away.pts += scoring.draw
    }
  }

  return [...stats.values()]
}

/** What a tiebreak compares, higher first. Points are the table and lead every ordering. */
type RankKey = 'points' | 'goalDifference' | 'goalsFor' | 'wins'

const rankValue = (row: StandingsRow, key: RankKey): number => {
  if (key === 'points') return row.pts
  if (key === 'goalDifference') return row.gf - row.ga
  if (key === 'goalsFor') return row.gf
  return row.w
}

/**
 * The rows split into groups that this criterion cannot separate, best first.
 *
 * Splitting rather than comparing is what makes head-to-head possible at all:
 * three clubs level on points are ranked by a table of the matches among the
 * three, and a pairwise comparator has nowhere to put that question.
 */
function splitBy(rows: StandingsRow[], key: RankKey): StandingsRow[][] {
  const buckets = new Map<number, StandingsRow[]>()
  for (const row of rows) {
    const value = rankValue(row, key)
    const bucket = buckets.get(value)
    if (bucket) bucket.push(row)
    else buckets.set(value, [row])
  }
  return [...buckets.entries()].sort((a, b) => b[0] - a[0]).map(([, bucket]) => bucket)
}

/**
 * The same, for the matches these clubs played against each other.
 *
 * Only the tied clubs are in it and only the matches among them are counted, so
 * a club that beat everybody else and lost to the two it is level with finishes
 * behind them. Clubs that have not met yet tie on everything here and fall
 * through to the next criterion, which is the honest answer rather than a
 * silent ordering by whoever was entered first.
 */
function splitByHeadToHead(
  rows: StandingsRow[],
  matches: Match[],
  scoring: ScoringRules,
): StandingsRow[][] {
  const ids = new Set(rows.map((row) => row.id))
  const among = matches.filter((match) => ids.has(match.homeTeamId) && ids.has(match.awayTeamId))
  const mini = countRows([...ids], among, scoring)
  const rank = new Map(mini.map((row) => [row.id, row]))

  const buckets = new Map<string, StandingsRow[]>()
  const order: string[] = []
  for (const row of rows) {
    const own = rank.get(row.id) ?? emptyRow(row.id)
    const key = `${own.pts}:${own.gf - own.ga}:${own.gf}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else {
      buckets.set(key, [row])
      order.push(key)
    }
  }

  const value = (key: string) => key.split(':').map(Number)
  return order
    .sort((a, b) => {
      const [aPts, aGd, aGf] = value(a)
      const [bPts, bGd, bGf] = value(b)
      return bPts - aPts || bGd - aGd || bGf - aGf
    })
    .map((key) => buckets.get(key) as StandingsRow[])
}

/**
 * The rows in order: points first, then the season's tiebreakers in the order
 * it lists them.
 *
 * Clubs that nothing separates keep the order the competition entered them in,
 * which is the same order on every render — this used to end in a coin toss,
 * and a season nobody had played dealt out different positions every time the
 * page drew itself.
 */
function orderRows(
  rows: StandingsRow[],
  matches: Match[],
  rules: TableRules,
  keys: TiebreakerKey[],
): StandingsRow[] {
  if (rows.length < 2 || keys.length === 0) return rows

  const [key, ...rest] = keys
  const buckets =
    key === 'headToHead'
      ? splitByHeadToHead(rows, matches, rules.scoring)
      : splitBy(rows, key)

  return buckets.flatMap((bucket) => orderRows(bucket, matches, rules, rest))
}

/**
 * The table: what the matches gave, less what the organiser took away.
 *
 * The deduction is applied here, once, before anything is ordered — so the
 * punishment moves the club's position and not merely the number printed beside
 * it. It deliberately does not reach the head-to-head mini-table below:
 * `splitByHeadToHead` re-tallies the matches among the clubs that are level and
 * is handed no deductions, because a punishment already counted in the total
 * that made them level would be counted a second time to separate them.
 */
function tally(
  teamIds: string[],
  matches: Match[],
  rules: TableRules,
  deducted?: Map<string, number>,
): StandingsRow[] {
  const rows = countRows(teamIds, matches, rules.scoring)
  if (deducted && deducted.size > 0) {
    for (const row of rows) {
      const points = deducted.get(row.id) ?? 0
      if (points > 0) {
        row.deducted = points
        // A club can finish on a negative total. That is the honest answer, and
        // a floor at zero would hide the size of the punishment.
        row.pts -= points
      }
    }
  }
  return splitBy(rows, 'points').flatMap((bucket) =>
    orderRows(bucket, matches, rules, rules.tiebreakers),
  )
}

/**
 * What one club has scored in one competition, by that competition's rules.
 *
 * The club pages and the player pages each print this beside a season's name,
 * and each of them worked it out with its own copy of "three for a win".
 */
export function pointsFor(
  teamId: string,
  matches: Match[],
  rules: TableRules,
  /**
   * What the organiser has taken off this club in this season — `deductedFrom`.
   * Defaulted rather than required so that a caller with the matches and no
   * tournament to hand still gets the same arithmetic, but every page that
   * prints a season's points passes it: a club page saying 12 beside a table
   * saying 9 is two answers to one question.
   */
  deducted = 0,
): number {
  let points = 0
  for (const match of matches) {
    if (!decided(match)) continue
    if (!countsForTable(match, rules.scoring)) continue

    const home = match.homeTeamId === teamId
    const away = match.awayTeamId === teamId
    if (!home && !away) continue
    // A fixture naming the same club on both sides is a BYE, not a result.
    if (home && away) continue

    const own = home ? (match.homeGoals as number) : (match.awayGoals as number)
    const other = home ? (match.awayGoals as number) : (match.homeGoals as number)
    points += own > other ? rules.scoring.win : own === other ? rules.scoring.draw : rules.scoring.loss
  }
  // Subtracted at the end rather than counted down from, so that a club with
  // nothing to its name scores zero and not negative zero.
  return points - deducted
}

/**
 * Which clubs are in which group.
 *
 * Stored on the format where the competition was created with them, and worked
 * out from the fixtures where it was not: `groupIndex` is written on every
 * group match, so the grouping survives a config that lost it. Failing both,
 * the clubs are cut into equal groups in entry order, which is how they were
 * drawn in the first place.
 */
export function groupsOf(tournament: Tournament): string[][] {
  const config = tournament.format?.groupsWithDivisionsConfig
  if (!config) return []
  if (config.groups && config.groups.length > 0) return config.groups

  const found = new Map<number, string[]>()
  for (const match of tournament.matches ?? []) {
    if (match.isPlayoff || !match.groupIndex) continue
    const group = found.get(match.groupIndex) ?? []
    for (const id of [match.homeTeamId, match.awayTeamId]) {
      if (id && !group.includes(id)) group.push(id)
    }
    found.set(match.groupIndex, group)
  }

  const numberOfGroups = config.numberOfGroups || found.size || 4
  const teamsPerGroup = config.teamsPerGroup || 4
  const groups: string[][] = []
  for (let number = 1; number <= numberOfGroups; number++) {
    const reconstructed = found.get(number)
    if (reconstructed) {
      groups.push(reconstructed)
    } else {
      const start = (number - 1) * teamsPerGroup
      groups.push((tournament.teamIds ?? []).slice(start, start + teamsPerGroup))
    }
  }
  return groups
}

/** How a group is named on screen: the first is A. */
export const groupName = (index: number): string => `Group ${String.fromCharCode(65 + index)}`

export type TierMark = 'gold' | 'silver' | 'bronze' | 'advance'

export type PlayoffTier = {
  /** 1-based, and what a fixture of this bracket stores in `division`. */
  division: number
  /** The first place of a group's table it takes, 1-based. */
  from: number
  /** How many places it takes. */
  places: number
  /** What it is called on screen. */
  name: string
  /** The same in a badge's worth of characters. */
  badge: string
  /** What a qualifying row is marked as. */
  mark: TierMark
}

/** Named after the medals, because a season with more than one bracket ranks them. */
const TIER_NAMES = ['Gold', 'Silver', 'Bronze'] as const
const TIER_MARKS: TierMark[] = ['gold', 'silver', 'bronze']

/**
 * The playoff brackets a grouped season runs, strongest first.
 *
 * Each one takes a number of places from every group's table, and the places
 * run on from the bracket above: top two to the Gold playoffs and the next two
 * to the Silver is `[2, 2]`, and that pair is what this answers when nothing is
 * configured — what the generator, the regenerate button and both tables each
 * had written into them separately before it was a setting, so every season
 * drawn before then reads exactly as it did.
 *
 * A season with one bracket has no ranking to express, so it is called the
 * playoffs and the clubs through it are simply qualified. The medal names only
 * appear once there is a second bracket for them to rank against — which is
 * also why they are names here and not on each screen that prints one.
 */
export function playoffTiers(config?: {
  qualifiersPerGroup?: number
  secondDivisionPerGroup?: number
  thirdDivisionPerGroup?: number
}): PlayoffTier[] {
  const places = [
    Math.max(1, Math.round(config?.qualifiersPerGroup ?? 2)),
    Math.max(0, Math.round(config?.secondDivisionPerGroup ?? 2)),
    Math.max(0, Math.round(config?.thirdDivisionPerGroup ?? 0)),
  ]

  // A gap is an end: places run on from the bracket above, so nothing can come
  // after a bracket that takes nobody.
  const taken: number[] = []
  for (const count of places) {
    if (count < 1) break
    taken.push(count)
  }

  const ranked = taken.length > 1
  let from = 1
  return taken.map((count, index) => {
    const tier = {
      division: index + 1,
      from,
      places: count,
      name: ranked ? `${TIER_NAMES[index]} playoffs` : 'Playoffs',
      badge: ranked ? TIER_NAMES[index].charAt(0) : 'PO',
      mark: ranked ? TIER_MARKS[index] : ('advance' as TierMark),
    }
    from += count
    return tier
  })
}

/** Which bracket a place in a group's table goes to, if any. Zero-based index. */
export function tierAtPlace(tiers: PlayoffTier[], index: number): PlayoffTier | undefined {
  return tiers.find((tier) => index >= tier.from - 1 && index < tier.from - 1 + tier.places)
}

/** One table per group, keyed by the 1-based group number. Empty for every other format. */
export function groupTables(tournament: Tournament): Record<number, StandingsRow[]> {
  if (tournament.format?.mode !== 'groups_with_divisions') return {}

  const groups = groupsOf(tournament)
  if (groups.length === 0) return {}

  const rules = tableRules(tournament)
  const deducted = deductionTotals(tournament)
  const tables: Record<number, StandingsRow[]> = {}
  groups.forEach((teamIds, index) => {
    const number = index + 1
    const matches = (tournament.matches ?? []).filter((match) => {
      if (match.isPlayoff) return false
      if (match.groupIndex === number) return true
      // `groupIndex` is trusted wherever it is set. A fixture from before it
      // was written has to be placed by its pairing instead.
      return (
        !match.groupIndex &&
        teamIds.includes(match.homeTeamId) &&
        teamIds.includes(match.awayTeamId)
      )
    })
    tables[number] = tally(teamIds, matches, rules, deducted)
  })
  return tables
}

/** The competition's own table: every club in it, every match its rules count. */
export function leagueTable(tournament: Tournament): StandingsRow[] {
  return tally(
    tournament.teamIds ?? [],
    allMatches(tournament),
    tableRules(tournament),
    deductionTotals(tournament),
  )
}

export type PlayoffCut = {
  /** The clubs the table shows as through. Empty where the format has no cut. */
  teamIds: Set<string>
  /** True once the bracket names them, false while it is still the top of the table. */
  drawn: boolean
}

/**
 * How many clubs the format takes into its playoffs.
 *
 * Null where the question does not apply. A plain league and a straight
 * knockout have no cut at all, and neither does `progressive_elimination`:
 * everybody carries on from the round robin and one club goes out each week
 * instead, so there is no set of qualifiers to name.
 */
function configuredCut(tournament: Tournament): number | null {
  const format = tournament.format
  if (!format) return null
  if (format.customPlayoffConfig?.preset === 'progressive_elimination') return null

  const entered = (tournament.teamIds ?? []).length
  if (entered === 0) return null

  if (format.mode === 'league_playoff' || format.mode === 'swiss_elimination') {
    return Math.min(format.playoffQualifiers || 4, entered)
  }
  if (format.mode === 'league_custom_playoff') {
    const configured = format.customPlayoffConfig?.playoffTeams
    return configured ? Math.min(configured, entered) : null
  }
  return null
}

/**
 * Who is through to the playoffs.
 *
 * A league that ends in a knockout has no first, second and third to award: the
 * table decides who plays the finals and the finals decide the rest, so the
 * public table marks everyone who goes through and nobody in particular.
 *
 * The drawn bracket is the answer wherever there is one — those are the clubs
 * that actually qualified, whatever the format was configured to take, and a
 * seeding the organiser adjusted by hand is still the truth. Before it is drawn
 * the cut is the top of the table as it stands, which is a projection and moves
 * with every result.
 */
export function playoffCut(tournament: Tournament, table: StandingsRow[]): PlayoffCut {
  const none: PlayoffCut = { teamIds: new Set<string>(), drawn: false }
  if (!tournament.format) return none
  if (tournament.format.customPlayoffConfig?.preset === 'progressive_elimination') return none

  const drawn = new Set<string>()
  for (const match of allMatches(tournament)) {
    if (!match.isPlayoff) continue
    // A fixture in a round being held back arrives with no clubs on it, so it
    // contributes nothing rather than a pair of undefined ids.
    if (match.homeTeamId) drawn.add(match.homeTeamId)
    if (match.awayTeamId) drawn.add(match.awayTeamId)
  }
  if (drawn.size > 0) return { teamIds: drawn, drawn: true }

  const cut = configuredCut(tournament)
  if (!cut) return none
  return { teamIds: new Set(table.slice(0, cut).map((row) => row.id)), drawn: false }
}

/**
 * Who has been knocked out.
 *
 * A match decides it when it is flagged as an elimination, or when it is a
 * playoff in a format whose playoffs are knockouts. Hand-built rounds carry the
 * flag themselves, which is why they are not in the list of modes.
 */
export function eliminatedTeams(tournament: Tournament): Set<string> {
  const knockoutModes = ['league_playoff', 'swiss_elimination']
  const eliminated = new Set<string>()

  const matches = allMatches(tournament)

  for (const match of matches) {
    // Third place is played by two clubs that are already out, and losing it
    // puts nobody out who was not.
    if (match.isThirdPlace) continue

    const decidesElimination =
      match.isElimination === true ||
      (Boolean(match.isPlayoff) && knockoutModes.includes(tournament.format?.mode ?? ''))
    if (!decidesElimination) continue

    // Who lost is the tie's answer, not this fixture's: a tie can be two legs
    // added together, and either shape can be settled on penalties. Asking the
    // fixture alone put out the club that lost the first leg 1-0 and won the
    // second 3-0, and put out nobody at all when a cup tie finished level.
    const outcome = outcomeOf(match, matches)
    if (outcome) eliminated.add(outcome.loserId)
  }

  return eliminated
}

export type MatchTable = {
  rows: StandingsRow[]
  /** "Group B" where the table is one group of several, null for a whole competition. */
  label: string | null
}

/**
 * The table worth showing beside one fixture.
 *
 * A group game gets its own group rather than the whole draw — the other groups
 * say nothing about this match. A straight knockout gets nothing: every club
 * has played the same number of games and the bracket is the standing, so a
 * table sorted by points would be noise dressed as a league.
 */
export function tableForMatch(
  tournament: Tournament,
  homeTeamId: string,
  awayTeamId: string,
): MatchTable | null {
  if (tournament.format?.mode === 'knockout') return null

  if (tournament.format?.mode === 'groups_with_divisions') {
    const groups = groupsOf(tournament)
    const index = groups.findIndex(
      (ids) => ids.includes(homeTeamId) && ids.includes(awayTeamId),
    )
    // A pairing that crosses two groups is a playoff, and belongs to neither
    // table. The whole competition is the honest answer there, not one side's
    // group.
    if (index >= 0) {
      return { rows: groupTables(tournament)[index + 1] ?? [], label: groupName(index) }
    }
  }

  const rows = leagueTable(tournament)
  return rows.length > 0 ? { rows, label: null } : null
}
