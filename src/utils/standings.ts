import type { Match, Tournament } from '../types'
import { allMatches } from './matches'

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
}

const emptyRow = (id: string): StandingsRow => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })

/** A fixture counts only when both scores are real numbers — NaN makes every total NaN. */
const decided = (match: Match): boolean =>
  typeof match.homeGoals === 'number' &&
  typeof match.awayGoals === 'number' &&
  !Number.isNaN(match.homeGoals) &&
  !Number.isNaN(match.awayGoals) &&
  match.homeGoals >= 0 &&
  match.awayGoals >= 0

function tally(teamIds: string[], matches: Match[]): StandingsRow[] {
  const stats = new Map<string, StandingsRow>()
  for (const id of teamIds) if (id) stats.set(id, emptyRow(id))

  for (const match of matches) {
    if (!decided(match)) continue
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
      home.pts += 3
    } else if (homeGoals < awayGoals) {
      away.w++
      home.l++
      away.pts += 3
    } else {
      home.d++
      away.d++
      home.pts++
      away.pts++
    }
  }

  // Points, then goal difference, then goals scored. Nothing here separates two
  // clubs level on all three, and the comparator says so rather than guessing:
  // sort is stable, so they hold the order the competition entered them in,
  // which is the same order on every render.
  return [...stats.values()].sort(
    (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf,
  )
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

/** One table per group, keyed by the 1-based group number. Empty for every other format. */
export function groupTables(tournament: Tournament): Record<number, StandingsRow[]> {
  if (tournament.format?.mode !== 'groups_with_divisions') return {}

  const groups = groupsOf(tournament)
  if (groups.length === 0) return {}

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
    tables[number] = tally(teamIds, matches)
  })
  return tables
}

/** The competition's own table: every club in it, every match it holds. */
export function leagueTable(tournament: Tournament): StandingsRow[] {
  return tally(tournament.teamIds ?? [], allMatches(tournament))
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

  for (const match of allMatches(tournament)) {
    const decidesElimination =
      match.isElimination === true ||
      (Boolean(match.isPlayoff) && knockoutModes.includes(tournament.format?.mode ?? ''))
    if (!decidesElimination) continue
    if (!match.homeTeamId || !match.awayTeamId || match.homeTeamId === match.awayTeamId) continue
    if (typeof match.homeGoals !== 'number' || typeof match.awayGoals !== 'number') continue

    if (match.homeGoals > match.awayGoals) eliminated.add(match.awayTeamId)
    else if (match.homeGoals < match.awayGoals) eliminated.add(match.homeTeamId)
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
