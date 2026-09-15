import { useState, useEffect } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { useAppStore } from "../store"
import LogoUploader from "../components/LogoUploader"
import SchemePicker from "../components/SchemePicker"
import SchemeSettings from "../components/SchemeSettings"
import TableRulesEditor from "../components/TableRulesEditor"
import TeamPicker from "../components/TeamPicker"
import { SCHEMES, defaultSchemeSettings, formatFor, planFor, schemeOf } from "../utils/formats"
import type { SchemeId, SchemeSettings as Settings } from "../utils/formats"
import { adminSeasonUrl, seriesName, nextSeasonLabel, seriesKey } from "../utils/seasons"
import {
  IconArrowLeft,
} from '../components/icons'

/**
 * Creating a tournament, on a screen of its own.
 *
 * It used to sit above the list of existing tournaments, so the first thing an
 * organiser saw when they came to check last night's results was a long empty
 * form. Setting up a season is a deliberate act — it deserves its own page, and
 * the list deserves to be a list.
 *
 * It asks in two steps, and the order is the point. Which scheme it is comes
 * first, on its own, because it decides the entire fixture list; everything
 * else is a question about the scheme already chosen. Before this the two were
 * one flat list of eight cards — legs and finals promoted to schemes of their
 * own — and the settings for whichever card was picked sat three sections
 * further down, under the logo, the clubs and the schedule.
 */
export default function CreateTournamentPage() {
  const navigate = useNavigate()

  const [searchParams] = useSearchParams()
  const previousSeasonId = searchParams.get('season')

  const [tournamentName, setTournamentName] = useState("")
  const [seasonLabelDraft, setSeasonLabelDraft] = useState("")
  const [prefilled, setPrefilled] = useState(false)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [scheme, setScheme] = useState<SchemeId>('league')
  const [settings, setSettings] = useState<Settings>(defaultSchemeSettings)
  const [startDate, setStartDate] = useState('')
  const [kickOff, setKickOff] = useState('19:00')
  const [intervalDays, setIntervalDays] = useState(7)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>("")
  const [isCreating, setIsCreating] = useState(false)

  const {
    getCurrentOrganizer,
    getOrganizerById,
    getOrganizerTeams,
    getOrganizerTournaments,
    createTournament,
    uploadTournamentLogo,
    organizers,
    superAdmin,
    currentOrganizerId,
  } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const tournaments = getOrganizerTournaments()

  /**
   * Whose competition this is.
   *
   * An organiser can only be creating their own. The super admin administers
   * every organizer and none of them, so they choose — and the clubs on offer
   * follow that choice, because a competition is made of one organizer's clubs.
   */
  const [chosenOrganizerId, setChosenOrganizerId] = useState("")
  const ownerId = currentOrganizerId ?? chosenOrganizerId
  const owner = getOrganizerById(ownerId)
  // The organiser's own clubs, plus every club the API says they may enter —
  // one taken off the pool, or one that has played for them before. The super
  // admin's copy of the list carries no such flag, so their picker is unchanged.
  const teams = getOrganizerTeams().filter(
    (team) => team.organizerId === ownerId || team.enterable === true,
  )

  const previousSeason = previousSeasonId
    ? tournaments.find((candidate) => candidate.id === previousSeasonId)
    : undefined

  /**
   * A new season starts from the one before it.
   *
   * Everything is still editable — the scheme above all, because a competition
   * is allowed to change how it is played from one year to the next — but
   * nobody should have to re-pick nine clubs and re-enter a venue to run the
   * same league again.
   *
   * The table's rules are the exception: they are deliberately not carried
   * over. A season created before they existed carries none, and copying that
   * absence forward would quietly hand a brand new competition the defaults of
   * September 2026 rather than the ones this screen shows.
   */
  useEffect(() => {
    if (!previousSeason || prefilled) return

    const { scheme: previousScheme, finals } = schemeOf(previousSeason.format)
    setTournamentName(seriesName(previousSeason))
    setSeasonLabelDraft(nextSeasonLabel(previousSeason))
    setSelectedTeamIds(previousSeason.teamIds || [])
    setScheme(previousScheme)

    const groups = previousSeason.format?.groupsWithDivisionsConfig
    setSettings((current) => ({
      ...current,
      finals,
      legs: previousSeason.format?.rounds || 1,
      qualifiers:
        previousSeason.format?.playoffQualifiers ??
        previousSeason.format?.customPlayoffConfig?.playoffTeams ??
        current.qualifiers,
      groups: groups
        ? {
            numberOfGroups: groups.numberOfGroups,
            teamsPerGroup: groups.teamsPerGroup,
            groupRounds: groups.groupRounds,
            qualifiersPerGroup: groups.qualifiersPerGroup ?? 2,
            secondDivisionPerGroup: groups.secondDivisionPerGroup ?? 2,
            thirdDivisionPerGroup: groups.thirdDivisionPerGroup ?? 0,
          }
        : current.groups,
    }))

    if (previousSeason.logo) setLogoPreview(previousSeason.logo)
    // A new season belongs to whoever ran the last one.
    setChosenOrganizerId(previousSeason.organizerId)
    setPrefilled(true)
  }, [previousSeason, prefilled])

  const chosenScheme = SCHEMES.find((option) => option.id === scheme) ?? SCHEMES[0]
  const plan = planFor(scheme, settings, selectedTeamIds.length)

  if (!currentOrganizer && !superAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">No Organizer Selected</h1>
          <p className="opacity-80 mb-6">Please select an organizer first</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tournamentName.trim() || selectedTeamIds.length < 2 || isCreating || !ownerId) return

    setIsCreating(true)
    try {
      const created = await createTournament(
        tournamentName.trim(),
        selectedTeamIds,
        formatFor(scheme, settings, selectedTeamIds.length),
        { startDate, time: kickOff, intervalDays },
        {
          seriesName: tournamentName.trim(),
          seasonLabel: seasonLabelDraft.trim() || undefined,
          // Only the super admin's choice reaches this; an organiser's own
          // scope wins over it in the store.
          organizerId: ownerId,
          // A new season joins the competition of the one it was started from.
          ...(previousSeason
            ? {
                seriesId: seriesKey(previousSeason),
                logo: previousSeason.logo,
                location: previousSeason.location,
                socialMedia: previousSeason.socialMedia,
              }
            : {}),
        },
      )

      if (created && logoFile) {
        await uploadTournamentLogo(created.id, logoFile)
      }

      // Take the organiser straight to what they just made, instead of leaving
      // them on an empty form wondering whether it worked.
      if (created) {
        navigate(adminSeasonUrl(created, owner))
      } else {
        navigate('/tournaments')
      }
    } finally {
      setIsCreating(false)
    }
  }

  const tooFewForScheme = selectedTeamIds.length > 0 && selectedTeamIds.length < chosenScheme.minTeams

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-6">
      <div className="w-full max-w-2xl">
        <Link to="/tournaments" className="inline-flex items-center justify-center gap-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity">
          <IconArrowLeft size={15} /> Back to tournaments
        </Link>
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">
          {previousSeason ? 'New season' : 'New tournament'}
        </h1>
        <p className="opacity-80">
          {previousSeason
            ? `Starting from ${seriesName(previousSeason)} ${previousSeason.seasonLabel || ''}`.trim()
            : owner
              ? `Organizer: ${owner.name}`
              : 'Choose the organizer running it'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-4">
        {/* Only the super admin has a choice to make here. */}
        {!currentOrganizer && (
          <section className="glass rounded-xl p-6 space-y-2">
            <label className="block text-sm font-medium">Organizer</label>
            <select
              value={chosenOrganizerId}
              onChange={(e) => {
                setChosenOrganizerId(e.target.value)
                // The clubs on offer belong to the organizer; a selection made
                // under the previous one is not theirs to enter.
                setSelectedTeamIds([])
              }}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
              disabled={Boolean(previousSeason)}
            >
              <option value="">Choose an organizer…</option>
              {[...organizers]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((organizer) => (
                  <option key={organizer.id} value={organizer.id}>
                    {organizer.name}
                  </option>
                ))}
            </select>
          </section>
        )}

        <Step number={1} title="How is it played?">
          <SchemePicker value={scheme} onChange={setScheme} teamCount={selectedTeamIds.length} />
        </Step>

        <Step number={2} title={chosenScheme.title}>
          <SchemeSettings
            scheme={scheme}
            settings={settings}
            onChange={setSettings}
            teamCount={selectedTeamIds.length}
          />
        </Step>

        <Step number={3} title={`Clubs (${selectedTeamIds.length})`}>
          <TeamPicker
            teams={teams}
            selectedIds={selectedTeamIds}
            onChange={setSelectedTeamIds}
            previousTournaments={tournaments.filter((t) => t.organizerId === ownerId)}
          />
        </Step>

        <Step number={4} title="Name and logo">
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <label className="block text-sm">
              <span className="opacity-70">{previousSeason ? 'Competition' : 'Tournament name'}</span>
              <input
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder="Enter tournament name"
                required
              />
            </label>
            <label className="block text-sm">
              {/* The season's name, so the year never has to go into the
                  competition's own name again. */}
              <span className="opacity-70">Season</span>
              <input
                type="text"
                value={seasonLabelDraft}
                onChange={(e) => setSeasonLabelDraft(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder={String(new Date().getFullYear())}
              />
            </label>
          </div>
          <div className="mt-4">
            <LogoUploader
              onLogoUpload={async (file) => {
                setLogoFile(file)
                setLogoPreview(URL.createObjectURL(file))
              }}
              currentLogo={logoPreview}
              size={80}
            />
          </div>
        </Step>

        {/* When to play. Rounds are spaced evenly from the first matchday. */}
        <Step number={5} title="Schedule (optional)">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="opacity-70">First matchday</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
              />
            </label>
            <label className="text-sm">
              <span className="opacity-70">Kick-off</span>
              <input
                type="time"
                value={kickOff}
                onChange={(e) => setKickOff(e.target.value)}
                disabled={!startDate}
                className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none disabled:opacity-40"
              />
            </label>
            <label className="text-sm">
              <span className="opacity-70">Next round after</span>
              <select
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                disabled={!startDate}
                className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none disabled:opacity-40"
              >
                <option value={1}>1 day</option>
                <option value={7}>1 week</option>
                <option value={14}>2 weeks</option>
                <option value={0}>same day</option>
              </select>
            </label>
          </div>
          <p className="mt-1 text-xs opacity-60">
            {startDate
              ? 'Every match in a round gets the same kick-off. You can move any of them afterwards.'
              : 'Leave empty to schedule the matches yourself later.'}
          </p>
        </Step>

        <Step number={6} title="Points and the table">
          <TableRulesEditor
            scoring={settings.scoring}
            onScoringChange={(scoring) => setSettings({ ...settings, scoring })}
            tiebreakers={settings.tiebreakers}
            onTiebreakersChange={(tiebreakers) => setSettings({ ...settings, tiebreakers })}
          />
        </Step>

        {/* Creating generates every fixture at once and there is no undo, so
            say what is about to happen. */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <div className="font-medium mb-1">About to create</div>
          <p className="opacity-80">
            {selectedTeamIds.length < 2
              ? 'Pick at least two clubs.'
              : `${chosenScheme.title.toLowerCase()} with ${selectedTeamIds.length} clubs — ${plan.summary}.`}
            {startDate && plan.rounds
              ? ` First round on ${new Date(`${startDate}T${kickOff || '12:00'}`).toLocaleDateString()}` +
                (intervalDays > 0 ? `, then every ${intervalDays} days.` : '.')
              : ''}
          </p>
        </section>

        <button
          type="submit"
          disabled={!tournamentName.trim() || selectedTeamIds.length < 2 || tooFewForScheme}
          className="w-full px-4 py-2 rounded-md glass hover:bg-white/10 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create tournament
        </button>
        {/* Creation defaults to private, which was not visible anywhere before. */}
        <p className="text-xs opacity-60 text-center">
          New tournaments start private. Publish it from the tournaments list when the draw is ready.
        </p>
      </form>
    </div>
  )
}

/** One numbered section of the form, so the two steps read as steps. */
function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="glass rounded-xl p-6 space-y-4">
      <h2 className="font-semibold flex items-baseline gap-2">
        <span className="text-xs opacity-50">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}
