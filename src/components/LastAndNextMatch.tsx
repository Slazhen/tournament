import { Link } from 'react-router-dom'
import type { Tournament } from '../types'
import type { TeamFixture } from '../utils/matches'
import { lastAndNextFor } from '../utils/matches'
import { formatMatchDateTime } from '../utils/datetime'
import { seasonLabel, seriesName } from '../utils/seasons'

/**
 * The two matches a visitor to a club's page is actually looking for: how the
 * last one went and when the next one is.
 *
 * The page listed every fixture of every season and said nothing about which of
 * them mattered today, so the answer to "are they playing this weekend" was
 * somewhere in a table of thirty rows.
 *
 * Both are drawn across all the club's competitions rather than per season: a
 * club playing in a league and a cup at once has one next match, not one per
 * competition, and the competition it belongs to is named on the line itself.
 */
export default function LastAndNextMatch({
  tournaments,
  teamId,
  teamNames,
}: {
  /** The competitions this club plays in — public ones only, on a public page. */
  tournaments: Tournament[]
  teamId: string
  teamNames: Record<string, string>
}) {
  const { last, next } = lastAndNextFor(tournaments, teamId)

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <Half
        title="Last match"
        fixture={last}
        teamId={teamId}
        teamNames={teamNames}
        empty="No games played yet."
      />
      <div className="border-t border-white/10">
        <Half
          title="Next match"
          fixture={next}
          teamId={teamId}
          teamNames={teamNames}
          empty="Nothing scheduled."
        />
      </div>
    </div>
  )
}

function Half({
  title,
  fixture,
  teamId,
  teamNames,
  empty,
}: {
  title: string
  fixture: TeamFixture | null
  teamId: string
  teamNames: Record<string, string>
  empty: string
}) {
  return (
    <div className="p-3">
      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1.5">{title}</div>
      {fixture ? (
        <Fixture fixture={fixture} teamId={teamId} teamNames={teamNames} />
      ) : (
        <p className="text-sm text-gray-500">{empty}</p>
      )}
    </div>
  )
}

function Fixture({
  fixture,
  teamId,
  teamNames,
}: {
  fixture: TeamFixture
  teamId: string
  teamNames: Record<string, string>
}) {
  const { match, tournament } = fixture
  const home = match.homeTeamId === teamId
  const opponent = teamNames[home ? match.awayTeamId : match.homeTeamId]

  // isPlayed has already been established by which half this fixture came from,
  // but the scores are optional on the type, so read them as numbers or not at
  // all rather than asserting.
  const ours = home ? match.homeGoals : match.awayGoals
  const theirs = home ? match.awayGoals : match.homeGoals
  const decided = typeof ours === 'number' && typeof theirs === 'number'

  const outcome = !decided ? null : ours > theirs ? 'Won' : ours < theirs ? 'Lost' : 'Drew'
  const outcomeColor =
    outcome === 'Won' ? 'text-green-400' : outcome === 'Lost' ? 'text-red-400' : 'text-yellow-400'

  return (
    <Link
      to={`/public/tournaments/${tournament.id}/matches/${match.id}`}
      className="block rounded-lg -m-1 p-1 hover:bg-white/5 transition-colors"
    >
      {decided && (
        <div className="flex items-baseline gap-2">
          <span className={`text-sm ${outcomeColor}`}>{outcome}</span>
          <span className="text-lg font-semibold">
            {ours} : {theirs}
          </span>
        </div>
      )}
      <div className={decided ? 'text-sm text-gray-200' : 'text-lg font-semibold'}>
        {opponent ? `vs ${opponent}` : 'Opponent to be confirmed'}
        <span className="text-gray-400 font-normal"> · {home ? 'home' : 'away'}</span>
      </div>
      <div className="text-sm text-gray-300 mt-0.5">{formatMatchDateTime(match.dateISO)}</div>
      <div className="text-xs text-gray-400 mt-1">
        {seriesName(tournament)} {seasonLabel(tournament)}
      </div>
    </Link>
  )
}
