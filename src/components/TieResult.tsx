import type { Match, Team, Tournament } from '../types'
import { allMatches } from '../utils/matches'
import { aggregateOf, isDecidingLeg, legsOfTie, tieOutcome } from '../utils/ties'

type TieResultProps = {
  tournament: Tournament
  match: Match
  homeTeam?: Team | null
  awayTeam?: Team | null
}

/**
 * What the score alone does not say about a knockout tie.
 *
 * A visitor reading 1-1 under a cup fixture has been told who played and not
 * who went through, and the two legs of a tie are two pages that each show half
 * a result. This is the line that finishes the sentence, and it draws nothing at
 * all for a league fixture or a tie that was won on the day.
 */
export default function TieResult({ tournament, match, homeTeam, awayTeam }: TieResultProps) {
  const knockout = match.isElimination === true || Boolean(match.tie)
  if (!knockout || match.isThirdPlace) return null

  const matches = allMatches(tournament)
  const legs = legsOfTie(match, matches)
  const aggregate = aggregateOf(legs)
  const outcome = tieOutcome(legs)

  const nameOf = (id: string) =>
    [homeTeam, awayTeam].find((team) => team?.id === id)?.name ?? 'The winner'

  if (!aggregate && !outcome) {
    return legs.length > 1 && !isDecidingLeg(match, matches) ? (
      <p className="text-center text-sm text-gray-400">
        First leg of two. The tie is decided on the two scores together.
      </p>
    ) : null
  }

  const shootout = legs.find((leg) => leg.shootout)?.shootout

  return (
    <div className="text-center text-sm text-gray-300 space-y-0.5">
      {aggregate && (
        <p>
          {nameOf(aggregate.homeTeamId)} {aggregate.home}–{aggregate.away}{' '}
          {nameOf(aggregate.awayTeamId)} on aggregate
        </p>
      )}
      {outcome?.decidedBy === 'shootout' && shootout && (
        <p>
          {nameOf(outcome.winnerId)} won {Math.max(shootout.home, shootout.away)}–
          {Math.min(shootout.home, shootout.away)} on penalties
        </p>
      )}
      {outcome && outcome.decidedBy !== 'score' && (
        <p className="text-gray-400">{nameOf(outcome.winnerId)} went through</p>
      )}
    </div>
  )
}
