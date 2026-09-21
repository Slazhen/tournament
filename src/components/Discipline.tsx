import { useMemo } from 'react'
import type { Player, Team, Tournament } from '../types'
import { disciplineOf, disciplineIsIdle, type DisciplineRecord } from '../utils/discipline'
import { playerLabel } from '../utils/players'
import { IconCard } from './icons'

/**
 * Who has been booked, and who that leaves out of the next match.
 *
 * Everything here is derived from `match.cards` and the season's rules, in
 * `utils/discipline.ts`, and nothing is stored: a card corrected on the match
 * screen moves these rows the same second, and a competition whose rules
 * suspend nobody has nothing to show but the counts.
 */

/** Every player of every club, by id — including the ones who have left. */
function squadIndex(teams: Team[]): Map<string, { player: Player; team: Team }> {
  const index = new Map<string, { player: Player; team: Team }>()
  for (const team of teams) {
    for (const player of team.players ?? []) {
      // A hole in the list is a record from the browser-side era, and a single
      // one used to be a 500 for every page that named the club.
      if (player && typeof player.id === 'string') index.set(player.id, { player, team })
    }
  }
  return index
}

const nameOf = (
  index: Map<string, { player: Player; team: Team }>,
  playerId: string,
): string => {
  const found = index.get(playerId)
  // The same answer the scorer table gives: goals recorded in the browser-side
  // era point at players whose records never reached the database.
  return found ? playerLabel(found.player) : 'Former player'
}

function Counts({ record }: { record: DisciplineRecord }) {
  const shown: Array<[string, number, 'yellow' | 'second_yellow' | 'red' | 'blue']> = [
    ['yellow', record.yellows, 'yellow'],
    ['second_yellow', record.secondYellows, 'second_yellow'],
    ['red', record.reds, 'red'],
    ['blue', record.blues, 'blue'],
  ]

  return (
    <span className="flex items-center gap-3">
      {shown
        .filter(([, count]) => count > 0)
        .map(([key, count, variant]) => (
          <span key={key} className="flex items-center gap-1 text-sm">
            <IconCard size={13} variant={variant} />
            {count}
          </span>
        ))}
    </span>
  )
}

/**
 * What one player's standing costs him next, in a line.
 *
 * A ban with no fixture left to serve it is said out loud rather than dropped:
 * an organiser deciding whether to add a round wants to know it is outstanding,
 * and a player who simply disappears from this column reads as one who has
 * served it.
 */
function Consequence({ record, toNext }: { record: DisciplineRecord; toNext: number | null }) {
  if (record.missing.length > 0) {
    return (
      <span className="text-sm text-red-300">
        Misses {record.missing.length === 1 ? 'the next match' : `the next ${record.missing.length} matches`}
        <span className="opacity-60"> — {record.missing[0]!.reason}</span>
      </span>
    )
  }

  if (record.outstanding > 0) {
    return (
      <span className="text-sm text-amber-300">
        {record.outstanding === 1 ? 'One match' : `${record.outstanding} matches`} still to serve,
        and no fixture left to serve {record.outstanding === 1 ? 'it' : 'them'} in
      </span>
    )
  }

  if (typeof toNext === 'number' && toNext > 0) {
    return (
      <span className="text-sm opacity-60">
        {toNext === 1 ? 'One more booking' : `${toNext} more bookings`} before a suspension
      </span>
    )
  }

  return <span className="text-sm opacity-50">Available</span>
}

export default function DisciplinePanel({
  tournament,
  teams,
}: {
  tournament: Tournament
  teams: Team[]
}) {
  const { records, rules } = useMemo(() => disciplineOf(tournament), [tournament])
  const index = useMemo(() => squadIndex(teams), [teams])

  if (records.length === 0) {
    return (
      <section className="glass rounded-xl p-6 w-full">
        <h2 className="text-lg font-semibold tracking-wide mb-2">Discipline</h2>
        <p className="text-sm opacity-70">
          No cards have been entered in this competition yet. They are added on a match's Goals and
          events tab.
        </p>
      </section>
    )
  }

  // Suspended first, then the players closest to one, then everybody else by
  // how many cards they are carrying: the reason to open this panel is to find
  // out who cannot play.
  const byUrgency = [...records].sort((a, b) => {
    const out = b.missing.length + b.outstanding - (a.missing.length + a.outstanding)
    if (out !== 0) return out
    const left = a.yellowsToNextBan ?? Number.POSITIVE_INFINITY
    const right = b.yellowsToNextBan ?? Number.POSITIVE_INFINITY
    if (left !== right) return left - right
    return b.yellows + b.reds + b.blues - (a.yellows + a.reds + a.blues)
  })

  const clubName = (teamId: string) =>
    teams.find((team) => team.id === teamId)?.name ?? 'Unknown club'

  return (
    <section className="glass rounded-xl p-6 w-full space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-wide">Discipline</h2>
        {disciplineIsIdle(rules) && (
          <span className="text-xs opacity-60">No card suspends anybody in this competition</span>
        )}
      </div>

      <ul className="divide-y divide-white/10">
        {byUrgency.map((record) => (
          <li
            key={`${record.teamId}:${record.playerId}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
          >
            <span className="min-w-[10rem] flex-1 text-sm">
              {nameOf(index, record.playerId)}
              <span className="opacity-50"> — {clubName(record.teamId)}</span>
            </span>
            <Counts record={record} />
            <Consequence record={record} toNext={record.yellowsToNextBan} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Who is out of one match, said above the teamsheet rather than enforced on it.
 *
 * Nothing refuses a suspended player: a teamsheet is filled in after the
 * whistle as often as before it, and a competition where the rules were applied
 * loosely on the night is one this screen still has to be able to record. So it
 * says who should not be playing and leaves the record to the person who was
 * there.
 */
export function SuspendedNote({
  tournament,
  teams,
  matchId,
}: {
  tournament: Tournament
  teams: Team[]
  matchId: string
}) {
  const suspensions = useMemo(
    () => disciplineOf(tournament).suspensions.get(matchId) ?? [],
    [tournament, matchId],
  )
  const index = useMemo(() => squadIndex(teams), [teams])

  if (suspensions.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm space-y-1">
      <div className="font-medium">Suspended for this match</div>
      {suspensions.map((suspension) => (
        <p key={`${suspension.teamId}:${suspension.playerId}`} className="opacity-80">
          {nameOf(index, suspension.playerId)}
          <span className="opacity-60">
            {' '}
            — {suspension.reason}, {teams.find((team) => team.id === suspension.teamId)?.name ?? 'Unknown club'}
          </span>
        </p>
      ))}
      <p className="text-xs opacity-60">
        Naming one of them is not refused. What is recorded here is what happened.
      </p>
    </div>
  )
}
