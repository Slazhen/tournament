import type { Match, Team, Tournament } from '../types'
import { allMatches } from '../utils/matches'
import { aggregateOf, isDecidingLeg, legsOfTie, tieOutcome } from '../utils/ties'
import InlineInput from './InlineInput'

type ShootoutPanelProps = {
  tournament: Tournament
  match: Match
  homeTeam?: Team
  awayTeam?: Team
  onChange: (shootout: { home: number; away: number } | null) => void
}

const nameOf = (teams: Array<Team | undefined>, id: string): string =>
  teams.find((team) => team?.id === id)?.name ?? 'the other club'

/**
 * How a knockout tie was settled, where the score alone does not settle it.
 *
 * It draws nothing for a league fixture, and nothing on the first leg of a tie:
 * the aggregate is not known yet there, and a shootout entered on it would be a
 * shootout after ninety minutes of a tie that has another ninety to run.
 *
 * The panel is shown as soon as the fixture is a knockout, rather than only once
 * the scores happen to be level, because an organiser typing a result needs to
 * see where the penalties go before they have typed it.
 */
export default function ShootoutPanel({
  tournament,
  match,
  homeTeam,
  awayTeam,
  onChange,
}: ShootoutPanelProps) {
  const knockout = match.isElimination === true || Boolean(match.tie)
  if (!knockout || match.isThirdPlace) return null

  const matches = allMatches(tournament)
  const legs = legsOfTie(match, matches)
  if (!isDecidingLeg(match, matches)) {
    return (
      <p className="text-sm opacity-60 text-center">
        First leg. The tie is decided on the two scores added together, in the second.
      </p>
    )
  }

  const aggregate = aggregateOf(legs)
  const outcome = tieOutcome(legs)
  const teams = [homeTeam, awayTeam]
  const shootout = match.shootout

  const level =
    typeof match.homeGoals === 'number' &&
    typeof match.awayGoals === 'number' &&
    (aggregate ? aggregate.home === aggregate.away : match.homeGoals === match.awayGoals)

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-3">
      {aggregate && (
        <p className="text-sm text-center">
          <span className="opacity-70">On aggregate: </span>
          {nameOf(teams, aggregate.homeTeamId)} {aggregate.home}–{aggregate.away}{' '}
          {nameOf(teams, aggregate.awayTeamId)}
        </p>
      )}

      {level && (
        <div className="flex items-end justify-center gap-3">
          <label className="text-center text-sm">
            <span className="block opacity-70 mb-1">{homeTeam?.name ?? 'Home'}</span>
            <InlineInput
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Home penalties"
              placeholder="-"
              value={typeof shootout?.home === 'number' ? shootout.home : ''}
              onCommit={(value) =>
                onChange(
                  value === ''
                    ? null
                    : { home: Number(value), away: shootout?.away ?? 0 },
                )
              }
              className="w-16 text-center text-xl font-semibold bg-transparent rounded-md border border-white/10 hover:border-white/25 focus:border-white/40 focus:outline-none"
            />
          </label>
          <span className="pb-2 text-sm opacity-60">penalties</span>
          <label className="text-center text-sm">
            <span className="block opacity-70 mb-1">{awayTeam?.name ?? 'Away'}</span>
            <InlineInput
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Away penalties"
              placeholder="-"
              value={typeof shootout?.away === 'number' ? shootout.away : ''}
              onCommit={(value) =>
                onChange(
                  value === ''
                    ? null
                    : { home: shootout?.home ?? 0, away: Number(value) },
                )
              }
              className="w-16 text-center text-xl font-semibold bg-transparent rounded-md border border-white/10 hover:border-white/25 focus:border-white/40 focus:outline-none"
            />
          </label>
        </div>
      )}

      <p className="text-xs opacity-60 text-center">
        {outcome
          ? `${nameOf(teams, outcome.winnerId)} goes through${
              outcome.decidedBy === 'shootout'
                ? ' on penalties'
                : outcome.decidedBy === 'aggregate'
                  ? ' on aggregate'
                  : ''
            }.`
          : level
            ? 'Level. Enter the shootout to say who went through.'
            : 'The winner of this tie goes into the next round as soon as the score is saved.'}
      </p>
    </div>
  )
}
