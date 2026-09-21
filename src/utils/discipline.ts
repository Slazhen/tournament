import type { Match, Tournament } from '../types'
import { allMatches } from './matches'

/**
 * What a card costs a player, and who that leaves out of which match.
 *
 * Bookings used to feed nothing at all: they were drawn on the timeline, counted
 * into the two rows of the statistics table, and that was the end of them. A
 * suspension is the first thing derived from them, and like the table it is
 * derived and never stored — there is no "matches banned" counter anywhere in
 * the database, and a card corrected on the match screen has to move the answer
 * the same second.
 *
 * The rules belong to the season, the same way `format.scoring` does. What is
 * deliberately different is what an absent field means. An absent `scoring` has
 * to keep meaning three points for a win, because a table that has already been
 * published is a record people have read. Nothing was ever published about
 * suspensions, so there is no old answer to preserve: a season carrying no
 * rules is read at the defaults below — a red card costs the next match, two
 * bookings cost the next match, a blue costs nothing beyond the dismissal it
 * already is, and yellows do not accumulate.
 */

export type DisciplineRules = {
  /** Matches missed for a straight red. */
  red: number
  /** Matches missed for two bookings in the same match, kept apart from a straight red. */
  secondYellow: number
  /**
   * Matches missed for a blue card.
   *
   * Zero by default, which is the whole point of the colour: the player is off
   * for the rest of this match and available for the next one.
   */
  blue: number
  /** Every this many yellows costs a suspension. Zero means yellows never accumulate. */
  yellowEvery: number
  /** What reaching one of those thresholds costs. */
  yellowSuspension: number
  /**
   * How many yellows a second yellow adds to the running count.
   *
   * Zero by default: the dismissal is the punishment, and the counter that
   * would have sent the player off a week later is not also charged. A
   * competition that counts it sets one, or two for both bookings.
   */
  secondYellowCounts: number
  /** Every this many blues costs a suspension. Zero means blues never accumulate. */
  blueEvery: number
  /** What reaching one of those thresholds costs. */
  blueSuspension: number
}

export const DEFAULT_DISCIPLINE: DisciplineRules = {
  red: 1,
  secondYellow: 1,
  blue: 0,
  yellowEvery: 0,
  yellowSuspension: 1,
  secondYellowCounts: 0,
  blueEvery: 0,
  blueSuspension: 1,
}

/** Nobody sits out more than a season, and no threshold is worth more than a season. */
const MAX_SUSPENSION = 20
const MAX_THRESHOLD = 50

/**
 * A stored number, clamped to something a season can actually serve.
 *
 * `format` is one of the few things the API passes through whole, so anything
 * at all can be sitting in these fields, and a ban of `Infinity` matches is a
 * player no screen can ever show as available again.
 */
const rule = (value: unknown, fallback: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), 0), max)
}

/** The discipline rules this season is played by, read defensively. */
export function disciplineRules(tournament?: Tournament | null): DisciplineRules {
  const stored = tournament?.format?.discipline
  if (!stored || typeof stored !== 'object') return DEFAULT_DISCIPLINE

  return {
    red: rule(stored.red, DEFAULT_DISCIPLINE.red, MAX_SUSPENSION),
    secondYellow: rule(stored.secondYellow, DEFAULT_DISCIPLINE.secondYellow, MAX_SUSPENSION),
    blue: rule(stored.blue, DEFAULT_DISCIPLINE.blue, MAX_SUSPENSION),
    yellowEvery: rule(stored.yellowEvery, DEFAULT_DISCIPLINE.yellowEvery, MAX_THRESHOLD),
    yellowSuspension: rule(
      stored.yellowSuspension,
      DEFAULT_DISCIPLINE.yellowSuspension,
      MAX_SUSPENSION,
    ),
    secondYellowCounts: rule(stored.secondYellowCounts, DEFAULT_DISCIPLINE.secondYellowCounts, 2),
    blueEvery: rule(stored.blueEvery, DEFAULT_DISCIPLINE.blueEvery, MAX_THRESHOLD),
    blueSuspension: rule(stored.blueSuspension, DEFAULT_DISCIPLINE.blueSuspension, MAX_SUSPENSION),
  }
}

/** Whether this season's rules can ever suspend anybody. */
export const disciplineIsIdle = (rules: DisciplineRules): boolean =>
  rules.red === 0 &&
  rules.secondYellow === 0 &&
  rules.blue === 0 &&
  (rules.yellowEvery === 0 || rules.yellowSuspension === 0) &&
  (rules.blueEvery === 0 || rules.blueSuspension === 0)

/**
 * Where a fixture sits in the order a club plays its matches.
 *
 * The date, because that is what "the next match" means to everybody involved,
 * and the round where there is no date yet — a season drawn but not scheduled
 * still has an order, and a ban that waited for somebody to fill in a date
 * would never be served. Undated fixtures therefore come after the dated ones,
 * among themselves by round; a playoff round comes after every league round,
 * which is the one thing the two numbering schemes agree on.
 *
 * `byKickoffAscending` in `PublicTournamentPage.tsx` is the same idea for the
 * fixture list. It is not shared, because that one orders every club's matches
 * together and this one orders one club's.
 */
const orderKey = (match: Match): { time: number; round: number } => ({
  time: match.dateISO ? new Date(match.dateISO).getTime() : Number.NaN,
  round: match.isPlayoff ? 1000 + (match.playoffRound ?? 0) : (match.round ?? 0),
})

const byOrder = (a: Match, b: Match): number => {
  const left = orderKey(a)
  const right = orderKey(b)
  const leftUndated = Number.isNaN(left.time)
  const rightUndated = Number.isNaN(right.time)
  if (leftUndated && rightUndated) return left.round - right.round
  if (leftUndated) return 1
  if (rightUndated) return -1
  if (left.time !== right.time) return left.time - right.time
  return left.round - right.round
}

/**
 * The matches one club plays in this season, in the order it plays them.
 *
 * A fixture naming the same club on both sides is a bye and is skipped, the way
 * `countRows` skips it in the table: nobody serves a ban in a match nobody
 * played. A cancelled fixture is skipped for the same reason — it is a match
 * that will not be played at all, and a ban served by one is a ban nobody sat
 * out. A postponed one is kept: it is going to be played, only later.
 */
export function clubMatches(tournament: Tournament | null | undefined, teamId: string): Match[] {
  return allMatches(tournament)
    .filter((match) => {
      if (!match || match.hidden || !match.id) return false
      if (match.status === 'cancelled') return false
      if (match.homeTeamId === match.awayTeamId) return false
      return match.homeTeamId === teamId || match.awayTeamId === teamId
    })
    .sort(byOrder)
}

/** Whether both scores have been entered — the one definition used everywhere here. */
const isPlayed = (match: Match): boolean =>
  typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'

/** One player's disciplinary standing in one competition. */
export type DisciplineRecord = {
  playerId: string
  teamId: string
  yellows: number
  secondYellows: number
  reds: number
  blues: number
  /**
   * Yellows still to go before the next accumulated ban, or null where the
   * season does not accumulate them.
   */
  yellowsToNextBan: number | null
  /** The club's matches this player misses, earliest first, and why. */
  missing: Array<{ matchId: string; reason: string }>
  /**
   * Matches of the ban the season has no fixture left to serve.
   *
   * A red card in the last round leaves one of these. It is shown rather than
   * dropped, because an organiser deciding whether to add a round wants to know
   * the ban is outstanding.
   */
  outstanding: number
}

/** Who is out of one match, and why. */
export type Suspension = {
  playerId: string
  teamId: string
  matchId: string
  reason: string
}

const ordinal = (n: number): string => {
  const rest = n % 100
  if (rest >= 11 && rest <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

type Running = {
  yellows: number
  secondYellows: number
  reds: number
  blues: number
  /** Yellows since the last accumulated ban, which is what the next one is counted from. */
  sinceYellowBan: number
  sinceBlueBan: number
  /** Matches still to sit out, and why each of them. */
  queued: string[]
}

const blank = (): Running => ({
  yellows: 0,
  secondYellows: 0,
  reds: 0,
  blues: 0,
  sinceYellowBan: 0,
  sinceBlueBan: 0,
  queued: [],
})

/**
 * What the cards of one match add to one player's queue.
 *
 * The accumulated thresholds repeat rather than firing once: a season that
 * suspends on the second yellow suspends again on the fourth, with the counter
 * starting from nothing each time. That is what every competition that counts
 * bookings does, and the alternative — one ban and then bookings that cost
 * nothing for the rest of the season — is a rule an organiser has to be told
 * about before they can believe the table.
 */
function applyCard(
  type: string,
  state: Running,
  rules: DisciplineRules,
  queue: (reason: string, matches: number) => void,
): void {
  if (type === 'red') {
    state.reds++
    queue('Red card', rules.red)
    return
  }

  if (type === 'second_yellow') {
    state.secondYellows++
    queue('Two bookings', rules.secondYellow)
    // Counted into the running total only where the season says so. The
    // dismissal is already the punishment, and charging the counter as well is
    // a second one nobody watching the match would have expected.
    for (let i = 0; i < rules.secondYellowCounts; i++) {
      state.yellows++
      state.sinceYellowBan++
      if (rules.yellowEvery > 0 && state.sinceYellowBan >= rules.yellowEvery) {
        state.sinceYellowBan = 0
        queue(`${ordinal(state.yellows)} yellow card`, rules.yellowSuspension)
      }
    }
    return
  }

  if (type === 'blue') {
    state.blues++
    queue('Blue card', rules.blue)
    state.sinceBlueBan++
    if (rules.blueEvery > 0 && state.sinceBlueBan >= rules.blueEvery) {
      state.sinceBlueBan = 0
      queue(`${ordinal(state.blues)} blue card`, rules.blueSuspension)
    }
    return
  }

  state.yellows++
  state.sinceYellowBan++
  if (rules.yellowEvery > 0 && state.sinceYellowBan >= rules.yellowEvery) {
    state.sinceYellowBan = 0
    queue(`${ordinal(state.yellows)} yellow card`, rules.yellowSuspension)
  }
}

export type Discipline = {
  rules: DisciplineRules
  /** One row per player who has been shown a card in this competition. */
  records: DisciplineRecord[]
  /** Who is out of which match, keyed by match id. */
  suspensions: Map<string, Suspension[]>
}

/**
 * The whole disciplinary picture of one season, worked out in one pass.
 *
 * Every club's matches are walked in the order that club plays them. At each
 * one, anybody carrying a ban misses it and the ban is one match shorter;
 * afterwards, the cards shown in that match are added. A card therefore never
 * costs the match it was shown in, which is what makes the blue card what it is
 * — the player is off for the rest of that match, and the next one is not
 * touched.
 *
 * Bans are served by fixtures whether or not they have been played, because
 * what an organiser and a coach need to read is who is out of the *coming*
 * match. Cards only exist on matches somebody has filled in, so the order takes
 * care of itself.
 */
export function disciplineOf(tournament: Tournament | null | undefined): Discipline {
  const rules = disciplineRules(tournament)
  const suspensions = new Map<string, Suspension[]>()
  const records: DisciplineRecord[] = []

  for (const teamId of tournament?.teamIds ?? []) {
    const fixtures = clubMatches(tournament, teamId)
    const states = new Map<string, Running>()
    const missing = new Map<string, Array<{ matchId: string; reason: string }>>()

    for (const match of fixtures) {
      // Serve first, then book: the cards of this match belong to the next one.
      for (const [playerId, state] of states) {
        const reason = state.queued.shift()
        if (reason === undefined) continue

        const list = suspensions.get(match.id) ?? []
        list.push({ playerId, teamId, matchId: match.id, reason })
        suspensions.set(match.id, list)

        if (!isPlayed(match)) {
          const mine = missing.get(playerId) ?? []
          mine.push({ matchId: match.id, reason })
          missing.set(playerId, mine)
        }
      }

      const side = match.homeTeamId === teamId ? 'home' : 'away'
      for (const card of match.cards ?? []) {
        if (card?.team !== side || typeof card.playerId !== 'string' || !card.playerId) continue
        const state = states.get(card.playerId) ?? blank()
        states.set(card.playerId, state)
        applyCard(card.type, state, rules, (reason, matches) => {
          for (let i = 0; i < matches; i++) state.queued.push(reason)
        })
      }
    }

    for (const [playerId, state] of states) {
      records.push({
        playerId,
        teamId,
        yellows: state.yellows,
        secondYellows: state.secondYellows,
        reds: state.reds,
        blues: state.blues,
        yellowsToNextBan:
          rules.yellowEvery > 0 && rules.yellowSuspension > 0
            ? rules.yellowEvery - state.sinceYellowBan
            : null,
        missing: missing.get(playerId) ?? [],
        outstanding: state.queued.length,
      })
    }
  }

  return { rules, records, suspensions }
}

/** Who is out of one match. Empty for every match of a season that suspends nobody. */
export function suspendedInMatch(
  tournament: Tournament | null | undefined,
  matchId: string,
): Suspension[] {
  return disciplineOf(tournament).suspensions.get(matchId) ?? []
}
