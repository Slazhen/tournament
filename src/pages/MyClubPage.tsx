import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  clubService,
  playerService,
  teamService,
  tournamentService,
  uploadImage,
} from '../lib/data'
import type { Entry, TournamentSummary } from '../lib/data'
import type { Player, Team, Tournament, Match } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { calculateTeamStandings, sortTeamsByStandings } from '../utils/schedule'
import { seasonLabel, seasonMatches, seriesName } from '../utils/seasons'
import Trophy from '../components/Trophy'
import LogoUploader from '../components/LogoUploader'
import {
  IconCalendar,
  IconChart,
  IconCheck,
  IconClose,
  IconLock,
  IconPencil,
  IconPlus,
  IconShield,
  IconTrash,
  IconTrophy,
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
          tournaments={tournaments}
          entries={entries.filter((entry) => entry.teamId === team.id)}
          teamNames={teamNames}
          openCompetitions={openCompetitions}
          applying={applying === team.id}
          onReload={load}
          onApply={async (tournamentId) => {
            setApplying(team.id)
            try {
              await clubService.apply(team.id, tournamentId)
              await load()
            } catch (error) {
              alert(messageOf(error, 'That application could not be sent.'))
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
  onReload,
}: {
  team: Team
  tournaments: Tournament[]
  entries: Entry[]
  teamNames: Record<string, string>
  openCompetitions: TournamentSummary[]
  applying: boolean
  onApply: (tournamentId: string) => void
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

  const pending = entries.filter((entry) => entry.status === 'pending')
  const declined = entries.filter((entry) => entry.status === 'declined')

  const enteredIds = new Set([
    ...playing.map((tournament) => tournament.id),
    ...entries.map((entry) => entry.tournamentId),
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
            <div
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
            </div>
          ))}

          {playing.length === 0 && entries.length === 0 && (
            <p className="opacity-60 text-sm px-3 py-2">Not entered anywhere yet.</p>
          )}
        </div>

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
 * The club itself: name, colours, crest, photo
 * ================================================================== */

const DEFAULT_COLORS = ['#3B82F6', '#EF4444']

function ClubIdentity({ team, onReload }: { team: Team; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(team.name)
  const [colors, setColors] = useState<string[]>(team.colors?.length ? team.colors : ['#3B82F6'])
  const [facebook, setFacebook] = useState(team.socialMedia?.facebook ?? '')
  const [instagram, setInstagram] = useState(team.socialMedia?.instagram ?? '')
  const [established, setEstablished] = useState(team.establishedDate ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed the draft whenever the club is reloaded, so a save made elsewhere
  // (or by the organiser) does not sit invisibly behind a stale form.
  useEffect(() => {
    setName(team.name)
    setColors(team.colors?.length ? team.colors : ['#3B82F6'])
    setFacebook(team.socialMedia?.facebook ?? '')
    setInstagram(team.socialMedia?.instagram ?? '')
    setEstablished(team.establishedDate ?? '')
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
        socialMedia: { facebook: facebook.trim(), instagram: instagram.trim() },
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
    await teamService.update(team.id, { [field]: url })
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
                <label className="block sm:col-span-2">
                  <span className="text-sm text-gray-300">Facebook</span>
                  <input
                    value={facebook}
                    onChange={(event) => setFacebook(event.target.value)}
                    placeholder="https://facebook.com/…"
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
                  />
                </label>
              </div>

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

              <div className="text-sm text-gray-400">
                {team.socialMedia?.instagram || team.socialMedia?.facebook
                  ? [team.socialMedia?.instagram, team.socialMedia?.facebook]
                      .filter(Boolean)
                      .join(' · ')
                  : 'No social links yet.'}
              </div>
            </>
          )}

          <div>
            <span className="text-sm text-gray-300">Team photo</span>
            <div className="mt-1 flex items-center gap-3">
              {team.photo && (
                <img
                  src={team.photo}
                  alt={`${team.name}`}
                  className="w-28 h-16 object-cover rounded-lg border border-white/15"
                />
              )}
              <LogoUploader
                currentLogo={undefined}
                size={64}
                compressionType="team"
                onLogoUpload={(file) => upload(file, 'photo')}
              />
            </div>
          </div>
        </div>
      </div>
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
  const entered = stored ?? players.map((player) => player.id)
  const locked = tournament.squadsLocked === true

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(entered)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(stored ?? players.map((player) => player.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id, stored?.join(','), players.length])

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
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
            playing
          </span>
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
                <span className="flex-1 min-w-0 truncate">
                  {player.firstName} {player.lastName}
                  {player.position && (
                    <span className="text-xs text-gray-400 ml-2">{player.position}</span>
                  )}
                </span>
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
        number: number ? Number(number) : undefined,
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
