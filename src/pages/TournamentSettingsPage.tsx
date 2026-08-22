import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../store'
import LogoUploader from '../components/LogoUploader'
import TeamPicker from '../components/TeamPicker'
import VisibilityToggle from '../components/VisibilityToggle'
import InlineInput from '../components/InlineInput'
import FormatPicker from '../components/FormatPicker'
import { findFormat, formatOptionFor } from '../utils/formats'
import { planTeamChange, teamEditMode, planFormatChange, planPlayoffSeeding } from '../utils/fixtures'
import type { TournamentFormat } from '../utils/fixtures'
import { getAdminTournamentUrl } from '../utils/urls'
import { clubService } from '../lib/data'
import type { Entry } from '../lib/data'
import Trophy from '../components/Trophy'
import {
  championOf,
  seasonLabel,
  seasonStatus,
  seriesKey,
  seriesName,
  groupIntoSeries,
} from '../utils/seasons'

/**
 * Editing a tournament that already exists.
 *
 * Until now the only things that could be changed after creation were the logo
 * and a couple of links tucked into the page header — a typo in the name, or a
 * club dropping out in week three, meant deleting the whole season and starting
 * again. Everything editable lives here, and changing the teams shows what it
 * will do to the fixtures before anything is saved.
 */
export default function TournamentSettingsPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const {
    getCurrentOrganizer,
    getOrganizerTeams,
    getOrganizerTournaments,
    updateTournament,
    deleteTournament,
    uploadTournamentLogo,
    loadTournaments,
  } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()
  const tournament = tournaments.find((candidate) => candidate.id === id)

  const [draftTeamIds, setDraftTeamIds] = useState<string[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [draftFormatId, setDraftFormatId] = useState<string | null>(null)
  const [draftQualifiers, setDraftQualifiers] = useState<number | null>(null)
  const [draftGroups, setDraftGroups] = useState<{
    numberOfGroups: number
    teamsPerGroup: number
    groupRounds: number
  } | null>(null)
  const [isSavingFormat, setIsSavingFormat] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [deciding, setDeciding] = useState<string | null>(null)

  // Clubs asking to join. The organiser decides; nothing enters a competition
  // on its own.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    clubService
      .entriesFor(id)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [id])

  const selectedTeamIds = draftTeamIds ?? tournament?.teamIds ?? []

  const plan = useMemo(
    () => (tournament ? planTeamChange(tournament, selectedTeamIds) : null),
    [tournament, selectedTeamIds],
  )

  if (!currentOrganizer || !tournament) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Tournament not found</h1>
          <Link to="/tournaments" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Back to tournaments
          </Link>
        </div>
      </div>
    )
  }

  const editMode = teamEditMode(tournament)
  const formatTitle = formatOptionFor(tournament.format).title

  const teamsChanged = Boolean(plan && (plan.added.length > 0 || plan.removed.length > 0))

  /* ---------- Format ---------- */

  const currentFormatId = formatOptionFor(tournament.format).id

  const selectedFormat = findFormat(draftFormatId ?? currentFormatId)
  const qualifiers =
    draftQualifiers ??
    tournament.format?.playoffQualifiers ??
    tournament.format?.customPlayoffConfig?.playoffTeams ??
    4
  const groupsConfig = draftGroups ?? {
    numberOfGroups: tournament.format?.groupsWithDivisionsConfig?.numberOfGroups ?? 4,
    teamsPerGroup: tournament.format?.groupsWithDivisionsConfig?.teamsPerGroup ?? 4,
    groupRounds: tournament.format?.groupsWithDivisionsConfig?.groupRounds ?? 1,
  }

  // Adding finals to a league keeps the league exactly as it is, so the number
  // of legs has to come from the tournament rather than from the format card.
  const inheritedLegs =
    tournament.format?.mode === 'league' &&
    (selectedFormat.mode === 'league_playoff' || selectedFormat.mode === 'league_custom_playoff')
      ? tournament.format.rounds || 1
      : selectedFormat.rounds

  const nextFormat: TournamentFormat = {
    rounds: inheritedLegs,
    mode: selectedFormat.mode,
    playoffQualifiers: selectedFormat.mode === 'league_playoff' ? qualifiers : undefined,
    customPlayoffConfig:
      selectedFormat.mode === 'league_custom_playoff'
        ? {
            ...(tournament.format?.customPlayoffConfig ?? {
              playoffTeams: qualifiers,
              enableBye: true,
              playoffRounds: [],
            }),
            // Dropped entirely when switching to plain Custom, since the whole
            // format object is replaced on save.
            preset: selectedFormat.preset,
          }
        : undefined,
    groupsWithDivisionsConfig:
      selectedFormat.mode === 'groups_with_divisions' ? groupsConfig : undefined,
  }

  const formatPlan = planFormatChange(tournament, nextFormat)
  const seeding = planPlayoffSeeding(tournament)
  // The week-by-week system builds its own rounds and has no bracket to seed.
  const isProgressive =
    tournament.format?.customPlayoffConfig?.preset === 'progressive_elimination'
  const hasSeedableBracket =
    tournament.format?.mode === 'league_playoff' ||
    (tournament.format?.mode === 'league_custom_playoff' && !isProgressive)
  const canDrawBracket = hasSeedableBracket && seeding.canSeed

  /* ---------- Season ---------- */

  const status = seasonStatus(tournament)
  const siblings = tournaments
    .filter((candidate) => seriesKey(candidate) === seriesKey(tournament))
    .sort(
      (a, b) => new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime(),
    )
  const derivedChampion = championOf({ ...tournament, championTeamId: undefined })
  const championTeam = teams.find((team) => team.id === championOf(tournament))
  const otherCompetitions = groupIntoSeries(tournaments).filter(
    (entry) => entry.key !== seriesKey(tournament),
  )

  const pendingEntries = entries.filter((entry) => entry.status === 'pending')

  const decide = async (teamId: string, status: 'accepted' | 'declined') => {
    if (!id) return
    setDeciding(teamId)
    try {
      await clubService.decide(id, teamId, status)
      const [refreshedEntries] = await Promise.all([clubService.entriesFor(id), loadTournaments()])
      setEntries(refreshedEntries)
      setDraftTeamIds(null)
    } finally {
      setDeciding(null)
    }
  }

  const resetFormatDraft = () => {
    setDraftFormatId(null)
    setDraftQualifiers(null)
    setDraftGroups(null)
  }

  const saveFormat = async () => {
    if (formatPlan.kind === 'unchanged' || formatPlan.kind === 'blocked') return

    if (formatPlan.kind === 'destructive') {
      const typed = prompt(
        `This deletes ${formatPlan.lostResults} result(s) and rebuilds the fixture list.\n` +
          `Type the tournament name to confirm:\n\n${tournament.name}`,
      )
      if (typed?.trim() !== tournament.name) return
    }

    setIsSavingFormat(true)
    try {
      const format: TournamentFormat = formatPlan.groups
        ? {
            ...nextFormat,
            groupsWithDivisionsConfig: nextFormat.groupsWithDivisionsConfig
              ? { ...nextFormat.groupsWithDivisionsConfig, groups: formatPlan.groups }
              : undefined,
          }
        : nextFormat

      await updateTournament(tournament.id, { format, matches: formatPlan.matches })
      resetFormatDraft()
    } finally {
      setIsSavingFormat(false)
    }
  }

  const drawBracket = async () => {
    if (!seeding.canSeed) return
    setIsDrawing(true)
    try {
      await updateTournament(tournament.id, {
        matches: [...(tournament.matches || []), ...seeding.matches],
      })
    } finally {
      setIsDrawing(false)
    }
  }

  const saveTeams = async () => {
    if (!plan || !teamsChanged || plan.mode === 'locked') return

    if (plan.droppedWithResults.length > 0) {
      const confirmed = confirm(
        `${plan.droppedWithResults.length} match(es) with a result will be deleted along with the ` +
          `team(s) you removed. This cannot be undone.\n\nContinue?`,
      )
      if (!confirmed) return
    }

    setIsSaving(true)
    try {
      await updateTournament(tournament.id, {
        teamIds: selectedTeamIds,
        matches: plan.matches,
      })
      setDraftTeamIds(null)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-6 w-full">
      <div className="w-full max-w-3xl">
        <Link
          to={getAdminTournamentUrl(tournament, currentOrganizer)}
          className="text-sm opacity-70 hover:opacity-100 transition-opacity"
        >
          ← Back to {tournament.name}
        </Link>
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-bold mb-1">Tournament settings</h1>
        <p className="opacity-70 text-sm">
          {formatTitle} · {tournament.matches?.length ?? 0} matches
        </p>
      </div>

      {/* ---------- Identity ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-5">
        <h2 className="font-semibold">Name and logo</h2>

        <label className="block">
          <span className="text-sm opacity-70">Tournament name</span>
          <InlineInput
            type="text"
            value={tournament.name}
            onCommit={(value) => {
              const name = value.trim()
              if (name && name !== tournament.name) updateTournament(tournament.id, { name })
            }}
            className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
          />
          <span className="text-xs opacity-50">
            The public address of the tournament follows its name, so old links stop working after a rename.
          </span>
        </label>

        <div>
          <span className="text-sm opacity-70">Logo</span>
          <div className="mt-2">
            <LogoUploader
              onLogoUpload={(file) => uploadTournamentLogo(tournament.id, file)}
              currentLogo={tournament.logo}
              size={120}
              compressionType="tournament"
            />
          </div>
        </div>
      </section>

      {/* ---------- Visibility ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-3">
        <h2 className="font-semibold">Who can see it</h2>
        <VisibilityToggle
          isPublic={tournament.visibility !== 'private'}
          onToggle={(isPublic) =>
            updateTournament(tournament.id, { visibility: isPublic ? 'public' : 'private' })
          }
        />
      </section>

      {/* ---------- Format ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">How it is played</h2>
          <span className="text-xs opacity-60">Currently: {formatTitle}</span>
        </div>

        <FormatPicker
          value={draftFormatId ?? currentFormatId}
          onChange={setDraftFormatId}
          teamCount={selectedTeamIds.length}
          qualifiers={qualifiers}
        />

        {(selectedFormat.mode === 'league_playoff' ||
          selectedFormat.mode === 'league_custom_playoff') && (
          <label className="block text-sm">
            <span className="opacity-70">Teams in the playoffs</span>
            <input
              type="number"
              min={2}
              max={Math.max(2, selectedTeamIds.length)}
              value={qualifiers}
              onChange={(event) => setDraftQualifiers(Number(event.target.value) || 2)}
              className="mt-1 w-24 px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
        )}

        {selectedFormat.mode === 'groups_with_divisions' && (
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['numberOfGroups', 'Groups', 2, 8],
                ['teamsPerGroup', 'Teams per group', 2, 8],
                ['groupRounds', 'Legs in the group', 1, 2],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key} className="text-sm">
                <span className="opacity-70">{label}</span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={groupsConfig[key]}
                  onChange={(event) =>
                    setDraftGroups({
                      ...groupsConfig,
                      [key]: Math.min(max, Math.max(min, Number(event.target.value) || min)),
                    })
                  }
                  className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
                />
              </label>
            ))}
          </div>
        )}

        {/* What the switch would actually do, before anything is written. */}
        {formatPlan.kind !== 'unchanged' && (
          <div
            className={`rounded-lg border p-3 text-sm space-y-1 ${
              formatPlan.kind === 'destructive'
                ? 'border-red-400/30 bg-red-400/5'
                : formatPlan.kind === 'blocked'
                  ? 'border-white/15 bg-white/[0.03]'
                  : 'border-amber-400/30 bg-amber-400/5'
            }`}
          >
            <div className="font-medium">
              {formatPlan.kind === 'blocked' ? 'Not yet' : 'What this will do'}
            </div>
            {formatPlan.notes.map((note) => (
              <p key={note} className="opacity-80">
                {note}
              </p>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveFormat}
            disabled={
              formatPlan.kind === 'unchanged' || formatPlan.kind === 'blocked' || isSavingFormat
            }
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSavingFormat ? 'Saving...' : 'Change format'}
          </button>
          {formatPlan.kind !== 'unchanged' && (
            <button
              type="button"
              onClick={resetFormatDraft}
              className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all"
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      {/* ---------- Drawing the bracket ---------- */}
      {hasSeedableBracket && (
        <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-3">
          <h2 className="font-semibold">Playoffs</h2>
          {canDrawBracket ? (
            <>
              <p className="text-sm opacity-70">
                The league is finished. The top {seeding.qualifiers} go into the bracket, seeded by
                the final table — {seeding.matches.length} matches.
              </p>
              <button
                type="button"
                onClick={drawBracket}
                disabled={isDrawing}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {isDrawing ? 'Drawing...' : 'Draw the bracket'}
              </button>
            </>
          ) : (
            <p className="text-sm opacity-70">
              {seeding.reason ?? 'The bracket cannot be drawn yet.'}
            </p>
          )}
        </section>
      )}

      {/* ---------- Applications ---------- */}
      {pendingEntries.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4 border border-amber-400/25">
          <h2 className="font-semibold">
            Clubs asking to join ({pendingEntries.length})
          </h2>
          <p className="text-sm opacity-70">
            Accepting adds the club to the tournament. It does not touch the fixture list — do that
            below, where you can see what it would cost first.
          </p>

          <ul className="space-y-2">
            {pendingEntries.map((entry) => {
              const club = teams.find((candidate) => candidate.id === entry.teamId)
              return (
                <li
                  key={entry.teamId}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
                >
                  <span>
                    {club?.name ?? 'A club'}
                    <span className="opacity-50 text-xs ml-2">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                    {/* A club may ask again after a refusal. Saying so, with the
                        reason given last time, is what keeps that from reading
                        as a first request the organiser has never seen. */}
                    {entry.previousDecidedAt && (
                      <span className="block text-xs text-amber-300/80 mt-0.5">
                        Asked before and was turned down
                        {entry.previousNote ? ` — ${entry.previousNote}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={deciding === entry.teamId}
                      onClick={() => decide(entry.teamId, 'accepted')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-300 text-sm transition-colors disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={deciding === entry.teamId}
                      onClick={() => decide(entry.teamId, 'declined')}
                      className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 text-sm transition-all disabled:opacity-50"
                    >
                      Not this time
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ---------- Squads ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
        <h2 className="font-semibold">Squads</h2>
        <p className="text-sm opacity-70">
          Each club's manager chooses which of their players are registered here. A club that
          chooses nobody in particular has its whole squad registered, so a club that never opens
          the screen is never left short.
        </p>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={tournament.squadsLocked === true}
            onChange={(event) =>
              updateTournament(tournament.id, { squadsLocked: event.target.checked })
            }
            className="mt-1"
          />
          <span>
            <span className="block">Close squads</span>
            <span className="block text-sm opacity-70">
              Managers can no longer change who is registered. You still can — somebody has to be
              able to fix a mistake after the deadline.
            </span>
          </span>
        </label>
      </section>

      {/* ---------- Season ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">Competition and season</h2>
          <span className="text-xs opacity-60">
            {status === 'finished'
              ? 'Finished'
              : status === 'running'
                ? 'In progress'
                : 'Not started'}
          </span>
        </div>

        <p className="text-sm opacity-70">
          Running the same league again next year is a new season of this competition, not a new
          competition. Seasons share a page and a switcher, so the year no longer has to be typed
          into the name.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="opacity-70">Competition</span>
            <InlineInput
              type="text"
              value={seriesName(tournament)}
              onCommit={(value) => {
                const name = value.trim()
                if (!name) return
                // Every season of a competition carries its name, so renaming it
                // means renaming them all — there are only ever a handful.
                for (const season of siblings) {
                  updateTournament(season.id, { seriesName: name })
                }
              }}
              placeholder="Homebush Futsal Premier League"
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="opacity-70">This season</span>
            <InlineInput
              type="text"
              value={tournament.seasonLabel || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, { seasonLabel: value.trim() || undefined })
              }
              placeholder={seasonLabel(tournament)}
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
        </div>

        {siblings.length > 1 && (
          <p className="text-sm opacity-70">
            {siblings.length} seasons: {siblings.map((season) => seasonLabel(season)).join(', ')}.
          </p>
        )}

        {/* Champion: worked out from the results, overridable when the pitch did
            not have the last word. */}
        <div>
          <span className="text-sm opacity-70">Champion</span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {championTeam && <Trophy size={30} />}
            <select
              value={tournament.championTeamId || ''}
              onChange={(event) =>
                updateTournament(tournament.id, {
                  championTeamId: event.target.value || undefined,
                })
              }
              className="px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
            >
              <option value="">
                {derivedChampion
                  ? `From the results: ${teams.find((team) => team.id === derivedChampion)?.name ?? 'unknown'}`
                  : 'Decided when the season finishes'}
              </option>
              {teams
                .filter((team) => selectedTeamIds.includes(team.id))
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Joining up a season that was created as its own tournament — which is
            how anyone would have done it before this existed. */}
        {otherCompetitions.length > 0 && (
          <label className="block text-sm">
            <span className="opacity-70">Move this into another competition</span>
            <select
              value=""
              disabled={isLinking}
              onChange={async (event) => {
                const target = otherCompetitions.find((entry) => entry.key === event.target.value)
                if (!target) return
                setIsLinking(true)
                try {
                  await updateTournament(tournament.id, {
                    seriesId: target.key,
                    seriesName: target.name,
                  })
                } finally {
                  setIsLinking(false)
                }
              }}
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            >
              <option value="">Keep it on its own</option>
              {otherCompetitions.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name} ({entry.seasons.length}{' '}
                  {entry.seasons.length === 1 ? 'season' : 'seasons'})
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {/* ---------- Where ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
        <h2 className="font-semibold">Venue and links</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="opacity-70">Venue name</span>
            <InlineInput
              type="text"
              value={tournament.location?.name || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, {
                  location: { ...tournament.location, name: value || undefined },
                })
              }
              placeholder="Homebush Futsal Centre"
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="opacity-70">Map link</span>
            <InlineInput
              type="url"
              value={tournament.location?.link || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, {
                  location: { ...tournament.location, link: value || undefined },
                })
              }
              placeholder="https://maps.app.goo.gl/..."
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="opacity-70">Facebook</span>
            <InlineInput
              type="url"
              value={tournament.socialMedia?.facebook || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, {
                  socialMedia: { ...tournament.socialMedia, facebook: value || undefined },
                })
              }
              placeholder="https://facebook.com/..."
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="opacity-70">Instagram</span>
            <InlineInput
              type="url"
              value={tournament.socialMedia?.instagram || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, {
                  socialMedia: { ...tournament.socialMedia, instagram: value || undefined },
                })
              }
              placeholder="https://instagram.com/..."
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* ---------- Teams ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">Teams ({selectedTeamIds.length})</h2>
          {editMode === 'regenerate' && (
            <span className="text-xs opacity-60">Nothing played yet — the draw can be redone</span>
          )}
        </div>

        {editMode === 'locked' ? (
          <p className="text-sm opacity-70">
            Results have already been entered and this format's draw is fixed once it starts. Add or
            remove teams by creating a new tournament — the fixtures here would no longer make sense.
          </p>
        ) : (
          <>
            <TeamPicker teams={teams} selectedIds={selectedTeamIds} onChange={setDraftTeamIds} />

            {teamsChanged && plan && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm space-y-1">
                <div className="font-medium">What this will do</div>
                {plan.added.length > 0 && <p className="opacity-80">Adding {plan.added.length} team(s).</p>}
                {plan.removed.length > 0 && (
                  <p className="opacity-80">Removing {plan.removed.length} team(s).</p>
                )}
                {plan.notes.map((note) => (
                  <p key={note} className="opacity-80">
                    {note}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveTeams}
                disabled={!teamsChanged || isSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save teams and fixtures'}
              </button>
              {teamsChanged && (
                <button
                  type="button"
                  onClick={() => setDraftTeamIds(null)}
                  className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---------- Deleting ---------- */}
      <section className="rounded-xl p-6 w-full max-w-3xl border border-red-500/20 bg-red-500/[0.03] space-y-3">
        <h2 className="font-semibold text-red-300">Delete this tournament</h2>
        <p className="text-sm opacity-70">
          Removes the fixtures, the results, the table and the public page. There is no undo.
        </p>
        <button
          type="button"
          onClick={async () => {
            const typed = prompt(`Type the tournament name to delete it:\n\n${tournament.name}`)
            if (typed?.trim() !== tournament.name) return
            await deleteTournament(tournament.id)
            navigate('/tournaments')
          }}
          className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors text-sm"
        >
          Delete tournament
        </button>
      </section>
    </div>
  )
}
