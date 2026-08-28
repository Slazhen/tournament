import { Link } from 'react-router-dom'
import type { Match, Tournament } from '../types'
import { calculateTeamStandings, sortTeamsByStandings } from '../utils/schedule'
import { seasonLabel, seasonMatches, seriesName } from '../utils/seasons'

/**
 * One competition's table, cut down to the part a club cares about.
 *
 * A club's own page answered "where are we" with a number — third of eight —
 * which is the answer to a different question. What a manager wants to know is
 * who is above them and by how much, and that is a table, not a position.
 *
 * The whole table would be the honest thing to show if these were all short
 * leagues, but they are not, so what is drawn is a window: the leader, then the
 * rows either side of this club, and nothing in between except a marker that
 * says rows were skipped.
 */

/** How many rows above and below the club's own are worth showing. */
const NEIGHBOURS = 2

export type MiniTableRow = {
  teamId: string
  position: number
  played: number
  points: number
  goalDifference: number
}

/** The full table of a season, in order. */
export function tableOf(tournament: Tournament, matches?: Match[]): MiniTableRow[] {
  const ids = tournament.teamIds ?? []
  const played = matches ?? seasonMatches(tournament)
  return sortTeamsByStandings(ids.map((id) => calculateTeamStandings(played, id))).map((row) => ({
    teamId: row.teamId,
    position: row.position,
    played: row.played,
    points: row.points,
    goalDifference: row.goalDifference,
  }))
}

/**
 * The rows to draw: the leader, the club, and its neighbours — in order, with
 * no duplicates. A short table comes back whole, because cutting three rows out
 * of eight saves nothing and loses the shape of the league.
 */
export function windowAround(rows: MiniTableRow[], teamId: string): MiniTableRow[] {
  const index = rows.findIndex((row) => row.teamId === teamId)
  if (index === -1) return rows
  if (rows.length <= NEIGHBOURS * 2 + 2) return rows

  const wanted = new Set<number>([0])
  for (let offset = -NEIGHBOURS; offset <= NEIGHBOURS; offset++) {
    const at = index + offset
    if (at >= 0 && at < rows.length) wanted.add(at)
  }

  return [...wanted].sort((a, b) => a - b).map((at) => rows[at])
}

export default function MiniTable({
  tournament,
  teamId,
  teamNames,
  to,
  hint,
  matches,
}: {
  tournament: Tournament
  /** The club to highlight — the one whose page this is. */
  teamId: string
  teamNames: Record<string, string>
  /**
   * Where the heading goes. The caller decides, because only the caller knows
   * whether this competition has a page the person reading can open: a private
   * season has no public address at all, and linking to one answers "not
   * found" to the person who runs it.
   */
  to?: string | null
  /** Said instead, when there is nowhere to go. */
  hint?: string
  /**
   * The season's matches, when the caller already has them. A club manager is
   * given other clubs' fixtures as scores only, which is enough for a table.
   */
  matches?: Match[]
}) {
  const rows = tableOf(tournament, matches)
  const shown = windowAround(rows, teamId)
  const mine = rows.find((row) => row.teamId === teamId)


  const heading = (
    <>
      <span className="font-medium">{seriesName(tournament)}</span>{' '}
      <span className="opacity-60">{seasonLabel(tournament)}</span>
    </>
  )

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between gap-3 border-b border-white/10">
        <span className="truncate">
          {to ? (
            <Link to={to} className="hover:underline">
              {heading}
            </Link>
          ) : (
            heading
          )}
          {!to && hint && <span className="block text-xs text-gray-500">{hint}</span>}
        </span>
        {mine && (
          <span className="text-xs text-gray-300 shrink-0">
            {mine.position} of {rows.length}
          </span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs text-gray-400">
          <tr>
            <th className="py-1.5 pl-3 pr-1 text-left font-normal w-8">#</th>
            <th className="py-1.5 px-1 text-left font-normal">Team</th>
            <th className="py-1.5 px-1 text-center font-normal w-8">P</th>
            <th className="py-1.5 px-1 text-center font-normal w-10">GD</th>
            <th className="py-1.5 pl-1 pr-3 text-center font-normal w-10">Pts</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => {
            const skipped = index > 0 && row.position > shown[index - 1].position + 1
            const isMine = row.teamId === teamId

            return (
              <tr key={row.teamId} className={isMine ? 'bg-white/10 font-semibold' : ''}>
                <td className="py-1.5 pl-3 pr-1 text-gray-300">
                  {skipped && <span className="block text-gray-500 leading-3">···</span>}
                  {row.position}
                </td>
                <td className="py-1.5 px-1 truncate max-w-0">
                  {teamNames[row.teamId] ?? 'Unknown club'}
                </td>
                <td className="py-1.5 px-1 text-center text-gray-300">{row.played}</td>
                <td className="py-1.5 px-1 text-center text-gray-300">
                  {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                </td>
                <td className="py-1.5 pl-1 pr-3 text-center">{row.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
