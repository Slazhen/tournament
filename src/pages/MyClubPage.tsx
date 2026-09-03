import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  clubService,
  organizerService,
  playerService,
  teamService,
  tournamentService,
  uploadImage,
} from '../lib/data'
import type { Entry, TournamentSummary } from '../lib/data'
import type { Organizer, Player, Team, Tournament, Match } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { calculateTeamStandings, sortTeamsByStandings } from '../utils/schedule'
import { seasonLabel, seasonMatches, seriesName } from '../utils/seasons'
import { hasSquadEntry, registeredPlayers } from '../utils/squads'
import { readCrestAppearance } from '../utils/crest'
import { getPublicTournamentUrl } from '../utils/urls'
import Trophy from '../components/Trophy'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import YoutubeIcon from '../components/YoutubeIcon'
import LogoUploader from '../components/LogoUploader'
import MiniTable from '../components/MiniTable'
import PhotoUploader from '../components/PhotoUploader'
import {
  IconCalendar,
  IconChart,
  IconCheck,
  IconClipboard,
  IconClose,
  IconGlobe,
  IconLock,
  IconPencil,
  IconPlus,
  IconRepeat,
  IconSearch,
  IconShield,
  IconTrash,
  IconTrophy,
  IconUser,
  IconUsers,
} from '../components/icons'

/**
 * The club's own page, for the person who runs it.
 *
 * A manager arrives wanting three answers — where we are, when we play, who we
 * are playing for — and stays to do the work the organiser used to do on their
 * behalf: sign a player, fix a shirt number, change the crest, and say which of
 * their players are actually registered for which competition.
 *
 * What stays with the organiser is the part clubs would argue about: results,
 * fixtures, and whether a club is in a competition at all.
 */
export default function MyClubPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  const [openCompetitions, setOpenCompetitions] = useState<TournamentSummary[]>([])
  const [organizerNames, setOrganizerNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [overview, summaries, organizers] = await Promise.all([
      clubService.overview(),
      tournamentService.getAllSummaries().catch(() => [] as TournamentSummary[]),
      // Names only, and only to label the list of competitions to join. A club
      // manager is not a super admin, so this is the public directory, not
      // organizerService.getAll(), which would send them to an /admin route.
      organizerService.getAllPublic().catch(() => [] as Organizer[]),
    ])
    setTeams(overview.teams)
    setTournaments(overview.tournaments)
    setEntries(overview.entries)
    setTeamNames(overview.teamNames ?? {})
    setOpenCompetitions(summaries.filter((summary) => summary.status !== 'finished'))
    setOrganizerNames(
      Object.fromEntries(organizers.map((organizer) => [organizer.id, organizer.name])),
    )
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
          <Link to="/login" className="px-6 py-3 rounded-lg glass hover:bg-white/10">
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
    <div className="w-full max-w-4xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold">{teams.length === 1 ? teams[0].name : 'Your clubs'}</h1>
        <p className="opacity-70 mt-1">
          {user.displayName ? `${user.displayName} — ` : ''}
          club manager
        </p>
      </div>

      {teams.map((team) => (
        <ClubCard
          key={team.id}
          team={team}
          viewerOrganizerId={user.organizerId}
          tournaments={tournaments}
          entries={entries.filter((entry) => entry.teamId === team.id)}
          teamNames={teamNames}
          openCompetitions={openCompetitions}
          organizerNames={organizerNames}
          onReload={load}
          // Errors are deliberately left to the caller: an application is made
          // from a row in a list, and that row is where the reason it failed
          // belongs — not in an alert that says nothing about which one.
          onApply={async (tournamentId) => {
            await clubService.apply(team.id, tournamentId)
            await load()
          }}
          onAnswerInvitation={async (tournamentId, status) => {
            await clubService.answerInvitation(tournamentId, team.id, status)
            await load()
          }}
        />
      ))}
    </div>
  )
}

function ClubCard({
  team,
  viewerOrganizerId,
  tournaments,
  entries,
  teamNames,
  openCompetitions,
  organizerNames,
  onApply,
  onAnswerInvitation,
  onReload,
}: {
  team: Team
  /** Whose competitions this account runs, if any. A coach has none. */
  viewerOrganizerId?: string
  tournaments: Tournament[]
  entries: Entry[]
  teamNames: Record<string, string>
  openCompetitions: TournamentSummary[]
  organizerNames: Record<string, string>
  onApply: (tournamentId: string) => Promise<void>
  onAnswerInvitation: (
    tournamentId: string,
    status: 'accepted' | 'declined',
  ) => Promise<void>
  onReload: () => Promise<void>
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

  const next = useMemo(() => nextFixture(playing, team.id, teamNames), [playing, team.id, teamNames])

  /**
   * Where the name of a competition takes you.
   *
   * A published season goes to its public table, which is what a manager wants
   * — it is the page they would send to a player. A season the organiser has
   * not published has no public address at all, so linking to one answers "not
   * found"; whoever runs it can still open their own admin page, and everybody
   * else is told why there is nothing to click.
   */
  const linkFor = (tournament: Tournament): string | null => {
    if (tournament.visibility !== 'private') {
      const organizer = organizerNames[tournament.organizerId]
      // The readable address needs the organiser's name, and that list is
      // fetched separately and swallowed on failure. The address by id always
      // resolves, so a missing name costs a nice URL rather than the link.
      return organizer
        ? getPublicTournamentUrl(tournament, { name: organizer })
        : `/public/tournaments/${tournament.id}`
    }
    return viewerOrganizerId && viewerOrganizerId === tournament.organizerId
      ? `/tournaments/${tournament.id}`
      : null
  }

  const pending = entries.filter((entry) => entry.status === 'pending')
  const declined = entries.filter((entry) => entry.status === 'declined')
  // An organiser has offered this club a place. Nothing has happened yet: an
  // invitation is a question, and this is the only screen that can answer it.
  const invited = entries.filter((entry) => entry.status === 'invited')

  // What is off the list: the competitions the club is in, and the applications
  // it is still waiting on or has been refused — those two have a row of their
  // own above. An accepted entry whose competition no longer lists the club (the
  // organiser removed it afterwards) deliberately stays available, or the club
  // would have no way back in.
  const enteredIds = new Set([
    ...playing.map((tournament) => tournament.id),
    ...pending.map((entry) => entry.tournamentId),
    ...declined.map((entry) => entry.tournamentId),
    ...invited.map((entry) => entry.tournamentId),
  ])
  const canApplyTo = openCompetitions.filter((summary) => !enteredIds.has(summary.id))

  return (
    <section className="space-y-4">
      <ClubIdentity team={team} onReload={onReload} />

      {/* ---------- Where we are, and when we play ---------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass rounded-2xl p-5 border border-white/15">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-3 inline-flex items-center gap-2">
            <IconChart size={15} /> In the table
          </h2>
          {playing.length === 0 ? (
            <p className="opacity-60 text-sm">Not in a competition yet.</p>
          ) : (
            <div className="space-y-3">
              {playing.map((tournament) => (
                <MiniTable
                  key={tournament.id}
                  tournament={tournament}
                  teamId={team.id}
                  teamNames={{ ...teamNames, [team.id]: team.name }}
                  to={linkFor(tournament)}
                  hint="Not published yet — no public table."
                />
              ))}
            </div>
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

      {/* ---------- Competitions, applications and who is registered ---------- */}
      <div className="glass rounded-2xl p-5 border border-white/15">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-3 inline-flex items-center gap-2">
          <IconTrophy size={15} /> Competitions
        </h2>

        <div className="space-y-2">
          {playing.map((tournament) => (
            <CompetitionRow
              key={tournament.id}
              tournament={tournament}
              team={team}
              onReload={onReload}
            />
          ))}

          {invited.map((entry) => (
            <InvitationRow
              key={entry.tournamentId}
              // The name copied onto the invitation first: a competition the
              // club has not joined is in neither of the lists this page holds
              // when the organiser has not published it.
              name={entry.tournamentName || nameOf(tournaments, openCompetitions, entry.tournamentId)}
              organizerName={organizerNames[entry.organizerId]}
              onAnswer={(status) => onAnswerInvitation(entry.tournamentId, status)}
            />
          ))}

          {pending.map((entry) => (
            <div
              key={entry.tournamentId}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
            >
              <span className="truncate">
                {nameOf(tournaments, openCompetitions, entry.tournamentId)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">
                waiting on the organiser
              </span>
            </div>
          ))}

          {declined.map((entry) => (
            <DeclinedRow
              key={entry.tournamentId}
              name={nameOf(tournaments, openCompetitions, entry.tournamentId)}
              note={entry.note}
              onApplyAgain={() => onApply(entry.tournamentId)}
            />
          ))}

          {playing.length === 0 && entries.length === 0 && (
            <p className="opacity-60 text-sm px-3 py-2">Not entered anywhere yet.</p>
          )}
        </div>

        {canApplyTo.length > 0 && (
          <JoinCompetitions competitions={canApplyTo} organizerNames={organizerNames} onApply={onApply} />
        )}
      </div>

      <Teamsheets
        team={team}
        tournaments={playing}
        teamNames={teamNames}
        onReload={onReload}
      />

      <Squad team={team} onReload={onReload} />

      {standings.some((standing) => standing.position === 1) && (
        <div className="flex items-center gap-3 text-sm text-amber-200/80">
          <Trophy size={22} /> Top of the table. Long may it last.
        </div>
      )}
    </section>
  )
}

/* ================================================================== *
 * Joining competitions
 * ================================================================== */

/**
 * A place an organiser has offered this club.
 *
 * The club is not in the competition and will not be until this is answered:
 * the organiser's route stops at "invited" on purpose, and accepting is the
 * only thing that puts the club in. Declining is an answer rather than silence,
 * so the organiser is not left waiting on a club that has decided.
 */
function InvitationRow({
  name,
  organizerName,
  onAnswer,
}: {
  name: string
  organizerName?: string
  onAnswer: (status: 'accepted' | 'declined') => Promise<void>
}) {
  const [busy, setBusy] = useState<'accepted' | 'declined' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const answer = async (status: 'accepted' | 'declined') => {
    setBusy(status)
    setError(null)
    try {
      await onAnswer(status)
    } catch (caught) {
      setError(messageOf(caught, 'That could not be sent.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-emerald-400/25">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate">{name}</span>
          <span className="block text-xs text-emerald-300/80">
            {organizerName ? `${organizerName} has invited you` : 'You have been invited'}
          </span>
        </span>
        <span className="flex gap-2 shrink-0">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => answer('accepted')}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <IconCheck size={13} /> {busy === 'accepted' ? 'Joining…' : 'Accept'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => answer('declined')}
            className="text-xs px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all disabled:opacity-50"
          >
            {busy === 'declined' ? 'Sending…' : 'No thanks'}
          </button>
        </span>
      </div>
      {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
    </div>
  )
}

/**
 * An application the organiser turned down.
 *
 * The club can ask again — circumstances change, and a refusal in March says
 * nothing about September. The organiser sees that it is a repeat and reads
 * back their own reason, and because a pending application is never rewritten,
 * a second refusal is needed before a third attempt is possible.
 */
function DeclinedRow({
  name,
  note,
  onApplyAgain,
}: {
  name: string
  note?: string
  onApplyAgain: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const again = async () => {
    setBusy(true)
    setError(null)
    try {
      await onApplyAgain()
    } catch (caught) {
      setError(messageOf(caught, 'That application could not be sent.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-3 py-2 rounded-lg bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate">
          {name}
          {note && <span className="opacity-60"> — {note}</span>}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
            not this time
          </span>
          <button
            onClick={again}
            disabled={busy}
            className="text-xs px-2 py-1 rounded-lg glass hover:bg-white/10 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
          >
            <IconRepeat size={13} /> {busy ? 'Asking…' : 'Ask again'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
    </div>
  )
}

/**
 * The competitions this club could enter.
 *
 * A club plays in more than one thing at once — a league on Sunday, a cup in
 * midweek — so this is a list to work down rather than a single choice: every
 * competition it is not already in, searchable, grouped under the organiser who
 * runs it, each with its own button. The dropdown this replaced showed one
 * unsorted list of every season in the system, which was unusable as soon as
 * there were more than a handful.
 */
function JoinCompetitions({
  competitions,
  organizerNames,
  onApply,
}: {
  competitions: TournamentSummary[]
  organizerNames: Record<string, string>
  onApply: (tournamentId: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)
  // Shut until asked for. Open, this is a searchable list of every competition
  // in the system, which is the largest thing on the page and the one a manager
  // looks at least often — the club's own fixtures are why they came.
  const [open, setOpen] = useState(false)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matching = needle
      ? competitions.filter((summary) =>
          searchTextOf(summary, organizerNames).includes(needle),
        )
      : competitions

    const byOrganizer = new Map<string, TournamentSummary[]>()
    for (const summary of matching) {
      const list = byOrganizer.get(summary.organizerId)
      if (list) list.push(summary)
      else byOrganizer.set(summary.organizerId, [summary])
    }

    return [...byOrganizer.entries()]
      .map(([organizerId, list]) => ({
        organizerId,
        // An organiser whose record is missing still has competitions worth
        // showing; they just have no name to group them under.
        organizerName: organizerNames[organizerId] ?? 'Other competitions',
        list: [...list].sort((a, b) => titleOf(a).localeCompare(titleOf(b))),
      }))
      .sort((a, b) => a.organizerName.localeCompare(b.organizerName))
  }, [competitions, organizerNames, query])

  const apply = async (tournamentId: string) => {
    setBusy(tournamentId)
    setFailed(null)
    try {
      await onApply(tournamentId)
    } catch (caught) {
      setFailed({ id: tournamentId, message: messageOf(caught, 'That application could not be sent.') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/15 hover:bg-white/10 transition-colors text-sm"
        >
          <IconPlus size={14} /> Join another competition
        </button>
        <span className="text-xs text-gray-400">
          {competitions.length} open to this club
        </span>
      </div>

      {open && (
        <>
      <div className="relative mt-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <IconSearch size={14} />
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by competition, season or organiser"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
        />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm opacity-60 mt-3 px-1">Nothing matches that.</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-y-auto space-y-4 pr-1">
          {groups.map((group) => (
            <div key={group.organizerId}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 px-1 mb-1">
                {group.organizerName}
              </h3>
              <ul className="space-y-1">
                {group.list.map((summary) => (
                  <li key={summary.id}>
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]">
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          {summary.seriesName || summary.name}
                          {summary.seasonLabel && (
                            <span className="opacity-60"> {summary.seasonLabel}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {summary.teamCount} {summary.teamCount === 1 ? 'club' : 'clubs'}
                          {summary.status === 'running' && ' · under way'}
                        </div>
                      </div>
                      <button
                        onClick={() => apply(summary.id)}
                        disabled={busy !== null}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
                      >
                        {busy === summary.id ? 'Applying…' : 'Apply'}
                      </button>
                    </div>
                    {failed?.id === summary.id && (
                      <p className="text-xs text-red-300 mt-1 px-3">{failed.message}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Apply to as many as you like. The organiser has to accept each one before the fixtures
        change.
      </p>
        </>
      )}
    </div>
  )
}

function titleOf(summary: TournamentSummary): string {
  return `${summary.seriesName || summary.name} ${summary.seasonLabel ?? ''}`.trim()
}

function searchTextOf(
  summary: TournamentSummary,
  organizerNames: Record<string, string>,
): string {
  return [
    summary.seriesName,
    summary.name,
    summary.seasonLabel,
    organizerNames[summary.organizerId],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/* ================================================================== *
 * The club itself: name, colours, crest, photo
 * ================================================================== */

const DEFAULT_COLORS = ['#3B82F6', '#EF4444']

function ClubIdentity({ team, onReload }: { team: Team; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(team.name)
  const [colors, setColors] = useState<string[]>(team.colors?.length ? team.colors : ['#3B82F6'])
  const [facebook, setFacebook] = useState(team.socialMedia?.facebook ?? '')
  const [instagram, setInstagram] = useState(team.socialMedia?.instagram ?? '')
  const [youtube, setYoutube] = useState(team.socialMedia?.youtube ?? '')
  const [established, setEstablished] = useState(team.establishedDate ?? '')
  const [hideAges, setHideAges] = useState(team.hidePlayerAges === true)
  const [discoverable, setDiscoverable] = useState(team.discoverable === true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed the draft whenever the club is reloaded, so a save made elsewhere
  // (or by the organiser) does not sit invisibly behind a stale form.
  useEffect(() => {
    setName(team.name)
    setColors(team.colors?.length ? team.colors : ['#3B82F6'])
    setFacebook(team.socialMedia?.facebook ?? '')
    setInstagram(team.socialMedia?.instagram ?? '')
    setYoutube(team.socialMedia?.youtube ?? '')
    setEstablished(team.establishedDate ?? '')
    setHideAges(team.hidePlayerAges === true)
    setDiscoverable(team.discoverable === true)
  }, [team])

  const save = async () => {
    if (!name.trim()) {
      setError('A club needs a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await teamService.update(team.id, {
        name: name.trim(),
        colors,
        // An empty string rather than undefined: the update builder skips
        // undefined, so clearing a date would silently keep the old one.
        establishedDate: established,
        socialMedia: {
          facebook: facebook.trim(),
          instagram: instagram.trim(),
          youtube: youtube.trim(),
        },
        hidePlayerAges: hideAges,
        discoverable,
      })
      await onReload()
      setEditing(false)
    } catch (caught) {
      setError(messageOf(caught, 'That could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  /** The crest and the team photo save on their own — there is nothing to confirm. */
  const upload = async (file: File, field: 'logo' | 'photo') => {
    const url = await uploadImage(file, { kind: 'team', id: team.id })
    // A crest carries the colour the public header is painted in, and it can
    // only be read from the file: the bucket serves the published image without
    // CORS headers, so nothing downstream can measure it.
    // A crest that could not be measured clears what the previous one left,
    // or the public header keeps the colour of a badge this club has replaced.
    const measured =
      field === 'logo'
        ? ((await readCrestAppearance(file)) ?? { crestColor: null, crestOpaqueBackground: null })
        : {}
    await teamService.update(team.id, { [field]: url, ...measured })
    await onReload()
  }

  return (
    <div className="glass rounded-2xl p-5 border border-white/15">
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 inline-flex items-center gap-2">
          <IconShield size={15} /> The club
        </h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
          >
            <IconPencil size={13} /> Edit
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-6">
        <div className="shrink-0">
          <LogoUploader
            currentLogo={team.logo}
            size={96}
            compressionType="logo"
            onLogoUpload={(file) => upload(file, 'logo')}
          />
          <p className="text-xs text-gray-400 text-center mt-2">Crest</p>
        </div>

        <div className="flex-1 min-w-0 space-y-4">
          {editing ? (
            <>
              <label className="block">
                <span className="text-sm text-gray-300">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
                />
              </label>

              <div>
                <span className="text-sm text-gray-300">Colours</span>
                <div className="flex items-center gap-2 mt-1">
                  {colors.map((color, index) => (
                    <input
                      key={index}
                      type="color"
                      value={color}
                      onChange={(event) => {
                        const next = [...colors]
                        next[index] = event.target.value
                        setColors(next)
                      }}
                      className="w-10 h-10 rounded-lg bg-transparent border border-white/20 cursor-pointer"
                    />
                  ))}
                  {colors.length < 2 ? (
                    <button
                      onClick={() => setColors([...colors, DEFAULT_COLORS[1]])}
                      className="px-3 py-2 rounded-lg glass hover:bg-white/10 text-sm inline-flex items-center gap-1.5"
                    >
                      <IconPlus size={13} /> Second colour
                    </button>
                  ) : (
                    <button
                      onClick={() => setColors(colors.slice(0, 1))}
                      className="px-3 py-2 rounded-lg glass hover:bg-white/10 text-sm text-gray-300"
                    >
                      One colour only
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm text-gray-300">Founded</span>
                  <input
                    type="date"
                    value={established ? established.slice(0, 10) : ''}
                    onChange={(event) => setEstablished(event.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-300">Instagram</span>
                  <input
                    value={instagram}
                    onChange={(event) => setInstagram(event.target.value)}
                    placeholder="https://instagram.com/…"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-300">Facebook</span>
                  <input
                    value={facebook}
                    onChange={(event) => setFacebook(event.target.value)}
                    placeholder="https://facebook.com/…"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-300">YouTube</span>
                  <input
                    value={youtube}
                    onChange={(event) => setYoutube(event.target.value)}
                    placeholder="https://youtube.com/@…"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
                  />
                </label>
              </div>

              {/* Ages are the club's call, not each player's: a manager who
                  does not want the squad's ages published does not want any
                  of them published. The date itself is never public either
                  way — the site works out the age from it. */}
              <label className="flex items-start gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={!hideAges}
                  onChange={(event) => setHideAges(!event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Show players' ages on the public pages
                  <span className="block text-xs text-gray-500">
                    Dates of birth are never published — only how old somebody is.
                  </span>
                </span>
              </label>

              {/* Being findable is a separate decision from being public. The
                  club's page has always been public; what this opens is being
                  approached by an organiser who does not run any competition
                  the club plays in. Off unless the club says otherwise — a club
                  that has never been asked has not agreed to be. */}
              <label className="flex items-start gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={discoverable}
                  onChange={(event) => setDiscoverable(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Let other organisers find this club
                  <span className="block text-xs text-gray-500">
                    They can search for it by name and invite it to a competition. Nothing happens
                    until you accept an invitation, and you can turn this off at any time.
                  </span>
                </span>
              </label>

              {error && <p className="text-sm text-red-300">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false)
                    setError(null)
                  }}
                  className="px-4 py-2 rounded-lg glass hover:bg-white/10 text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-xl font-semibold">{team.name}</div>
                <div className="flex items-center gap-2 mt-2">
                  {(team.colors?.length ? team.colors : ['#3B82F6']).map((color, index) => (
                    <span
                      key={index}
                      className="w-6 h-6 rounded-md border border-white/20"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  {team.establishedDate && (
                    <span className="text-xs text-gray-400 ml-2">
                      founded {team.establishedDate.slice(0, 4)}
                    </span>
                  )}
                </div>
              </div>

              <SocialLinks socialMedia={team.socialMedia} empty="No social links yet." />

              {/* Worth saying without opening the form: it is the setting that
                  decides whether strangers may approach the club at all. */}
              <p className="text-xs text-gray-400">
                {team.discoverable === true
                  ? 'Other organisers can find this club and invite it to their competitions.'
                  : 'Only organisers whose competitions this club already plays in can see it.'}
              </p>
            </>
          )}


          {/* Small here on purpose: this card is where the photograph is
              changed, not where it is looked at. The public team page shows it
              at full width. */}
          <div>
            <span className="text-sm text-gray-300">Team photo</span>
            <div className="mt-1">
              <PhotoUploader
                photo={team.photo}
                alt={team.name}
                label="team photo"
                onUpload={(file) => upload(file, 'photo')}
              />
            </div>
          </div>

          <PublicPageLink team={team} />
        </div>
      </div>
    </div>
  )
}

/**
 * The address of the club's own public page, and a way to copy it.
 *
 * A manager fills in a crest, colours and a squad without ever seeing what any
 * of it produces: the page is public and needs no sign-in, but nothing in this
 * screen said it existed. It is also the link they are asked for — by players,
 * by a league, by whoever runs their social accounts — so it is worth being
 * able to take away, not only to open.
 *
 * The page is served by id rather than by a readable slug because that is the
 * only public address a club has.
 */
function PublicPageLink({ team }: { team: Team }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/public/teams/${team.id}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused (an insecure origin, a browser
      // setting). The address is on screen and selectable, so there is
      // nothing to report — silently doing nothing is the honest outcome.
    }
  }

  return (
    <div>
      <span className="text-sm text-gray-300">Public page</span>
      <p className="text-xs text-gray-500 mt-0.5">
        This is what everybody else sees. Anyone with the link can open it.
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg glass hover:bg-white/10 transition-colors text-sm"
        >
          <IconGlobe size={14} /> Open
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg glass hover:bg-white/10 transition-colors text-sm"
        >
          {copied ? <IconCheck size={14} /> : <IconClipboard size={14} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <span className="text-xs text-gray-400 break-all min-w-0">{url}</span>
      </div>
    </div>
  )
}

/**
 * A club's links, as links.
 *
 * They used to be printed as raw addresses joined by a dot, which is neither
 * clickable nor readable — a full Instagram URL is longer than the card.
 */
function SocialLinks({
  socialMedia,
  empty,
}: {
  socialMedia?: { facebook?: string; instagram?: string; youtube?: string }
  empty?: string
}) {
  const links = [
    { url: socialMedia?.instagram, label: 'Instagram', icon: <InstagramIcon size={16} /> },
    { url: socialMedia?.facebook, label: 'Facebook', icon: <FacebookIcon size={16} /> },
    { url: socialMedia?.youtube, label: 'YouTube', icon: <YoutubeIcon size={16} /> },
  ].filter((link) => Boolean(link.url))

  if (links.length === 0) {
    return empty ? <div className="text-sm text-gray-400">{empty}</div> : null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 transition-colors text-sm"
        >
          {link.icon} {link.label}
        </a>
      ))}
    </div>
  )
}

/* ================================================================== *
 * One competition, and who is registered for it
 * ================================================================== */

function CompetitionRow({
  tournament,
  team,
  onReload,
}: {
  tournament: Tournament
  team: Team
  onReload: () => Promise<void>
}) {
  const players = team.players ?? []
  const stored = tournament.squads?.[team.id]
  // Not the stored list: it can name somebody the club has since released, and
  // counting them would tell a manager they have a player more than they can
  // put on a teamsheet.
  const entered = registeredPlayers(tournament, team).map((player) => player.id)
  const locked = tournament.squadsLocked === true
  const strict = tournament.squadsStrict === true
  const submitted = hasSquadEntry(tournament, team.id)

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(entered)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(registeredPlayers(tournament, team).map((player) => player.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id, stored?.join(','), strict, players.length])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await clubService.saveSquad(tournament.id, team.id, selected)
      await onReload()
      setOpen(false)
    } catch (caught) {
      setError(messageOf(caught, 'That squad could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="truncate">
          {seriesName(tournament)} <span className="opacity-60">{seasonLabel(tournament)}</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {/* A competition that registers its players says so, and says loudest
              to the club that has not registered any: under that rule nobody it
              names can play, and the row would otherwise look like every other. */}
          {strict && !submitted ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
              squad needed
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
              playing
            </span>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="text-xs px-2 py-1 rounded-lg glass hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
          >
            <IconUsers size={13} />
            {players.length === 0
              ? 'squad'
              : `${entered.length} of ${players.length}`}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-white/10">
          {players.length === 0 ? (
            <p className="text-sm opacity-60 py-2">
              Add players to the club below, then choose who plays here.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">
                {locked ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-300">
                    <IconLock size={12} /> The organiser has closed squads for this competition.
                  </span>
                ) : strict ? (
                  'This competition registers its players: only the ones ticked here can be named in a match, and somebody you sign later has to be added to this list before they play.'
                ) : (
                  'Everyone ticked is registered here. Leave them all ticked and anyone you sign later joins automatically.'
                )}
              </p>

              <ul className="grid gap-1 sm:grid-cols-2">
                {players.map((player) => {
                  const on = selected.includes(player.id)
                  return (
                    <li key={player.id}>
                      <label
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                          on ? 'bg-white/[0.06]' : 'bg-transparent opacity-50'
                        } ${locked ? 'cursor-not-allowed' : 'hover:bg-white/10'}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={locked}
                          onChange={() =>
                            setSelected(
                              on
                                ? selected.filter((id) => id !== player.id)
                                : [...selected, player.id],
                            )
                          }
                        />
                        <span className="text-sm truncate">
                          {player.number ? (
                            <span className="opacity-60 mr-2">{player.number}</span>
                          ) : null}
                          {player.firstName} {player.lastName}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>

              {error && <p className="text-sm text-red-300 mt-2">{error}</p>}

              {!locked && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
                  >
                    {saving ? 'Saving…' : 'Save squad'}
                  </button>
                  <button
                    onClick={() => setSelected(players.map((player) => player.id))}
                    className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 text-sm"
                  >
                    Everyone
                  </button>
                  <button
                    onClick={() => setSelected([])}
                    className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 text-sm text-gray-300"
                  >
                    Nobody
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================== *
 * Teamsheets
 * ================================================================== */

/**
 * Who played, match by match.
 *
 * The organiser used to be the only person who could say this, which meant in
 * practice that nobody did: appearances come from the teamsheet and nowhere
 * else, so a competition whose organiser never filled one in showed every
 * player as having played nothing. The manager knows who turned up.
 *
 * Only the fixtures in `matches`. A hand-built playoff keeps its rounds inside
 * the format and no screen edits their teamsheets yet, the organiser's own
 * included, so listing them here would offer something that cannot be saved.
 */
function Teamsheets({
  team,
  tournaments,
  teamNames,
  onReload,
}: {
  team: Team
  tournaments: Tournament[]
  teamNames: Record<string, string>
  onReload: () => Promise<void>
}) {
  const fixtures = useMemo(() => {
    const rows: Array<{ tournament: Tournament; match: Match }> = []
    for (const tournament of tournaments) {
      for (const match of tournament.matches ?? []) {
        if (match.homeTeamId !== team.id && match.awayTeamId !== team.id) continue
        rows.push({ tournament, match })
      }
    }

    const isPlayed = (match: Match) =>
      typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'
    // A fixture with no date sorts last among fixtures and last among results,
    // which is where "we have not agreed a date yet" belongs either way. Not
    // Infinity: subtracting one from another is NaN, and a comparator that
    // returns NaN leaves the list in whatever order it happened to be in.
    const at = (match: Match) =>
      match.dateISO ? new Date(match.dateISO).getTime() : Number.MAX_SAFE_INTEGER

    // The next match is the one a manager opened this to name, so fixtures come
    // first and soonest first; results follow, most recent first.
    return rows.sort((a, b) => {
      const playedA = isPlayed(a.match)
      const playedB = isPlayed(b.match)
      if (playedA !== playedB) return playedA ? 1 : -1
      return playedA ? at(b.match) - at(a.match) : at(a.match) - at(b.match)
    })
  }, [tournaments, team.id])

  if (fixtures.length === 0) return null

  return (
    <div className="glass rounded-2xl p-5 border border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-1 inline-flex items-center gap-2">
        <IconCalendar size={15} /> Teamsheets
      </h2>
      <p className="text-xs text-gray-400 mb-3">
        Who played in each match. Until somebody names a side, its players have no appearances to
        show. The organiser can correct any of it.
      </p>

      <div className="space-y-2">
        {fixtures.map(({ tournament, match }) => (
          <TeamsheetRow
            key={`${tournament.id}:${match.id}`}
            tournament={tournament}
            match={match}
            team={team}
            teamNames={teamNames}
            onReload={onReload}
          />
        ))}
      </div>
    </div>
  )
}

function TeamsheetRow({
  tournament,
  match,
  team,
  teamNames,
  onReload,
}: {
  tournament: Tournament
  match: Match
  team: Team
  teamNames: Record<string, string>
  onReload: () => Promise<void>
}) {
  // Only the players registered for this competition, which is the same list
  // the organiser is offered — a club may have signed somebody since the squad
  // for this competition was agreed, and they are not eligible here.
  const players = registeredPlayers(tournament, team)
  const side = match.homeTeamId === team.id ? 'home' : 'away'
  const stored = match.lineups?.[side]?.starting ?? []

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(stored)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(stored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, stored.join(',')])

  const opponentId = side === 'home' ? match.awayTeamId : match.homeTeamId
  const opponent = teamNames[opponentId] || 'Opponent to be confirmed'
  const when = match.dateISO
    ? new Date(match.dateISO).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : 'Date to be confirmed'
  const score =
    typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'
      ? `${match.homeGoals} - ${match.awayGoals}`
      : null

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await clubService.saveLineup(tournament.id, match.id, team.id, selected)
      await onReload()
      setOpen(false)
    } catch (caught) {
      setError(messageOf(caught, 'That teamsheet could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate">
            vs {opponent} <span className="opacity-60">{side === 'home' ? 'home' : 'away'}</span>
            {score && <span className="ml-2 font-semibold">{score}</span>}
          </div>
          <div className="text-xs text-gray-400 truncate">
            {when} - {seriesName(tournament)} {seasonLabel(tournament)}
          </div>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs px-2 py-1 rounded-lg glass hover:bg-white/10 transition-colors inline-flex items-center gap-1.5 shrink-0"
        >
          <IconUsers size={13} />
          {stored.length === 0 ? 'name the team' : `${stored.length} playing`}
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-white/10">
          {players.length === 0 ? (
            <p className="text-sm opacity-60 py-2">
              Nobody is registered for this competition yet. Choose the squad above first.
            </p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Tick everyone who played. There is no deadline: a teamsheet filled in after the
                final whistle is still the record of who was on the pitch.
              </p>

              <ul className="grid gap-1 sm:grid-cols-2">
                {players.map((player) => {
                  const on = selected.includes(player.id)
                  return (
                    <li key={player.id}>
                      <label
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-white/10 ${
                          on ? 'bg-white/[0.06]' : 'bg-transparent opacity-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setSelected(
                              on
                                ? selected.filter((id) => id !== player.id)
                                : [...selected, player.id],
                            )
                          }
                        />
                        <span className="text-sm truncate">
                          {player.number ? (
                            <span className="opacity-60 mr-2">{player.number}</span>
                          ) : null}
                          {player.firstName} {player.lastName}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>

              {error && <p className="text-sm text-red-300 mt-2">{error}</p>}

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
                >
                  {saving ? 'Saving...' : 'Save teamsheet'}
                </button>
                <button
                  onClick={() => setSelected([])}
                  className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 text-sm text-gray-300"
                >
                  Clear
                </button>
                <span className="text-xs text-gray-400">{selected.length} selected</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ================================================================== *
 * The squad
 * ================================================================== */

const BLANK_PLAYER = { firstName: '', lastName: '', number: '', position: '' }

function Squad({ team, onReload }: { team: Team; onReload: () => Promise<void> }) {
  const players = team.players ?? []
  const [draft, setDraft] = useState(BLANK_PLAYER)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const add = async () => {
    if (!draft.firstName.trim() && !draft.lastName.trim()) return
    setAdding(true)
    setError(null)
    try {
      await playerService.add(team.id, {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        position: draft.position.trim(),
        number: draft.number ? Number(draft.number) : undefined,
        isPublic: true,
      })
      setDraft(BLANK_PLAYER)
      await onReload()
    } catch (caught) {
      setError(messageOf(caught, 'That player could not be added.'))
    } finally {
      setAdding(false)
    }
  }

  const remove = async (player: Player) => {
    if (!confirm(`Remove ${player.firstName} ${player.lastName} from the club?`)) return
    try {
      await playerService.remove(team.id, player.id)
      await onReload()
    } catch (caught) {
      setError(messageOf(caught, 'That player could not be removed.'))
    }
  }

  return (
    <div className="glass rounded-2xl p-5 border border-white/15">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-1 inline-flex items-center gap-2">
        <IconUsers size={15} /> Squad
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Everyone at the club. Who plays in each competition is chosen above.
      </p>

      {players.length > 0 && (
        <ul className="space-y-1 mb-4">
          {players.map((player) =>
            editingId === player.id ? (
              <PlayerEditor
                key={player.id}
                teamId={team.id}
                player={player}
                onDone={async () => {
                  setEditingId(null)
                  await onReload()
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <li
                key={player.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] group"
              >
                <span className="w-8 text-center text-sm opacity-60 shrink-0">
                  {player.number ?? '—'}
                </span>
                {player.photo ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={player.photo}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 opacity-50">
                    <IconUser size={13} />
                  </span>
                )}
                <Link
                  to={`/my-club/players/${player.id}`}
                  className="flex-1 min-w-0 truncate hover:underline"
                >
                  {player.firstName} {player.lastName}
                  {player.position && (
                    <span className="text-xs text-gray-400 ml-2">{player.position}</span>
                  )}
                </Link>
                <button
                  onClick={() => setEditingId(player.id)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/10"
                  title="Edit"
                >
                  <IconPencil size={14} />
                </button>
                <button
                  onClick={() => remove(player)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/20 text-red-300"
                  title="Remove from the club"
                >
                  <IconTrash size={14} />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="pt-4 border-t border-white/10">
        <div className="grid gap-2 sm:grid-cols-[4rem_1fr_1fr_8rem_auto]">
          <input
            value={draft.number}
            onChange={(event) => setDraft({ ...draft, number: event.target.value })}
            placeholder="No."
            inputMode="numeric"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          />
          <input
            value={draft.firstName}
            onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
            placeholder="First name"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          />
          <input
            value={draft.lastName}
            onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
            placeholder="Last name"
            onKeyDown={(event) => event.key === 'Enter' && add()}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          />
          <input
            value={draft.position}
            onChange={(event) => setDraft({ ...draft, position: event.target.value })}
            placeholder="Position"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          />
          <button
            onClick={add}
            disabled={adding || (!draft.firstName.trim() && !draft.lastName.trim())}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition-colors text-sm inline-flex items-center justify-center gap-1.5"
          >
            <IconPlus size={14} /> Add
          </button>
        </div>
        {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
      </div>
    </div>
  )
}

function PlayerEditor({
  teamId,
  player,
  onDone,
  onCancel,
}: {
  teamId: string
  player: Player
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [firstName, setFirstName] = useState(player.firstName)
  const [lastName, setLastName] = useState(player.lastName)
  const [number, setNumber] = useState(player.number?.toString() ?? '')
  const [position, setPosition] = useState(player.position ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await playerService.update(teamId, player.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        position: position.trim(),
        // `null`, not undefined: JSON drops undefined, so a number cleared here
        // would come back the next time the page loaded.
        number: number ? Number(number) : null,
      })
      await onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="grid gap-2 sm:grid-cols-[4rem_1fr_1fr_8rem_auto] px-3 py-2 rounded-lg bg-white/[0.06]">
      <input
        value={number}
        onChange={(event) => setNumber(event.target.value)}
        inputMode="numeric"
        className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
      />
      <input
        value={firstName}
        onChange={(event) => setFirstName(event.target.value)}
        className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
      />
      <input
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && save()}
        className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
      />
      <input
        value={position}
        onChange={(event) => setPosition(event.target.value)}
        className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
      />
      <div className="flex items-center gap-1">
        <button
          onClick={save}
          disabled={saving}
          className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          title="Save"
        >
          <IconCheck size={14} />
        </button>
        <button onClick={onCancel} className="p-2 rounded-lg glass hover:bg-white/10" title="Cancel">
          <IconClose size={14} />
        </button>
      </div>
    </li>
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

function nextFixture(tournaments: Tournament[], teamId: string, teamNames: Record<string, string>) {
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

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
