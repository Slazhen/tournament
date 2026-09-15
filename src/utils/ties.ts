import type { Match } from '../types'

/**
 * Who won, when winning takes more than one score.
 *
 * A knockout tie used to be one fixture and one comparison, written out
 * wherever somebody needed the answer — in the bracket that advances winners,
 * and in the set of clubs the table strikes through. Two of them, and they
 * already disagreed about a draw: the bracket refused to advance anybody and
 * the table struck out nobody, which is correct for a league and is a tie
 * nobody can finish for a cup.
 *
 * So there is one answer here and three shapes of question behind it: one
 * match, two legs added together, and either of those settled on penalties.
 */

export type TieDecision = 'score' | 'aggregate' | 'shootout'

export type TieOutcome = {
  winnerId: string
  loserId: string
  decidedBy: TieDecision
}

const played = (match: Match): boolean =>
  typeof match.homeGoals === 'number' &&
  typeof match.awayGoals === 'number' &&
  !Number.isNaN(match.homeGoals) &&
  !Number.isNaN(match.awayGoals)

const named = (match: Match): boolean =>
  Boolean(match.homeTeamId) && Boolean(match.awayTeamId) && match.homeTeamId !== match.awayTeamId

/**
 * Every fixture of the tie this match belongs to, in leg order.
 *
 * A match with no `tie` is its own tie, which is what every knockout in the
 * database is and what a one-legged round still is.
 */
export function legsOfTie(match: Match, matches: Match[]): Match[] {
  const id = match.tie?.id
  if (!id) return [match]
  return matches
    .filter((candidate) => candidate.tie?.id === id)
    .sort((a, b) => (a.tie?.leg ?? 1) - (b.tie?.leg ?? 1))
}

/**
 * How a tie ended, or nothing at all.
 *
 * Nothing is the answer while a leg is unplayed, while the pairing is still
 * empty, and when two legs and a shootout have all finished level — which
 * cannot happen on a pitch but can certainly be typed in, and inventing a
 * winner from it would put a club into the next round on the strength of a
 * mistake.
 */
export function tieOutcome(legs: Match[]): TieOutcome | null {
  const fixtures = legs.filter(named)
  if (fixtures.length === 0 || !fixtures.every(played)) return null

  // The first leg names the sides. The second reverses them, so everything is
  // counted from the first leg's point of view.
  const [first] = fixtures
  const home = first.homeTeamId
  const away = first.awayTeamId

  let homeGoals = 0
  let awayGoals = 0
  for (const leg of fixtures) {
    const forHome = leg.homeTeamId === home ? leg.homeGoals : leg.awayGoals
    const forAway = leg.homeTeamId === home ? leg.awayGoals : leg.homeGoals
    homeGoals += forHome as number
    awayGoals += forAway as number
  }

  if (homeGoals !== awayGoals) {
    return {
      winnerId: homeGoals > awayGoals ? home : away,
      loserId: homeGoals > awayGoals ? away : home,
      decidedBy: fixtures.length > 1 ? 'aggregate' : 'score',
    }
  }

  // Level: the shootout is on whichever leg was the one that needed it, which
  // is the last, but an organiser filling in an old sheet may have put it on
  // either and the answer should not depend on that.
  const decider = [...fixtures].reverse().find((leg) => leg.shootout)
  const shootout = decider?.shootout
  if (!decider || !shootout) return null
  if (typeof shootout.home !== 'number' || typeof shootout.away !== 'number') return null
  if (shootout.home === shootout.away) return null

  const wonTheShootout =
    shootout.home > shootout.away ? decider.homeTeamId : decider.awayTeamId

  return {
    winnerId: wonTheShootout,
    loserId: wonTheShootout === home ? away : home,
    decidedBy: 'shootout',
  }
}

/** The outcome of the tie one match belongs to. */
export const outcomeOf = (match: Match, matches: Match[]): TieOutcome | null =>
  tieOutcome(legsOfTie(match, matches))

/**
 * Whether this fixture is the one where the tie is settled.
 *
 * A shootout belongs on the last leg, so that is the only fixture offered the
 * field, and the aggregate is worth printing there and nowhere else.
 */
export function isDecidingLeg(match: Match, matches: Match[]): boolean {
  const legs = legsOfTie(match, matches)
  return legs.length === 0 || legs[legs.length - 1].id === match.id
}

/** The two legs added up, from the home side of the first leg. Null for a single match. */
export function aggregateOf(
  legs: Match[],
): { homeTeamId: string; awayTeamId: string; home: number; away: number } | null {
  const fixtures = legs.filter(named)
  if (fixtures.length < 2 || !fixtures.every(played)) return null

  const [first] = fixtures
  let home = 0
  let away = 0
  for (const leg of fixtures) {
    home += (leg.homeTeamId === first.homeTeamId ? leg.homeGoals : leg.awayGoals) as number
    away += (leg.homeTeamId === first.homeTeamId ? leg.awayGoals : leg.homeGoals) as number
  }
  return { homeTeamId: first.homeTeamId, awayTeamId: first.awayTeamId, home, away }
}
