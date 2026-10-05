import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { refereeService, REFEREE_POSITIONS } from '../lib/data'
import type { RefereeAssignment } from '../lib/data'
import { roundLabel } from '../utils/matches'
import { cdnUrl } from '../utils/images'
import { IconShield, IconWhistle } from '../components/icons'

type Club = { id: string; name: string; logo?: string }

const positionLabel = (value: RefereeAssignment['position']) =>
  REFEREE_POSITIONS.find((position) => position.value === value)?.label ?? 'Referee'

const played = (match: RefereeAssignment) =>
  typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'

/** When a match is, as a referee reads a list: a day and a time, or that nobody has set one. */
function when(match: RefereeAssignment): string {
  if (!match.dateISO) return 'Date to be set'
  const date = new Date(match.dateISO)
  if (Number.isNaN(date.getTime())) return 'Date to be set'
  const day = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = match.time || date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

/**
 * The matches this referee is appointed to, across every organiser they
 * referee for.
 *
 * The ones still to be played first, soonest at the top - that is what a
 * referee opens this for - and the played ones under them, newest first, so a
 * result entered last weekend is one tap away.
 */
export default function RefereeHomePage() {
  const [data, setData] = useState<{ matches: RefereeAssignment[]; clubs: Club[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    refereeService
      .myMatches()
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Your matches could not be loaded.'))
  }, [])

  const clubs = useMemo(() => new Map((data?.clubs ?? []).map((club) => [club.id, club])), [data])

  const [upcoming, done] = useMemo(() => {
    const list = data?.matches ?? []
    const time = (match: RefereeAssignment) => (match.dateISO ? new Date(match.dateISO).getTime() : Infinity)
    return [
      list.filter((match) => !played(match)).sort((a, b) => time(a) - time(b)),
      list.filter(played).sort((a, b) => time(b) - time(a)),
    ]
  }, [data])

  if (error) {
    return <div className="glass rounded-xl p-8 max-w-xl mx-auto text-center text-red-300">{error}</div>
  }
  if (!data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    )
  }

  const row = (match: RefereeAssignment) => {
    const home = match.homeTeamId ? clubs.get(match.homeTeamId) : undefined
    const away = match.awayTeamId ? clubs.get(match.awayTeamId) : undefined
    const crest = (club?: Club) =>
      club?.logo ? (
        <img src={cdnUrl(club.logo)} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
      ) : (
        <span className="w-6 h-6 rounded shrink-0 flex items-center justify-center bg-white/10">
          <IconShield size={13} />
        </span>
      )
    return (
      <Link
        key={`${match.tournamentId}/${match.matchId}`}
        to={`/referee/${encodeURIComponent(match.tournamentId)}/${encodeURIComponent(match.matchId)}`}
        className="glass rounded-xl px-4 py-3 block hover:bg-white/10 transition-colors"
      >
        <div className="text-xs opacity-60 mb-2 flex flex-wrap gap-x-2">
          <span>{match.tournamentName}</span>
          <span>{match.roundName ?? roundLabel(match)}</span>
          <span>{when(match)}</span>
          {match.venue && <span>{match.venue}</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <span className="truncate font-medium">{home?.name ?? 'To be decided'}</span>
            {crest(home)}
          </div>
          <span className="font-bold tabular-nums w-14 text-center">
            {played(match) ? `${match.homeGoals} - ${match.awayGoals}` : 'vs'}
          </span>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {crest(away)}
            <span className="truncate font-medium">{away?.name ?? 'To be decided'}</span>
          </div>
        </div>
        <div className="text-xs opacity-60 mt-2 text-center">
          {positionLabel(match.position)} - {match.organizerName}
        </div>
      </Link>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold inline-flex items-center gap-2">
        <IconWhistle size={22} /> My matches
      </h1>

      {data.matches.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center opacity-80">
          You are not appointed to any match yet. The organiser appoints referees on each match.
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm uppercase tracking-wide opacity-60">To be played</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm opacity-60">Nothing coming up.</p>
            ) : (
              upcoming.map(row)
            )}
          </section>
          {done.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm uppercase tracking-wide opacity-60">Played</h2>
              {done.map(row)}
            </section>
          )}
        </>
      )}
    </div>
  )
}
