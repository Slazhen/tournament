import type { Tournament } from './types.js'

/**
 * Taking a club that is being deleted out of the seasons it was entered in.
 *
 * Deleting a club used to remove the record and nothing else, so every season
 * it was in went on naming an id that resolved to nothing: "Unknown club" in
 * the table, six fixtures against nobody, and no control anywhere to take it
 * out, because the settings screen only lists clubs that exist. It happened in
 * September 2026 to a club created twice by mistake, where the one deleted was
 * the one already entered.
 *
 * A season where the club has not played is simply left without it. A season
 * where it has a result is not touched here: that result is part of other
 * clubs' records, and the route refuses the delete instead (see `hasPlayedIn`,
 * which counts a goal, a card or a teamsheet as well as a score).
 */

type Row = Record<string, unknown>

const LEAGUE_MODES = new Set(['league', 'league_playoff', 'league_custom_playoff'])

/** The same test as `hasResult` in src/utils/fixtures.ts: a score was entered. */
export const hasResult = (match: unknown): boolean => {
  const row = (match ?? {}) as Row
  return typeof row.homeGoals === 'number' || typeof row.awayGoals === 'number'
}

const involves = (match: unknown, teamId: string): boolean => {
  const row = (match ?? {}) as Row
  return row.homeTeamId === teamId || row.awayTeamId === teamId
}

type PlayoffRound = Row & { matches?: unknown[] }

const playoffRoundsOf = (tournament: Tournament): PlayoffRound[] | null => {
  const format = tournament.format as Row | undefined
  const custom = format?.customPlayoffConfig as Row | undefined
  return Array.isArray(custom?.playoffRounds) ? (custom!.playoffRounds as PlayoffRound[]) : null
}

/** Every fixture the season holds, in `matches` and in the hand-built rounds. */
function everyMatch(tournament: Tournament): unknown[] {
  const matches = Array.isArray(tournament.matches) ? [...tournament.matches] : []
  for (const round of playoffRoundsOf(tournament) ?? []) {
    if (Array.isArray(round?.matches)) matches.push(...round.matches)
  }
  return matches
}

/** Whether the club is named anywhere in the season. */
export function isIn(tournament: Tournament, teamId: string): boolean {
  if (Array.isArray(tournament.teamIds) && tournament.teamIds.includes(teamId)) return true
  return everyMatch(tournament).some((match) => involves(match, teamId))
}

const nonEmpty = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0
    : !!value && typeof value === 'object' && Object.keys(value).length > 0

/**
 * Whether anything that happened in this fixture has been written down: a
 * score, a goal, a card, a teamsheet. A score alone is too narrow — a red card
 * entered before the result belongs to the other club's player too, and
 * dropping the fixture would take it, and the suspension it carries, with it.
 */
export const hasHappened = (match: unknown): boolean => {
  const row = (match ?? {}) as Row
  return hasResult(row) || nonEmpty(row.goals) || nonEmpty(row.cards) || nonEmpty(row.lineups)
}

/** Whether the club has played in the season, which is what makes it stay. */
export function hasPlayedIn(tournament: Tournament, teamId: string): boolean {
  return everyMatch(tournament).some((match) => involves(match, teamId) && hasHappened(match))
}

/**
 * Whether the fixture list is exactly the draw the generator made for this
 * line-up, fixture for fixture, with nothing added to any of them.
 *
 * Only such a season may be drawn again, because drawing again throws the
 * fixtures away. Comparing against the generator rather than looking for a
 * date is what also catches the edits that leave no field behind: home and
 * away swapped by hand, a fixture moved to another round, one added or taken
 * out. An empty list is not a draw, and a season the organiser has not drawn
 * is not ours to draw.
 */
function isTheGeneratedDraw(matches: unknown[], teamIds: string[], legs: number): boolean {
  if (matches.length === 0) return false
  const expected = roundRobin(teamIds, legs)
  if (expected.length !== matches.length) return false
  const byId = new Map(expected.map((match) => [match.id, match]))
  return matches.every((match) => {
    const row = (match ?? {}) as Row
    const drawn = byId.get(row.id)
    if (!drawn) return false
    return Object.entries(row).every(([key, value]) =>
      key in drawn ? drawn[key] === value : value === undefined || value === null,
    )
  })
}

/**
 * The round-robin draw, identical to `generateRoundRobinSchedule` in
 * src/utils/schedule.ts — the same circle method, the same ids — so a season
 * redrawn here is the season the settings screen would have drawn. The server
 * cannot import the site's code, which is why it is copied rather than shared;
 * change the two together.
 */
export function roundRobin(teamIds: string[], legs = 1): Row[] {
  if (teamIds.length < 2) return []
  const teams = [...teamIds]
  if (teams.length % 2 === 1) teams.push('BYE')
  const count = teams.length
  const rounds = count - 1
  const matches: Row[] = []
  const left = teams.slice(0, count / 2)
  const right = teams.slice(count / 2).reverse()

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < left.length; i++) {
      const home = left[i]
      const away = right[i]
      if (home === 'BYE' || away === 'BYE') continue
      for (let leg = 0; leg < Math.max(1, Math.min(4, legs)); leg++) {
        const globalRound = round + leg * rounds
        matches.push({
          id: `${globalRound}-${home}-${away}-${leg}`,
          homeTeamId: globalRound % 2 === 0 ? home : away,
          awayTeamId: globalRound % 2 === 0 ? away : home,
          round: globalRound,
        })
      }
    }
    const fixed = left[0]
    const fromLeft = left.pop()!
    const fromRight = right.shift()!
    left[0] = fixed
    left.splice(1, 0, fromRight)
    right.push(fromLeft)
  }
  return matches
}

export type Withdrawal = {
  /** The attributes to write, each one whole, from the copy that was read. */
  updates: Record<string, unknown>
  /** Fixtures of the club's that went. */
  dropped: number
  /** Whether the whole draw was made again rather than thinned out. */
  redrawn: boolean
}

/**
 * What the season looks like without the club. Null when it is not in it.
 *
 * The caller has checked `hasPlayedIn` first; everything removed here is a
 * fixture with no result.
 *
 * A league season whose fixtures are still exactly the generated draw — no
 * result, date, venue, teamsheet or hand edit anywhere, no hidden round — is
 * drawn again for the clubs that remain, which is
 * what the settings screen does when the line-up changes before a ball is
 * kicked: seven clubs less one is a five-round season, not seven rounds with a
 * gap in each. Anything else loses the club's fixtures and keeps the rest where
 * the organiser put them. Groups and brackets are never redrawn here: the
 * groups were chosen, and a bracket drawn on the server would be a second
 * generator to keep in step with the site's.
 */
export function withdrawClub(tournament: Tournament, teamId: string): Withdrawal | null {
  if (!isIn(tournament, teamId)) return null

  const updates: Record<string, unknown> = {}
  const teamIds = Array.isArray(tournament.teamIds) ? tournament.teamIds : []
  const remaining = teamIds.filter((id) => id !== teamId)
  if (remaining.length !== teamIds.length) updates.teamIds = remaining

  const squads = tournament.squads as Row | undefined
  if (squads && typeof squads === 'object' && teamId in squads) {
    const { [teamId]: _gone, ...rest } = squads
    updates.squads = rest
  }

  const format = tournament.format as Row | undefined
  const matches = Array.isArray(tournament.matches) ? tournament.matches : []
  const dropped = everyMatch(tournament).filter((match) => involves(match, teamId)).length

  const legs = typeof format?.rounds === 'number' && format.rounds > 0 ? format.rounds : 1
  const hiddenRounds = tournament.hiddenRounds
  const redraw =
    LEAGUE_MODES.has(String(format?.mode)) &&
    isTheGeneratedDraw(matches, teamIds, legs) &&
    // A hidden round is hidden by number; after a redraw that number holds
    // other fixtures, and what the organiser kept back would be on show.
    !(Array.isArray(hiddenRounds) && hiddenRounds.length > 0) &&
    // A hand-built playoff round is the organiser's work even when nothing in
    // it has been played; a redraw only ever rebuilds `matches`.
    (playoffRoundsOf(tournament) ?? []).every((round) => !Array.isArray(round?.matches) || round.matches.length === 0)

  if (redraw) {
    updates.matches = roundRobin(remaining, legs)
  } else if (matches.some((match) => involves(match, teamId))) {
    updates.matches = matches.filter((match) => !involves(match, teamId))
  }

  let formatChanged = false
  const nextFormat: Row = { ...(format ?? {}) }

  const rounds = playoffRoundsOf(tournament)
  if (rounds && rounds.some((round) => (round.matches ?? []).some((m) => involves(m, teamId)))) {
    nextFormat.customPlayoffConfig = {
      ...(format!.customPlayoffConfig as Row),
      playoffRounds: rounds.map((round) =>
        Array.isArray(round?.matches)
          ? { ...round, matches: round.matches.filter((m) => !involves(m, teamId)) }
          : round,
      ),
    }
    formatChanged = true
  }

  const groupsConfig = format?.groupsWithDivisionsConfig as Row | undefined
  if (Array.isArray(groupsConfig?.groups)) {
    const groups = groupsConfig!.groups as unknown[]
    if (groups.some((group) => Array.isArray(group) && group.includes(teamId))) {
      nextFormat.groupsWithDivisionsConfig = {
        ...groupsConfig,
        groups: groups.map((group) =>
          Array.isArray(group) ? group.filter((id) => id !== teamId) : group,
        ),
      }
      formatChanged = true
    }
  }

  if (formatChanged) updates.format = nextFormat

  return { updates, dropped, redrawn: redraw }
}
