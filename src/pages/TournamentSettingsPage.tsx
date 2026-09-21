import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store'
import LogoUploader from '../components/LogoUploader'
import TeamPicker from '../components/TeamPicker'
import VisibilityToggle from '../components/VisibilityToggle'
import FormatPicker from '../components/FormatPicker'
import { findFormat, formatOptionFor } from '../utils/formats'
import { planTeamChange, teamEditMode, planFormatChange, planPlayoffSeeding } from '../utils/fixtures'
import type { TournamentFormat } from '../utils/fixtures'
import { clubService, tournamentService } from '../lib/data'
import type { ClubManager, Entry } from '../lib/data'
import type { Team, Tournament } from '../types'
import { activeSquad, hasSquadEntry, registeredPlayers, squadLimitOf } from '../utils/squads'
import { playoffTiers } from '../utils/standings'
import { disciplineRules, type DisciplineRules } from '../utils/discipline'
import DisciplineRulesEditor from '../components/DisciplineRulesEditor'
import { competitionColor } from '../utils/crest'
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

/* ================================================================== *
 * The plain fields, held as a draft until the organiser saves them
 * ================================================================== */

/**
 * Everything on this screen that is a value rather than an action.
 *
 * These used to save themselves the moment a field lost focus, which is what
 * was reported as "there is no save button": a name typed and then clicked away
 * from had already been written, a name typed and then abandoned had been
 * written too, and nothing on the screen ever said which. They are edited into
 * this draft now and written when the organiser says so.
 *
 * What is deliberately *not* here is everything whose consequence is not a
 * value: the format and the team list each keep their own button, because both
 * show what the change would cost the fixtures before it happens, and a switch
 * (public or private, squads open or closed) reads as done the moment it moves.
 */
type Details = {
  name: string
  seriesName: string
  seasonLabel: string
  championTeamId: string
  venueName: string
  venueLink: string
  facebook: string
  instagram: string
  /** Null is the organiser's own colour taken off again, not "unchanged". */
  themeColor: string | null
}

/** What the save bar calls each of them. */
const DETAIL_LABELS: Record<keyof Details, string> = {
  name: 'Tournament name',
  seriesName: 'Competition',
  seasonLabel: 'Season',
  championTeamId: 'Champion',
  venueName: 'Venue',
  venueLink: 'Map link',
  facebook: 'Facebook',
  instagram: 'Instagram',
  themeColor: 'Header colour',
}

function detailsOf(tournament: Tournament): Details {
  return {
    name: tournament.name,
    // The competition's name falls back to the season's, so an untouched field
    // shows what the public page shows rather than an empty box.
    seriesName: seriesName(tournament),
    seasonLabel: tournament.seasonLabel ?? '',
    championTeamId: tournament.championTeamId ?? '',
    venueName: tournament.location?.name ?? '',
    venueLink: tournament.location?.link ?? '',
    facebook: tournament.socialMedia?.facebook ?? '',
    instagram: tournament.socialMedia?.instagram ?? '',
    themeColor: tournament.themeColor ?? null,
  }
}

const changedDetails = (saved: Details, draft: Details): (keyof Details)[] =>
  (Object.keys(saved) as (keyof Details)[]).filter((key) => saved[key] !== draft[key])

/* ================================================================== *
 * Tabs
 * ================================================================== */

type TabId = 'general' | 'format' | 'clubs' | 'squads'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'format', label: 'Format' },
  { id: 'clubs', label: 'Clubs' },
  { id: 'squads', label: 'Squads' },
]

const isTab = (value: string | null): value is TabId =>
  TABS.some((entry) => entry.id === value)

/**
 * Editing a tournament that already exists.
 *
 * Until now the only things that could be changed after creation were the logo
 * and a couple of links tucked into the page header — a typo in the name, or a
 * club dropping out in week three, meant deleting the whole season and starting
 * again. Everything editable lives here, and changing the teams shows what it
 * will do to the fixtures before anything is saved.
 *
 * It is four tabs rather than one column of twelve sections. The column was
 * long enough that the controls at the bottom — who runs each club, the squad
 * rules, deleting the season — were found by scrolling past everything else,
 * and half of them are only relevant while a season is being set up. The tab is
 * in the address (`?tab=clubs`), so a link to this screen opens where it was
 * sent and the browser's back button steps through the tabs.
 */
export default function TournamentSettingsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

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
  //
  // `enterable` is the API's answer to "may this organiser put this club in a
  // competition", worked out with the same rule the write is refused by — a
  // club on their list and still in the pool, or one that has played for them
  // before. Asked rather than guessed, because the browser cannot see the pool.
  // A club already in the season stays offered whatever the answer, or removing
  // it would be the only thing this screen could still do with it.
  const teams = getOrganizerTeams()
  const pickableTeams = tournament
    ? teams.filter(
        (team) =>
          team.organizerId === tournament.organizerId ||
          team.enterable === true ||
          tournament.teamIds.includes(team.id),
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
    qualifiersPerGroup: number
    secondDivisionPerGroup: number
    thirdDivisionPerGroup: number
    // Carried rather than edited: this is who is in which group, and a save
    // that dropped it would put every group table back to nothing.
    groups?: string[][]
  } | null>(null)
  const [isSavingFormat, setIsSavingFormat] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [deciding, setDeciding] = useState<string | null>(null)

  const [draftDetails, setDraftDetails] = useState<Details | null>(null)
  const [isSavingDetails, setIsSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const [draftDiscipline, setDraftDiscipline] = useState<DisciplineRules | null>(null)
  const [isSavingDiscipline, setIsSavingDiscipline] = useState(false)
  const [disciplineError, setDisciplineError] = useState<string | null>(null)

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

  // Anything typed and not yet written. Worked out here, above the early return
  // below, because the warning that leaving would lose it is an effect and a
  // hook cannot be written under a return.
  const unsavedDetails =
    tournament && draftDetails ? changedDetails(detailsOf(tournament), draftDetails) : []
  const unsaved =
    unsavedDetails.length > 0 ||
    Boolean(plan && (plan.added.length > 0 || plan.removed.length > 0)) ||
    draftFormatId !== null ||
    draftQualifiers !== null ||
    draftGroups !== null

  useEffect(() => {
    if (!unsaved) return
    // The browser decides the wording; all a page may do is ask to be asked.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

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

  const requestedTab = searchParams.get('tab')
  const tab: TabId = isTab(requestedTab) ? requestedTab : 'general'
  const openTab = (next: TabId) => {
    // Replaced rather than pushed: stepping back through every tab somebody
    // clicked on the way to the one they wanted is not a history anybody wants.
    const params = new URLSearchParams(searchParams)
    if (next === 'general') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  const savedDetails = detailsOf(tournament)
  const details = draftDetails ?? savedDetails
  const editDetails = (patch: Partial<Details>) => {
    setDetailsError(null)
    setDraftDetails({ ...details, ...patch })
  }

  // Both names are required: the season's own is its public address, and the
  // competition's is what every season of it is listed under.
  const detailsProblem =
    details.name.trim() === ''
      ? 'A tournament needs a name.'
      : details.seriesName.trim() === ''
        ? 'A competition needs a name — by default it is the tournament’s own.'
        : null

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
  const storedGroups = tournament.format?.groupsWithDivisionsConfig
  const storedTiers = playoffTiers(storedGroups)
  const groupsConfig = draftGroups ?? {
    numberOfGroups: storedGroups?.numberOfGroups ?? 4,
    teamsPerGroup: storedGroups?.teamsPerGroup ?? 4,
    groupRounds: storedGroups?.groupRounds ?? 1,
    // Read back through `playoffTiers` rather than off the record, so a season
    // from before these fields existed opens showing the two and two it is
    // actually being drawn as.
    qualifiersPerGroup: storedTiers[0]?.places ?? 2,
    secondDivisionPerGroup: storedTiers[1]?.places ?? 0,
    thirdDivisionPerGroup: storedTiers[2]?.places ?? 0,
    groups: storedGroups?.groups,
  }
  // What the brackets would be called if this draft were saved — the labels on
  // the fields below name the bracket each one feeds.
  const draftTiers = playoffTiers(groupsConfig)

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
    // The table's rules are the season's and have nothing to do with which
    // scheme it is played by. The whole `format` object is replaced on save, so
    // a change of scheme that did not carry these would silently put the season
    // back on the defaults of September 2026 — three points, every playoff
    // match counted, no head-to-head.
    scoring: tournament.format?.scoring,
    tiebreakers: tournament.format?.tiebreakers,
    // And what a card costs, for exactly the same reason: it is a rule of the
    // season and not of the scheme, and this object replaces `format` whole.
    discipline: tournament.format?.discipline,
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

  /**
   * Write the draft.
   *
   * Straight through `tournamentService` rather than the store's
   * `updateTournament`, which logs a failure to the console and resolves as
   * though it had worked — the whole point of a save button is that it says
   * whether the save happened. `loadTournaments` afterwards puts the store back
   * in step with what the API actually stored, and the draft is only dropped
   * once that has succeeded.
   *
   * A field the organiser emptied is sent as `null`, not omitted: `undefined`
   * does not survive `JSON.stringify`, so a key left out of the body means
   * "unchanged" and clearing the champion or the season's name used to do
   * nothing at all while the screen showed it gone.
   */
  const saveDetails = async () => {
    if (!draftDetails || detailsProblem || unsavedDetails.length === 0) return

    const updates: Partial<Tournament> = {}
    if (unsavedDetails.includes('name')) updates.name = details.name.trim()
    if (unsavedDetails.includes('seasonLabel'))
      updates.seasonLabel = details.seasonLabel.trim() || null
    if (unsavedDetails.includes('championTeamId'))
      updates.championTeamId = details.championTeamId || null
    if (unsavedDetails.includes('themeColor')) updates.themeColor = details.themeColor
    // Folded into this record's own write rather than looped over below, so the
    // season being edited is not PATCHed twice in a row for one save.
    if (unsavedDetails.includes('seriesName')) updates.seriesName = details.seriesName.trim()
    if (unsavedDetails.includes('venueName') || unsavedDetails.includes('venueLink')) {
      // The whole object is replaced, so an emptied field disappears from the
      // record rather than needing a null of its own.
      updates.location = {
        ...tournament.location,
        name: details.venueName.trim() || undefined,
        link: details.venueLink.trim() || undefined,
      }
    }
    if (unsavedDetails.includes('facebook') || unsavedDetails.includes('instagram')) {
      updates.socialMedia = {
        ...tournament.socialMedia,
        facebook: details.facebook.trim() || undefined,
        instagram: details.instagram.trim() || undefined,
      }
    }

    setIsSavingDetails(true)
    setDetailsError(null)
    try {
      if (Object.keys(updates).length > 0) await tournamentService.update(tournament.id, updates)
      // Every season of a competition carries its name, so renaming it means
      // renaming them all — there are only ever a handful.
      if (unsavedDetails.includes('seriesName')) {
        const renamed = details.seriesName.trim()
        for (const season of siblings) {
          if (season.id === tournament.id) continue
          await tournamentService.update(season.id, { seriesName: renamed })
        }
      }
      await loadTournaments()
      setDraftDetails(null)
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Those changes could not be saved.')
    } finally {
      setIsSavingDetails(false)
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
      // The plan's own notes, rather than a sentence that assumes the whole
      // fixture list is going: changing only the playoff cut keeps the groups.
      const typed = prompt(
        `${formatPlan.notes.join('\n')}\n\n` +
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

  // What a card costs. Its own draft and its own save, because it is written by
  // a route of its own rather than through the tournament PATCH — `format` also
  // holds the scheme and the hand-built playoff rounds, and sending it back
  // whole to change a suspension length would undo whatever had landed in it
  // since this page was loaded.
  const storedDiscipline = disciplineRules(tournament)
  const discipline = draftDiscipline ?? storedDiscipline
  const disciplineChanged = (Object.keys(storedDiscipline) as Array<keyof DisciplineRules>).some(
    (key) => discipline[key] !== storedDiscipline[key],
  )

  const saveDiscipline = async () => {
    if (!disciplineChanged) return
    setIsSavingDiscipline(true)
    setDisciplineError(null)
    try {
      await tournamentService.setDiscipline(tournament.id, discipline)
      // The store holds the season this page reads, and the rules are not part
      // of what `updateTournament` would have refreshed.
      await loadTournaments()
      setDraftDiscipline(null)
    } catch (caught) {
      setDisciplineError(
        caught instanceof Error && caught.message ? caught.message : 'That could not be saved.',
      )
    } finally {
      setIsSavingDiscipline(false)
    }
  }

  const field =
    'mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none'

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-6 w-full">
      <div className="w-full max-w-3xl">
        <Link
          to={adminSeasonUrl(tournament, organizer)}
          onClick={(event) => {
            // The sticky bar below is the only thing saying there is unsaved
            // work, and it is at the other end of the page from this link.
            if (unsaved && !confirm('Leave without saving your changes?')) event.preventDefault()
          }}
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

      {/* ---------- Tabs ---------- */}
      <nav className="w-full max-w-3xl" aria-label="Settings sections">
        <div className="glass rounded-xl p-1 flex gap-1 overflow-x-auto">
          {TABS.map((entry) => {
            const active = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => openTab(entry.id)}
                aria-current={active ? 'page' : undefined}
                title={
                  entry.id === 'format' && canDrawBracket
                    ? 'The playoff bracket can be drawn'
                    : undefined
                }
                className={`flex-1 whitespace-nowrap px-4 py-2 rounded-lg text-sm transition-colors inline-flex items-center justify-center gap-2 ${
                  active ? 'bg-white/15 font-medium' : 'opacity-70 hover:opacity-100 hover:bg-white/5'
                }`}
              >
                {entry.label}
                {/* Two marks, both of them something waiting on the organiser:
                    clubs that have asked to join, and a bracket the league is
                    now finished enough to draw. Neither was findable before
                    without scrolling the whole page. */}
                {entry.id === 'clubs' && pendingEntries.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200">
                    {pendingEntries.length}
                  </span>
                )}
                {entry.id === 'format' && canDrawBracket && (
                  <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-amber-300" />
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* ================= General ================= */}

      {tab === 'general' && (
        <>
          {/* ---------- Identity ---------- */}
          <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-5">
            <h2 className="font-semibold">Name and logo</h2>

            <label className="block">
              <span className="text-sm opacity-70">Tournament name</span>
              <input
                type="text"
                value={details.name}
                onChange={(event) => editDetails({ name: event.target.value })}
                className={field}
              />
              <span className="text-xs opacity-50">
                The public address of the tournament follows its name, so old links stop working
                after a rename.
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
              <span className="text-xs opacity-50">
                A logo is uploaded as soon as you choose it — it is a file, not a field.
              </span>
            </div>

            <HeaderColour
              tournament={tournament}
              value={details.themeColor}
              onChange={(themeColor) => editDetails({ themeColor })}
            />
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
            <p className="text-xs opacity-50">This one takes effect as you switch it.</p>
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
              competition. Seasons share a page and a switcher, so the year no longer has to be
              typed into the name.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="opacity-70">Competition</span>
                <input
                  type="text"
                  value={details.seriesName}
                  onChange={(event) => editDetails({ seriesName: event.target.value })}
                  placeholder="Homebush Futsal Premier League"
                  className={field}
                />
                {siblings.length > 1 && (
                  <span className="text-xs opacity-50">
                    Renaming it renames all {siblings.length} seasons.
                  </span>
                )}
              </label>
              <label className="text-sm">
                <span className="opacity-70">This season</span>
                <input
                  type="text"
                  value={details.seasonLabel}
                  onChange={(event) => editDetails({ seasonLabel: event.target.value })}
                  placeholder={seasonLabel(tournament)}
                  className={field}
                />
              </label>
            </div>

            {siblings.length > 1 && (
              <p className="text-sm opacity-70">
                {siblings.length} seasons: {siblings.map((season) => seasonLabel(season)).join(', ')}
                .
              </p>
            )}

            {/* Champion: worked out from the results, overridable when the pitch
                did not have the last word. */}
            <div>
              <span className="text-sm opacity-70">Champion</span>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {championTeam && <Trophy size={30} />}
                <select
                  value={details.championTeamId}
                  onChange={(event) => editDetails({ championTeamId: event.target.value })}
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

            {/* Joining up a season that was created as its own tournament — which
                is how anyone would have done it before this existed. A move, not
                a field, so it happens when it is chosen. */}
            {otherCompetitions.length > 0 && (
              <label className="block text-sm">
                <span className="opacity-70">Move this into another competition</span>
                <select
                  value=""
                  disabled={isLinking}
                  onChange={async (event) => {
                    const target = otherCompetitions.find(
                      (entry) => entry.key === event.target.value,
                    )
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
                  className={field}
                >
                  <option value="">Keep it on its own</option>
                  {otherCompetitions.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.name} ({entry.seasons.length}{' '}
                      {entry.seasons.length === 1 ? 'season' : 'seasons'})
                    </option>
                  ))}
                </select>
                <span className="text-xs opacity-50">
                  This one moves the season as soon as you choose it.
                </span>
              </label>
            )}
          </section>

          {/* ---------- Where ---------- */}
          <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
            <h2 className="font-semibold">Venue and links</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="opacity-70">Venue name</span>
                <input
                  type="text"
                  value={details.venueName}
                  onChange={(event) => editDetails({ venueName: event.target.value })}
                  placeholder="Homebush Futsal Centre"
                  className={field}
                />
              </label>
              <label className="text-sm">
                <span className="opacity-70">Map link</span>
                <input
                  type="url"
                  value={details.venueLink}
                  onChange={(event) => editDetails({ venueLink: event.target.value })}
                  placeholder="https://maps.app.goo.gl/..."
                  className={field}
                />
              </label>
              <label className="text-sm">
                <span className="opacity-70">Facebook</span>
                <input
                  type="url"
                  value={details.facebook}
                  onChange={(event) => editDetails({ facebook: event.target.value })}
                  placeholder="https://facebook.com/..."
                  className={field}
                />
              </label>
              <label className="text-sm">
                <span className="opacity-70">Instagram</span>
                <input
                  type="url"
                  value={details.instagram}
                  onChange={(event) => editDetails({ instagram: event.target.value })}
                  placeholder="https://instagram.com/..."
                  className={field}
                />
              </label>
            </div>
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
        </>
      )}

      {/* ================= Format ================= */}

      {tab === 'format' && (
        <>
          <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-semibold">Cards and suspensions</h2>
              <span className="text-xs opacity-60">This competition only</span>
            </div>

            <DisciplineRulesEditor rules={discipline} onChange={setDraftDiscipline} />

            {disciplineError && (
              <p className="text-sm text-red-400" role="alert">
                {disciplineError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveDiscipline}
                disabled={!disciplineChanged || isSavingDiscipline}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingDiscipline ? 'Saving...' : 'Save card rules'}
              </button>
              {disciplineChanged && (
                <button
                  type="button"
                  onClick={() => setDraftDiscipline(null)}
                  className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              )}
            </div>

            <p className="text-xs opacity-60">
              Changing these re-reads every card already entered in this competition, so a
              suspension can appear or disappear on matches that have already been played.
            </p>
          </section>

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
              groups={groupsConfig}
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
                    { key: 'numberOfGroups', label: 'Groups', min: 2, max: 8 },
                    { key: 'teamsPerGroup', label: 'Teams per group', min: 2, max: 8 },
                    { key: 'groupRounds', label: 'Legs in the group', min: 1, max: 2 },
                    {
                      key: 'qualifiersPerGroup',
                      // Named for the bracket it fills, which is only called the
                      // gold playoffs once there is a second one to rank it against.
                      label: `Per group, to the ${(draftTiers[0]?.name ?? 'Playoffs').toLowerCase()}`,
                      min: 1,
                      // A cut cannot reach past the last place in a group.
                      max: groupsConfig.teamsPerGroup,
                    },
                    {
                      key: 'secondDivisionPerGroup',
                      label: 'Then to the silver playoffs',
                      // Zero is how an organiser says there is no second bracket.
                      min: 0,
                      max: Math.max(0, groupsConfig.teamsPerGroup - groupsConfig.qualifiersPerGroup),
                    },
                    {
                      key: 'thirdDivisionPerGroup',
                      label: 'Then to the bronze playoffs',
                      min: 0,
                      max: Math.max(
                        0,
                        groupsConfig.teamsPerGroup -
                          groupsConfig.qualifiersPerGroup -
                          groupsConfig.secondDivisionPerGroup,
                      ),
                    },
                  ] as const
                ).map(({ key, label, min, max }) => (
                  <label key={key} className="text-sm">
                    <span className="opacity-70">{label}</span>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={groupsConfig[key]}
                      onChange={(event) => {
                        const value = Math.min(max, Math.max(min, Number(event.target.value) || min))
                        const next = { ...groupsConfig, [key]: value }
                        // Shrinking a group, or taking more of it into a bracket
                        // above, has to shrink what is left for the ones below.
                        next.qualifiersPerGroup = Math.min(
                          next.qualifiersPerGroup,
                          next.teamsPerGroup,
                        )
                        next.secondDivisionPerGroup = Math.min(
                          next.secondDivisionPerGroup,
                          Math.max(0, next.teamsPerGroup - next.qualifiersPerGroup),
                        )
                        next.thirdDivisionPerGroup = Math.min(
                          next.thirdDivisionPerGroup,
                          Math.max(
                            0,
                            next.teamsPerGroup -
                              next.qualifiersPerGroup -
                              next.secondDivisionPerGroup,
                          ),
                        )
                        setDraftGroups(next)
                      }}
                      className={field}
                    />
                  </label>
                ))}
                <p className="sm:col-span-3 text-xs opacity-60">
                  {draftTiers.length === 1
                    ? 'One bracket, so the clubs through it are simply qualified.'
                    : `${draftTiers.length} brackets: ${draftTiers.map((tier) => tier.name.toLowerCase()).join(', ')}. A bracket set to nobody ends the list.`}
                </p>
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
                {isSavingFormat
                  ? 'Saving...'
                  : formatPlan.kind === 'rebuild_playoffs'
                    ? 'Save playoff settings'
                    : 'Change format'}
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
                    The league is finished. The top {seeding.qualifiers} go into the bracket, seeded
                    by the final table — {seeding.matches.length} matches.
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
        </>
      )}

      {/* ================= Clubs ================= */}

      {tab === 'clubs' && (
        <>
          {/* ---------- Applications ---------- */}
          {pendingEntries.length > 0 && (
            <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4 border border-amber-400/25">
              <h2 className="font-semibold">Clubs asking to join ({pendingEntries.length})</h2>
              <p className="text-sm opacity-70">
                Accepting adds the club to the tournament. It does not touch the fixture list — do
                that below, where you can see what it would cost first.
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

          {/* ---------- Teams ---------- */}
          <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-semibold">Teams ({selectedTeamIds.length})</h2>
              {editMode === 'regenerate' && (
                <span className="text-xs opacity-60">
                  Nothing played yet — the draw can be redone
                </span>
              )}
            </div>

            {editMode === 'locked' ? (
              <p className="text-sm opacity-70">
                Results have already been entered and this format's draw is fixed once it starts.
                Add or remove teams by creating a new tournament — the fixtures here would no longer
                make sense.
              </p>
            ) : (
              <>
                <TeamPicker
                  teams={pickableTeams}
                  selectedIds={selectedTeamIds}
                  onChange={setDraftTeamIds}
                />

                {teamsChanged && plan && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm space-y-1">
                    <div className="font-medium">What this will do</div>
                    {plan.added.length > 0 && (
                      <p className="opacity-80">Adding {plan.added.length} team(s).</p>
                    )}
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
        </>
      )}

      {/* ================= Squads ================= */}

      {tab === 'squads' && (
        <SquadsSection
          tournament={tournament}
          teams={teams.filter((team) => tournament.teamIds.includes(team.id))}
          onLock={(locked) => updateTournament(tournament.id, { squadsLocked: locked })}
          onReload={loadTournaments}
        />
      )}

      {/* ---------- The draft, and what to do with it ----------
          Last in the document so that it sticks to the bottom of the viewport
          while the sections above it scroll, and shown on every tab: the fields
          it covers are all on General, and somebody who typed a name and then
          went looking at the format should not have to find their way back to
          discover it was never saved. */}
      {unsavedDetails.length > 0 && (
        <div className="sticky bottom-4 z-20 w-full max-w-3xl">
          <div className="glass rounded-xl border border-amber-400/30 bg-amber-400/[0.06] shadow-lg shadow-black/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm min-w-0">
              <div className="font-medium">
                {unsavedDetails.length} unsaved change{unsavedDetails.length === 1 ? '' : 's'}
              </div>
              <div className="opacity-70">
                {unsavedDetails.map((key) => DETAIL_LABELS[key]).join(', ')}
              </div>
              {detailsProblem && <div className="text-amber-200 mt-1">{detailsProblem}</div>}
              {detailsError && <div className="text-red-300 mt-1">{detailsError}</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setDraftDetails(null)
                  setDetailsError(null)
                }}
                disabled={isSavingDetails}
                className="px-4 py-2 rounded-lg glass hover:bg-white/10 disabled:opacity-40 transition-all"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={saveDetails}
                disabled={isSavingDetails || detailsProblem !== null}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingDetails ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
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
                          {manager.isHead && running.length > 1 ? 'Head: ' : ''}
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

                  {/* A club with a manager brings its own people in, through
                      its head manager; the API refuses a link from here. */}
                  {/* A guest club is another organiser's to hand over, and its
                      managers are not in this list at all. */}
                  {team.visiting ? null : loaded && running.length === 0 ? (
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
                      Invite manager
                    </button>
                  ) : loaded ? (
                    <span className="shrink-0 text-xs opacity-60">Its head manager invites others</span>
                  ) : null}
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
              ? `A club plays only the players entered here, and a player signed later does not join until somebody enters them.${
                  squadLimitOf(tournament) !== null
                    ? ' Turning this off takes the squad limit off with it — a cap on entries holds for nobody once a club with no entry plays its whole squad.'
                    : ''
                }`
              : 'Off, a club that has entered nobody in particular plays its whole squad, and anyone it signs joins automatically. Turning this on enters every club as it stands today, so nothing already arranged is lost.'}
          </span>
        </span>
      </label>

      <SquadLimit tournament={tournament} onReload={onReload} />

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

/**
 * How many players one club may register here.
 *
 * Two controls would be two ways of saying the same thing, so this one carries
 * the rule with it: switching it on turns the entries into a registration list,
 * because a limit on entries means nothing while a club with no entry fields
 * everybody it has. Switching the registration list off takes the limit away
 * again, which is why that checkbox says so.
 *
 * The number is saved deliberately rather than as it is typed: a field that
 * writes on every keystroke sends 1, then 18, and a competition briefly capped
 * at one player is a competition that refuses every entry in it.
 */
function SquadLimit({
  tournament,
  onReload,
}: {
  tournament: Tournament
  onReload: () => Promise<void>
}) {
  const limit = squadLimitOf(tournament)
  const [draft, setDraft] = useState(String(limit ?? 18))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    setDraft(String(limit ?? 18))
  }, [limit])

  const typed = Number(draft)
  const valid = draft.trim() !== '' && Number.isInteger(typed) && typed >= 1 && typed <= 99

  const save = async (next: number | null) => {
    setSaving(true)
    setFailed(null)
    try {
      await tournamentService.setSquadLimit(tournament.id, next)
      await onReload()
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That limit could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={limit !== null}
          disabled={saving}
          onChange={(event) => void save(event.target.checked ? (valid ? typed : 18) : null)}
          className="mt-1"
        />
        <span>
          <span className="block">Maximum players per club</span>
          <span className="block text-sm opacity-70">
            {limit === null
              ? 'A cap on how many players each club may register here. Setting one also turns the registration list on, because until entries are a list there is nothing to count.'
              : `Each club may register ${limit} players. A club that was already over it keeps what it registered and cannot save again until it comes down to ${limit} — including when you enter it yourself.`}
          </span>
        </span>
      </label>

      {limit !== null && (
        <div className="flex items-center gap-2 pl-7">
          <input
            type="number"
            min={1}
            max={99}
            value={draft}
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            className="w-20 px-3 py-1.5 rounded-lg bg-transparent border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          />
          <button
            type="button"
            onClick={() => void save(typed)}
            disabled={saving || !valid || typed === limit}
            className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 disabled:opacity-40 transition-colors text-sm"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <span className="text-sm opacity-60">players</span>
        </div>
      )}

      {failed && <p className="text-sm text-red-300 pl-7">{failed}</p>}
    </div>
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
  // The squad as the club has it today: an archived player is in no entry, so
  // there is no box to tick for them.
  const players = activeSquad(team)
  const entered = registeredPlayers(tournament, team)
  const submitted = hasSquadEntry(tournament, team.id)
  const strict = tournament.squadsStrict === true
  const limit = squadLimitOf(tournament)

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
          {/* A club that registered more than the limit now allows. It keeps
              what it registered — nothing here cuts somebody else's list — and
              the mark is how the organiser finds the clubs that have to come
              down before either of them can save this entry again. */}
          {limit !== null && entered.length > limit && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
              over the limit
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
              {limit !== null && (
                <p
                  className={`text-xs mb-3 ${
                    selected.length > limit ? 'text-red-300' : 'opacity-70'
                  }`}
                >
                  {selected.length > limit
                    ? `This competition registers at most ${limit} players per club. ${selected.length} are ticked, so ${selected.length - limit} have to come off before this can be saved.`
                    : `${selected.length} of ${limit} places used.`}
                </p>
              )}

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
                  disabled={saving || (limit !== null && selected.length > limit)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                {/* Not offered where the squad is bigger than the limit: it
                    would tick a selection the API refuses, and picking the
                    first eighteen on the club's behalf is a decision this
                    screen has no business making. */}
                {(limit === null || players.length <= limit) && (
                  <button
                    type="button"
                    onClick={() => setSelected(players.map((player) => player.id))}
                    className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                  >
                    Everyone
                  </button>
                )}
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
 *
 * The value is held by the page along with the rest of the fields rather than
 * here. React maps `onChange` on a colour input to the DOM `input` event, which
 * fires all the way through a drag across the picker, so this used to debounce
 * its own writes and send one a fraction of a second after the hand stopped —
 * the same "did that save?" question as every other field on the screen, with a
 * timer in place of an answer. Now the swatch follows the drag, nothing is
 * written, and the save bar says what is waiting.
 */
function HeaderColour({
  tournament,
  value,
  onChange,
}: {
  tournament: Tournament
  /** The override as the organiser has it now; null is "use the logo's". */
  value: string | null
  onChange: (next: string | null) => void
}) {
  const automatic = tournament.logoColor ?? null
  // What the header would look like if this draft were saved: the override
  // where there is one, and otherwise the colour the logo gave — never the
  // override stored on the record, which is the thing being cleared.
  const shown = competitionColor({ themeColor: value, logoColor: automatic })

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
          onChange={(event) => onChange(event.target.value)}
          className="w-16 h-10 rounded-lg bg-white/5 border border-white/20 cursor-pointer"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-sm opacity-70 hover:opacity-100 transition-opacity underline underline-offset-4"
          >
            {automatic ? 'Use the logo’s colour' : 'Clear'}
          </button>
        )}
      </div>
      <span className="text-xs opacity-50">
        {value
          ? 'Chosen by hand. Uploading a new logo will not change it.'
          : automatic
            ? 'Read from the logo. Pick a colour to override it.'
            : 'This logo was uploaded before colours were read from them. Upload it again, or pick a colour here.'}
      </span>
    </div>
  )
}
