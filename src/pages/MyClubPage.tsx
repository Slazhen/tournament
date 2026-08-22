import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { clubService, tournamentService } from '../lib/data'
import type { Entry, TournamentSummary } from '../lib/data'
import type { Team, Tournament, Match } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { calculateTeamStandings, sortTeamsByStandings } from '../utils/schedule'
import { seasonLabel, seasonMatches, seriesName } from '../utils/seasons'
import Trophy from '../components/Trophy'
import { IconCalendar, IconChart, IconPlus, IconTrophy, IconUsers } from '../components/icons'

/**
 * The club's own page, for the person who runs it.
 *
 * A manager wants three things, in this order: where we are in the table, when
 * we play next, and which competitions we are in or waiting on. Everything else
 * is secondary — and the results themselves stay with the organiser, so there
 * is nothing here to argue with.
 */
export default function MyClubPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  const [openCompetitions, setOpenCompetitions] = useState<TournamentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)

  const load = async () => {
    const [overview, summaries] = await Promise.all([
      clubService.overview(),
      tournamentService.getAllSummaries().catch(() => [] as TournamentSummary[]),
    ])
    setTeams(overview.teams)
    setTournaments(overview.tournaments)
    setEntries(overview.entries)
    setTeamNames(overview.teamNames ?? {})
    setOpenCompetitions(summaries.filter((summary) => summary.status !== 'finished'))
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false

    load()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Sign in first</h1>
          <Link to="/admin/login" className="px-6 py-3 rounded-lg glass hover:bg-white/10">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-3">No club yet</h1>
          <p className="opacity-70">
            An organiser has to invite you to run a club. They send a link; opening it puts the club
            here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          {teams.length === 1 ? teams[0].name : 'Your clubs'}
        </h1>
        <p className="opacity-70 mt-1">
          {user.displayName ? `${user.displayName} — ` : ''}
          club manager
        </p>
      </div>

      {teams.map((team) => (
        <ClubCard
          key={team.id}
          team={team}
          tournaments={tournaments}
          entries={entries.filter((entry) => entry.teamId === team.id)}
          teamNames={teamNames}
          openCompetitions={openCompetitions}
          applying={applying === team.id}
          onApply={async (tournamentId) => {
            setApplying(team.id)
            try {
              await clubService.apply(team.id, tournamentId)
              await load()
            } catch (error) {
              alert(
                error instanceof Error && error.message
                  ? error.message
                  : 'That application could not be sent.',
              )
            } finally {
              setApplying(null)
            }
          }}
        />
      ))}
    </div>
  )
}

function ClubCard({
  team,
  tournaments,
  entries,
  teamNames,
  openCompetitions,
  applying,
  onApply,
}: {
  team: Team
  tournaments: Tournament[]
  entries: Entry[]
  teamNames: Record<string, string>
  openCompetitions: TournamentSummary[]
  applying: boolean
  onApply: (tournamentId: string) => void
}) {
  /** The competitions this club is actually playing in. */
  const playing = useMemo(
    () => tournaments.filter((tournament) => (tournament.teamIds || []).includes(team.id)),
    [tournaments, team.id],
  )

  const standings = useMemo(
    () => playing.map((tournament) => positionIn(tournament, team.id)).filter(Boolean),
    [playing, team.id],
  ) as Array<{ tournament: Tournament; position: number; of: number; points: number }>

  const next = useMemo(
    () => nextFixture(playing, team.id, teamNames),
    [playing, team.id, teamNames],
  )

  const pending = entries.filter((entry) => entry.status === 'pending')
  const declined = entries.filter((entry) => entry.status === 'declined')

  const enteredIds = new Set([
    ...playing.map((tournament) => tournament.id),
    ...entries.map((entry) => entry.tournamentId),
  ])
  const canApplyTo = openCompetitions.filter((summary) => !enteredIds.has(summary.id))

  return (
    <section className="space-y-4">
      {/* ---------- Where we are, and when we play ---------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass rounded-2xl p-5 border border-white/15">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-3 inline-flex items-center gap-2">
            <IconChart size={15} /> In the table
          </h2>
          {standings.length === 0 ? (
            <p className="opacity-60 text-sm">Not in a competition yet.</p>
          ) : (
            <ul className="space-y-3">
              {standings.map(({ tournament, position, of, points }) => (
                <li key={tournament.id} className="flex items-center gap-3">
                  <span
                    className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center font-bold ${
                      position === 1
                        ? 'bg-yellow-500 text-black'
                        : position === 2
                          ? 'bg-gray-300 text-black'
                          : position === 3
                            ? 'bg-orange-500 text-black'
                            : 'bg-white/10'
                    }`}
                  >
                    {position}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{seriesName(tournament)}</div>
                    <div className="text-xs text-gray-300">
                      {seasonLabel(tournament)} · {position} of {of} · {points} pts
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass rounded-2xl p-5 border border-white/15">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-3 inline-flex items-center gap-2">
            <IconCalendar size={15} /> Next match
          </h2>
          {!next ? (
            <p className="opacity-60 text-sm">Nothing scheduled.</p>
          ) : (
            <div>
              <div className="text-lg font-semibold">
                {next.opponentName ? `vs ${next.opponentName}` : 'Opponent to be confirmed'}
              </div>
              <div className="text-sm text-gray-300 mt-1">
                {next.when || 'Date to be confirmed'}
                {next.home ? ' · home' : ' · away'}
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {seriesName(next.tournament)} {seasonLabel(next.tournament)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Competitions and applications ---------- */}
      <div className="glass rounded-2xl p-5 border border-white/15">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-3 inline-flex items-center gap-2">
          <IconTrophy size={15} /> Competitions
        </h2>

        <ul className="space-y-2">
          {playing.map((tournament) => (
            <li
              key={tournament.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
            >
              <span className="truncate">
                {seriesName(tournament)} <span className="opacity-60">{seasonLabel(tournament)}</span>
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 shrink-0">
                playing
              </span>
            </li>
          ))}

          {pending.map((entry) => (
            <li
              key={entry.tournamentId}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
            >
              <span className="truncate">
                {nameOf(tournaments, openCompetitions, entry.tournamentId)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">
                waiting on the organiser
              </span>
            </li>
          ))}

          {declined.map((entry) => (
            <li
              key={entry.tournamentId}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
            >
              <span className="truncate">
                {nameOf(tournaments, openCompetitions, entry.tournamentId)}
                {entry.note && <span className="opacity-60"> — {entry.note}</span>}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300 shrink-0">
                not this time
              </span>
            </li>
          ))}

          {playing.length === 0 && entries.length === 0 && (
            <li className="opacity-60 text-sm px-3 py-2">Not entered anywhere yet.</li>
          )}
        </ul>

        {canApplyTo.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <label className="text-sm">
              <span className="opacity-70 inline-flex items-center gap-1.5">
                <IconPlus size={14} /> Apply to a competition
              </span>
              <select
                value=""
                disabled={applying}
                onChange={(event) => event.target.value && onApply(event.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
              >
                <option value="">Choose one…</option>
                {canApplyTo.map((summary) => (
                  <option key={summary.id} value={summary.id}>
                    {summary.seriesName || summary.name}
                    {summary.seasonLabel ? ` ${summary.seasonLabel}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-gray-400 mt-2">
              The organiser has to accept the application before the fixtures change.
            </p>
          </div>
        )}
      </div>

      {/* ---------- The squad ---------- */}
      <div className="glass rounded-2xl p-5 border border-white/15">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-3 inline-flex items-center gap-2">
          <IconUsers size={15} /> Squad
        </h2>
        {(team.players || []).length === 0 ? (
          <p className="opacity-60 text-sm">No players registered yet.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {(team.players || []).map((player) => (
              <li key={player.id} className="text-sm px-3 py-1.5 rounded-lg bg-white/[0.03]">
                {player.number ? <span className="opacity-60 mr-2">{player.number}</span> : null}
                {player.firstName} {player.lastName}
              </li>
            ))}
          </ul>
        )}
      </div>

      {standings.some((standing) => standing.position === 1) && (
        <div className="flex items-center gap-3 text-sm text-amber-200/80">
          <Trophy size={22} /> Top of the table. Long may it last.
        </div>
      )}
    </section>
  )
}

/* ---------------- working out the two numbers that matter ---------------- */

function positionIn(tournament: Tournament, teamId: string) {
  const ids = tournament.teamIds || []
  if (!ids.includes(teamId)) return null

  const matches = seasonMatches(tournament)
  const table = sortTeamsByStandings(ids.map((id) => calculateTeamStandings(matches, id)))
  const index = table.findIndex((row) => row.teamId === teamId)
  if (index === -1) return null

  return {
    tournament,
    position: index + 1,
    of: table.length,
    points: table[index].points,
  }
}

function nextFixture(
  tournaments: Tournament[],
  teamId: string,
  teamNames: Record<string, string>,
) {
  const upcoming: Array<{ match: Match; tournament: Tournament; time: number }> = []

  for (const tournament of tournaments) {
    for (const match of seasonMatches(tournament)) {
      if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) continue
      if (typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number') continue
      upcoming.push({
        match,
        tournament,
        time: match.dateISO ? new Date(match.dateISO).getTime() : Number.POSITIVE_INFINITY,
      })
    }
  }

  if (upcoming.length === 0) return null
  upcoming.sort((a, b) => a.time - b.time)

  const { match, tournament } = upcoming[0]
  const home = match.homeTeamId === teamId
  const opponentId = home ? match.awayTeamId : match.homeTeamId

  return {
    tournament,
    home,
    opponentName: teamNames[opponentId] ?? '',
    when: match.dateISO
      ? new Date(match.dateISO).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '',
  }
}

function nameOf(
  tournaments: Tournament[],
  summaries: TournamentSummary[],
  tournamentId: string,
): string {
  const full = tournaments.find((tournament) => tournament.id === tournamentId)
  if (full) return `${seriesName(full)} ${seasonLabel(full)}`.trim()

  const summary = summaries.find((candidate) => candidate.id === tournamentId)
  if (summary) return `${summary.seriesName || summary.name} ${summary.seasonLabel ?? ''}`.trim()

  return 'A competition'
}
