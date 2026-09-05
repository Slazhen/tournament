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
import { clubService, tournamentService } from '../lib/data'
import type { ClubManager, DirectoryClub, Entry } from '../lib/data'
import type { Team, Tournament } from '../types'
import { hasSquadEntry, registeredPlayers } from '../utils/squads'
import { competitionColor, headerColor } from '../utils/crest'
import Trophy from '../components/Trophy'
import { IconLink, IconUser, IconUsers } from '../components/icons'
import {
  adminSeasonUrl,
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
    getOrganizerById,
    getOrganizerTeams,
    getOrganizerTournaments,
    updateTournament,
    deleteTournament,
    uploadTournamentLogo,
    loadTournaments,
  } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const tournaments = getOrganizerTournaments()
  const tournament = tournaments.find((candidate) => candidate.id === id)
  const organizer = getOrganizerById(tournament?.organizerId) ?? currentOrganizer

  // Every club this page might have to name — an applicant from outside the
  // league included — and, separately, the ones it may put in the competition.
  // (The super admin sees every organizer's clubs, hence the split.)
  // The super admin sees every club there is, and offering another organizer's
  // in the picker is how one would end up in a league it never applied to.
  const teams = getOrganizerTeams()
  const pickableTeams = tournament
    ? teams.filter(
        (team) =>
          team.organizerId === tournament.organizerId || tournament.teamIds.includes(team.id),
      )
    : teams

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

  if (!tournament) {
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
  // Competitions this season could be joined to: its own organizer's, never
  // another's. The super admin sees every organizer's tournaments in
  // `tournaments`, and merging a season into a competition run by somebody else
  // would hand it over without saying so.
  const otherCompetitions = groupIntoSeries(
    tournaments.filter((candidate) => candidate.organizerId === tournament.organizerId),
  ).filter((entry) => entry.key !== seriesKey(tournament))

  const pendingEntries = entries.filter((entry) => entry.status === 'pending')
  // Places offered and not yet answered. The club is not in the competition:
  // only it can turn an invitation into an entry, which is why the organiser's
  // decide route refuses to accept one of these.
  const invitedEntries = entries.filter((entry) => entry.status === 'invited')

  const reloadEntries = async () => {
    if (!id) return
    const [refreshedEntries] = await Promise.all([clubService.entriesFor(id), loadTournaments()])
    setEntries(refreshedEntries)
    setDraftTeamIds(null)
  }

  const decide = async (teamId: string, status: 'accepted' | 'declined') => {
    if (!id) return
    setDeciding(teamId)
    try {
      await clubService.decide(id, teamId, status)
      await reloadEntries()
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
          to={adminSeasonUrl(tournament, organizer)}
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

        <HeaderColour tournament={tournament} onChange={updateTournament} />
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
                    {club?.name ?? entry.teamName ?? 'A club'}
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

      {/* ---------- Invitations this organiser has issued ---------- */}
      {invitedEntries.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4 border border-emerald-400/25">
          <h2 className="font-semibold">Clubs you have invited ({invitedEntries.length})</h2>
          <p className="text-sm opacity-70">
            Waiting on the club. A place is offered, not taken — the club joins when its manager
            accepts, and nothing changes here until then.
          </p>

          <ul className="space-y-2">
            {invitedEntries.map((entry) => {
              const club = teams.find((candidate) => candidate.id === entry.teamId)
              return (
                <li
                  key={entry.teamId}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
                >
                  <span>
                    {club?.name ?? entry.teamName ?? 'A club'}
                    <span className="opacity-50 text-xs ml-2">
                      invited {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                    {/* A club that has answered before, whichever way. Without
                        it a second invitation reads as a first one. */}
                    {entry.previousDecidedAt && (
                      <span className="block text-xs text-amber-300/80 mt-0.5">
                        Asked before and turned it down
                        {entry.previousNote ? ` — ${entry.previousNote}` : ''}
                      </span>
                    )}
                  </span>
                  {/* Taking back what was offered. Accepting is deliberately not
                      here: the club has not answered, and the API refuses it. */}
                  <button
                    type="button"
                    disabled={deciding === entry.teamId}
                    onClick={() => decide(entry.teamId, 'declined')}
                    className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 text-sm transition-all disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ---------- Clubs from other leagues ---------- */}
      <InviteClubs
        tournamentId={tournament.id}
        teamIds={tournament.teamIds}
        entries={entries}
        onInvited={reloadEntries}
      />

      {/* ---------- Squads ---------- */}
      <SquadsSection
        tournament={tournament}
        teams={teams.filter((team) => tournament.teamIds.includes(team.id))}
        onLock={(locked) => updateTournament(tournament.id, { squadsLocked: locked })}
        onReload={loadTournaments}
      />

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
            <TeamPicker teams={pickableTeams} selectedIds={selectedTeamIds} onChange={setDraftTeamIds} />

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

      {/* ---------- Who runs the clubs ---------- */}
      <ClubManagers
        tournamentId={tournament.id}
        tournamentName={tournament.name}
        teams={teams.filter((team) => tournament.teamIds.includes(team.id))}
      />

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

/**
 * Who runs each club in this competition, and how to hand one over.
 *
 * The invitation is issued from here rather than only from the club's own card
 * because of what it now does: a link created here carries this competition, so
 * taking it up both hands over the club and enters it. An organiser inviting a
 * coach in the middle of setting up a season has already decided the club is
 * playing, and asking the new manager to apply back to them afterwards is a
 * question with a known answer.
 */
function ClubManagers({
  tournamentId,
  tournamentName,
  teams,
}: {
  tournamentId: string
  tournamentName: string
  teams: Team[]
}) {
  const [managers, setManagers] = useState<Record<string, ClubManager[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<{ teamId: string; link: string; emailed: boolean; email: string } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)

    clubService
      .managersForTournament(tournamentId)
      .then((byTeam) => {
        if (!cancelled) setManagers(byTeam)
      })
      .catch(() => {
        if (!cancelled) setManagers({})
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [tournamentId])

  const invite = async (teamId: string) => {
    setBusy(true)
    setFailed(null)
    try {
      const wanted = email.trim()
      const result = await clubService.invite(teamId, wanted || undefined, tournamentId)
      setIssued({ teamId, link: result.link, emailed: result.emailed, email: wanted })
      setOpenFor(null)
      setEmail('')
      try {
        await navigator.clipboard.writeText(result.link)
      } catch {
        // The link is on screen either way.
      }
    } catch {
      setFailed('That invitation could not be created.')
    } finally {
      setBusy(false)
    }
  }

  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
      <div>
        <h2 className="font-semibold inline-flex items-center gap-2">
          <IconUser size={16} /> Club managers
        </h2>
        <p className="text-sm opacity-70 mt-1">
          A link issued here hands the club over and enters it in {tournamentName} as soon as it
          is opened. The manager gets the squad and the crest; results stay with you.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm opacity-70">No clubs in this competition yet.</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {sorted.map((team) => {
            const running = managers[team.id] ?? []
            return (
              <li key={team.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{team.name}</div>
                    {!loaded ? (
                      <div className="text-xs opacity-50">Checking...</div>
                    ) : running.length === 0 ? (
                      <div className="text-xs opacity-60">Nobody runs this club yet</div>
                    ) : (
                      running.map((manager) => (
                        <div key={manager.id} className="text-xs opacity-70">
                          {manager.displayName ? `${manager.displayName} — ` : ''}
                          {manager.email || 'account no longer exists'}
                          {manager.linkedAt
                            ? ` · since ${new Date(manager.linkedAt).toLocaleDateString()}`
                            : ''}
                          {manager.isActive ? '' : ' · account disabled'}
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenFor(openFor === team.id ? null : team.id)
                      setEmail('')
                      setFailed(null)
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all text-sm"
                  >
                    <IconLink size={14} />
                    {running.length === 0 ? 'Invite manager' : 'Invite another'}
                  </button>
                </div>

                {openFor === team.id && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="Their email (optional)"
                      className="flex-1 min-w-[14rem] px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => invite(team.id)}
                      disabled={busy}
                      className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
                    >
                      {busy ? 'Creating...' : 'Create link'}
                    </button>
                  </div>
                )}

                {issued?.teamId === team.id && (
                  <div>
                    <p className="text-sm text-gray-300 mb-1">
                      {issued.emailed
                        ? `Sent to ${issued.email}, and copied to your clipboard. It works once and lasts a fortnight.`
                        : issued.email
                          ? `The email could not be sent to ${issued.email}, so pass this on yourself. It works once and lasts a fortnight.`
                          : 'Copied to your clipboard. It works once and lasts a fortnight.'}
                    </p>
                    <code className="block text-xs bg-black/40 border border-white/10 rounded-lg p-3 break-all text-blue-200">
                      {issued.link}
                    </code>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {failed && <p className="text-sm text-red-300">{failed}</p>}
    </section>
  )
}

/* ================================================================== *
 * Clubs from other leagues
 * ================================================================== */

/**
 * Finding a club that does not belong to this organiser, and asking it to play.
 *
 * The clubs listed here are the pool: every club run by its own manager that
 * has not hidden itself. What this sends is an invitation and not an entry —
 * the club's own manager accepts it, on their own page — because a club being
 * findable has not agreed to play.
 *
 * The manager's name sits beside every club on purpose. Two clubs called United
 * are indistinguishable by name, and the question an organiser is actually
 * asking is "is this the one I have been talking to".
 *
 * Shut until asked for, and fetched once when it opens: the pool is a read of
 * every club in the system and most visits to this screen are about the fixture
 * list.
 */
function InviteClubs({
  tournamentId,
  teamIds,
  entries,
  onInvited,
}: {
  tournamentId: string
  teamIds: string[]
  entries: Entry[]
  onInvited: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [clubs, setClubs] = useState<DirectoryClub[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [inviting, setInviting] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)

  useEffect(() => {
    if (!open || clubs !== null) return
    let cancelled = false

    clubService
      .directory()
      .then((list) => {
        if (!cancelled) setClubs(list)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, clubs])

  const statusOf = (teamId: string): string | null => {
    if (teamIds.includes(teamId)) return 'already in this competition'
    const entry = entries.find((candidate) => candidate.teamId === teamId)
    if (!entry) return null
    if (entry.status === 'invited') return 'invited, waiting on them'
    if (entry.status === 'pending') return 'has applied — answer above'
    if (entry.status === 'declined') return 'turned down before'
    if (entry.status === 'refused') return 'turned your invitation down'
    // `withdrawn` is this organiser's own change of mind, so the club is
    // invitable again and gets a button rather than a note.
    return null
  }

  const invite = async (club: DirectoryClub) => {
    setInviting(club.id)
    setFailed(null)
    try {
      await clubService.inviteToTournament(tournamentId, club.id)
      await onInvited()
    } catch (error) {
      setFailed({
        id: club.id,
        message: error instanceof Error ? error.message : 'That invitation could not be sent.',
      })
    } finally {
      setInviting(null)
    }
  }

  const needle = query.trim().toLowerCase()
  const shown = (clubs ?? []).filter(
    (club) =>
      !needle ||
      club.name.toLowerCase().includes(needle) ||
      (club.ownerName ?? '').toLowerCase().includes(needle),
  )

  return (
    <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-semibold">Clubs from other leagues</h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-sm px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all"
        >
          {open ? 'Close' : 'Find a club'}
        </button>
      </div>
      <p className="text-sm opacity-70">
        Clubs run by their own managers, including the ones already on your list. Inviting one
        offers it a place; it joins when its manager accepts.
      </p>

      {open && (
        <>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Club or owner"
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
          />

          {loadFailed && (
            <p className="text-sm text-red-300">That list could not be read. Reload the page.</p>
          )}

          {!loadFailed && clubs === null && <p className="text-sm opacity-60">Looking…</p>}

          {clubs !== null && shown.length === 0 && (
            <p className="text-sm opacity-60">
              {clubs.length === 0
                ? 'No club outside your own leagues is in the pool yet.'
                : 'Nothing matches that search.'}
            </p>
          )}

          <ul className="space-y-2">
            {shown.map((club) => {
              const already = statusOf(club.id)
              return (
                <li
                  key={club.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    {club.logo ? (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={club.logo}
                        alt=""
                        className="w-8 h-8 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <span
                        className="w-8 h-8 rounded-md shrink-0"
                        style={{ backgroundColor: headerColor(club) }}
                      />
                    )}
                    <span className="min-w-0">
                      {/* Who to ask, in brackets after the name — the pool is
                          managers' clubs, so it is a person. `ownerKind` is
                          still read: a club listed before the pool existed can
                          have been put there by the league that owns it. */}
                      <span className="block truncate">
                        {club.name}{' '}
                        <span className="opacity-60">
                          (
                          {club.ownerName
                            ? club.ownerKind === 'manager'
                              ? club.ownerName
                              : `${club.ownerName}, league`
                            : 'manager not named'}
                          )
                        </span>
                      </span>
                      <span className="block text-xs opacity-60 truncate">
                        {club.squadSize} {club.squadSize === 1 ? 'player' : 'players'}
                      </span>
                    </span>
                  </span>

                  {already ? (
                    <span className="text-xs opacity-60 shrink-0">{already}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={inviting === club.id}
                      onClick={() => invite(club)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm transition-colors disabled:opacity-50 shrink-0"
                    >
                      {inviting === club.id ? 'Inviting…' : 'Invite'}
                    </button>
                  )}

                  {failed?.id === club.id && (
                    <p className="w-full text-xs text-red-300">{failed.message}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

/* ================================================================== *
 * Squads: who is entered, and under which rule
 * ================================================================== */

/**
 * The organiser's view of entries.
 *
 * Two things live here that look alike and are not. Closing squads is a
 * deadline: it stops the managers writing, and changes nothing about who is
 * registered. Strict entry is a rule: it changes what a club with no entry
 * means, from everybody to nobody, which is the difference between a friendly
 * league and a competition with a registration list.
 *
 * The organiser can also enter any club themselves. Most clubs in a new
 * competition have no manager at all, and a competition whose entries only a
 * coach can fill in is one the organiser cannot run.
 */
function SquadsSection({
  tournament,
  teams,
  onLock,
  onReload,
}: {
  tournament: Tournament
  teams: Team[]
  onLock: (locked: boolean) => void
  onReload: () => Promise<void>
}) {
  const strict = tournament.squadsStrict === true
  const [switching, setSwitching] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const setMode = async (next: boolean) => {
    setSwitching(true)
    setFailed(null)
    try {
      await tournamentService.setSquadMode(tournament.id, next)
      await onReload()
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That could not be changed.')
    } finally {
      setSwitching(false)
    }
  }

  return (
    <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-5">
      <h2 className="font-semibold">Squads</h2>
      <p className="text-sm opacity-70">
        Who each club has registered here. A club's manager chooses, and so can you — most clubs
        have nobody to do it for them yet.
      </p>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={strict}
          disabled={switching}
          onChange={(event) => setMode(event.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="block">Registration list</span>
          <span className="block text-sm opacity-70">
            {strict
              ? 'A club plays only the players entered here, and a player signed later does not join until somebody enters them.'
              : 'Off, a club that has entered nobody in particular plays its whole squad, and anyone it signs joins automatically. Turning this on enters every club as it stands today, so nothing already arranged is lost.'}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={tournament.squadsLocked === true}
          onChange={(event) => onLock(event.target.checked)}
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

      {failed && <p className="text-sm text-red-300">{failed}</p>}

      {teams.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {teams.map((team) => (
            <SquadRow key={team.id} tournament={tournament} team={team} onReload={onReload} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** One club, and the players it has entered. */
function SquadRow({
  tournament,
  team,
  onReload,
}: {
  tournament: Tournament
  team: Team
  onReload: () => Promise<void>
}) {
  const players = team.players ?? []
  const entered = registeredPlayers(tournament, team)
  const submitted = hasSquadEntry(tournament, team.id)
  const strict = tournament.squadsStrict === true

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(entered.map((player) => player.id))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  // The list is reset from the record whenever the record changes underneath
  // it, so a manager saving their own squad while this is open does not get
  // overwritten by a stale set of ticks the next time Save is pressed.
  useEffect(() => {
    setSelected(registeredPlayers(tournament, team).map((player) => player.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id, tournament.squads?.[team.id]?.join(','), strict, players.length])

  const save = async () => {
    setSaving(true)
    setFailed(null)
    try {
      await tournamentService.saveSquad(tournament.id, team.id, selected)
      await onReload()
      setOpen(false)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That squad could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="rounded-lg bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="truncate">{team.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          {strict && !submitted && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
              not entered
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs px-2 py-1 rounded-lg glass hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
          >
            <IconUsers size={13} />
            {players.length === 0 ? 'no players' : `${entered.length} of ${players.length}`}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-white/10">
          {players.length === 0 ? (
            <p className="text-sm opacity-60 py-2">
              This club has no players yet. Add them on the club's own page first.
            </p>
          ) : (
            <>
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

              <div className="flex items-center gap-3 mt-3">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(players.map((player) => player.id))}
                  className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                >
                  Everyone
                </button>
                {failed && <span className="text-sm text-red-300">{failed}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * The colour the season's public header is painted in.
 *
 * Two values sit behind one control. `logoColor` is read from the logo when it
 * is uploaded and is what almost every competition should use; `themeColor` is
 * the organiser saying otherwise, and is kept separate so that uploading a new
 * logo re-reads the automatic colour without discarding a deliberate choice.
 * Clearing the override is therefore a real action and not the same as picking
 * the colour the logo happens to have today — which is also why every season
 * that predates this reads as "no colour" rather than as a chosen grey.
 */
function HeaderColour({
  tournament,
  onChange,
}: {
  tournament: Tournament
  onChange: (id: string, updates: Partial<Tournament>) => void
}) {
  const automatic = tournament.logoColor ?? null
  const chosen = tournament.themeColor ?? null
  const stored = competitionColor(tournament)
  // React maps `onChange` on a colour input to the DOM `input` event, which
  // fires all the way through a drag across the picker. Saving from it would
  // send a request per pixel of travel, each one rewriting the season record.
  // The value is held here and written once the hand has stopped moving —
  // waiting for a blur alone would lose a colour picked and then navigated
  // away from, since the picker keeps focus while it is open.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? stored

  useEffect(() => {
    if (draft === null) return
    if (draft.toLowerCase() === stored.toLowerCase()) return
    const timer = setTimeout(() => onChange(tournament.id, { themeColor: draft }), 600)
    return () => clearTimeout(timer)
  }, [draft, stored, tournament.id, onChange])

  return (
    <div>
      <span className="text-sm opacity-70">Header colour</span>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="w-10 h-10 rounded-lg border border-white/20 shrink-0"
          style={{ backgroundColor: shown }}
        />
        <input
          type="color"
          aria-label="Header colour"
          value={shown}
          onChange={(event) => setDraft(event.target.value)}
          className="w-16 h-10 rounded-lg bg-white/5 border border-white/20 cursor-pointer"
        />
        {chosen && (
          <button
            type="button"
            onClick={() => {
              setDraft(null)
              onChange(tournament.id, { themeColor: null })
            }}
            className="text-sm opacity-70 hover:opacity-100 transition-opacity underline underline-offset-4"
          >
            {automatic ? 'Use the logo’s colour' : 'Clear'}
          </button>
        )}
      </div>
      <span className="text-xs opacity-50">
        {chosen
          ? 'Chosen by hand. Uploading a new logo will not change it.'
          : automatic
            ? 'Read from the logo. Pick a colour to override it.'
            : 'This logo was uploaded before colours were read from them. Upload it again, or pick a colour here.'}
      </span>
    </div>
  )
}
