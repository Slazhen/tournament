import { useState, useEffect } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { useAppStore } from "../store"
import LogoUploader from "../components/LogoUploader"
import FormatPicker from "../components/FormatPicker"
import TeamPicker from "../components/TeamPicker"
import { findFormat, planSchedule, formatOptionFor } from "../utils/formats"
import { adminSeasonUrl, seriesName, nextSeasonLabel, seriesKey } from "../utils/seasons"
import {
  IconArrowLeft,
  IconWarning,
} from '../components/icons'

/**
 * Creating a tournament, on a screen of its own.
 *
 * It used to sit above the list of existing tournaments, so the first thing an
 * organiser saw when they came to check last night's results was a long empty
 * form. Setting up a season is a deliberate act — it deserves its own page, and
 * the list deserves to be a list.
 */
export default function CreateTournamentPage() {
  const navigate = useNavigate()

  const [searchParams] = useSearchParams()
  const previousSeasonId = searchParams.get('season')

  const [tournamentName, setTournamentName] = useState("")
  const [seasonLabelDraft, setSeasonLabelDraft] = useState("")
  const [prefilled, setPrefilled] = useState(false)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [formatId, setFormatId] = useState('league_single')
  const [rounds, setRounds] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [kickOff, setKickOff] = useState('19:00')
  const [intervalDays, setIntervalDays] = useState(7)
  const [qualifiers, setQualifiers] = useState(4)
  const [numberOfGroups, setNumberOfGroups] = useState(4)
  const [teamsPerGroup, setTeamsPerGroup] = useState(4)
  const [groupRounds, setGroupRounds] = useState(1)
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
  const teams = getOrganizerTeams().filter((team) => team.organizerId === ownerId)

  const previousSeason = previousSeasonId
    ? tournaments.find((candidate) => candidate.id === previousSeasonId)
    : undefined

  /**
   * A new season starts from the one before it.
   *
   * Everything is still editable — the format above all, because a competition
   * is allowed to change how it is played from one year to the next — but
   * nobody should have to re-pick nine clubs and re-enter a venue to run the
   * same league again.
   */
  useEffect(() => {
    if (!previousSeason || prefilled) return

    const option = formatOptionFor(previousSeason.format)
    setTournamentName(seriesName(previousSeason))
    setSeasonLabelDraft(nextSeasonLabel(previousSeason))
    setSelectedTeamIds(previousSeason.teamIds || [])
    setFormatId(option.id)
    setRounds(previousSeason.format?.rounds || 1)
    if (previousSeason.format?.playoffQualifiers) {
      setQualifiers(previousSeason.format.playoffQualifiers)
    }
    const groups = previousSeason.format?.groupsWithDivisionsConfig
    if (groups) {
      setNumberOfGroups(groups.numberOfGroups)
      setTeamsPerGroup(groups.teamsPerGroup)
      setGroupRounds(groups.groupRounds)
    }
    if (previousSeason.logo) setLogoPreview(previousSeason.logo)
    // A new season belongs to whoever ran the last one.
    setChosenOrganizerId(previousSeason.organizerId)
    setPrefilled(true)
  }, [previousSeason, prefilled])

  const selectedFormat = findFormat(formatId)
  const mode = selectedFormat.mode
  const plan = planSchedule(selectedFormat, selectedTeamIds.length, qualifiers)

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
      const format = {
        rounds: selectedFormat.mode === 'league_custom_playoff' ? rounds : selectedFormat.rounds,
        mode,
        playoffQualifiers: mode === 'league_playoff' ? qualifiers : undefined,
        customPlayoffConfig: mode === 'league_custom_playoff' ? {
          playoffTeams: selectedFormat.preset ? selectedTeamIds.length : qualifiers,
          enableBye: true,
          playoffRounds: [],
          // Marks the rounds as following a system, so they can be generated
          // from the table instead of typed in one by one.
          preset: selectedFormat.preset,
        } : undefined,
        groupsWithDivisionsConfig: mode === 'groups_with_divisions' ? {
          numberOfGroups,
          teamsPerGroup,
          groupRounds
        } : undefined
      }

      const created = await createTournament(
        tournamentName.trim(),
        selectedTeamIds,
        format,
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

      <section className="glass rounded-xl p-6 w-full max-w-2xl">
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Only the super admin has a choice to make here. */}
          {!currentOrganizer && (
            <div>
              <label className="block text-sm font-medium mb-2">Organizer</label>
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
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <div>
              <label className="block text-sm font-medium mb-2">
                {previousSeason ? 'Competition' : 'Tournament Name'}
              </label>
              <input
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder="Enter tournament name"
                required
              />
            </div>
            <div>
              {/* The season's name, so the year never has to go into the
                  competition's own name again. */}
              <label className="block text-sm font-medium mb-2">Season</label>
              <input
                type="text"
                value={seasonLabelDraft}
                onChange={(e) => setSeasonLabelDraft(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder={String(new Date().getFullYear())}
              />
            </div>
          </div>
          
          {/* The format decides the whole fixture list, so it is asked up front
              rather than hidden behind an "advanced options" button. */}
          <div>
            <label className="block text-sm font-medium mb-2">How is it played?</label>
            <FormatPicker
              value={formatId}
              onChange={setFormatId}
              teamCount={selectedTeamIds.length}
              qualifiers={qualifiers}
            />
          </div>

                 <div>
                   <label className="block text-sm font-medium mb-2">Tournament Logo (Optional)</label>
                   <LogoUploader 
                     onLogoUpload={async (file) => {
                       setLogoFile(file)
                       setLogoPreview(URL.createObjectURL(file))
                     }}
                     currentLogo={logoPreview}
                     size={80}
                   />
                 </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              Teams ({selectedTeamIds.length} selected)
            </label>
            <TeamPicker
              teams={teams}
              selectedIds={selectedTeamIds}
              onChange={setSelectedTeamIds}
              previousTournaments={tournaments.filter((t) => t.organizerId === ownerId)}
            />
          </div>

          {/* When to play. Rounds are spaced evenly from the first matchday. */}
          <div>
            <label className="block text-sm font-medium mb-2">Schedule (optional)</label>
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
          </div>

          {selectedFormat.hasSettings && (
            <div className="space-y-4 p-4 glass rounded-lg">
              <p className="text-sm opacity-70">Settings for {selectedFormat.title}</p>
              
              {mode === 'league_playoff' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Playoff Qualifiers</label>
                  <select
                    value={qualifiers}
                    onChange={(e) => setQualifiers(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                  >
                    <option value={2}>2 Teams</option>
                    <option value={4}>4 Teams</option>
                    <option value={8}>8 Teams</option>
                  </select>
                </div>
              )}

              {mode === 'league_custom_playoff' && (
                <div className="space-y-4 p-4 bg-green-500/10 border border-green-400/30 rounded-lg">
                  <h3 className="text-lg font-semibold text-green-400">League + Custom Playoff Configuration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Playoff Teams</label>
                      <select
                        value={qualifiers}
                        onChange={(e) => setQualifiers(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      >
                        <option value={4}>4 Teams</option>
                        <option value={6}>6 Teams</option>
                        <option value={8}>8 Teams</option>
                        <option value={10}>10 Teams</option>
                        <option value={12}>12 Teams</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">League Rounds</label>
                      <select
                        value={rounds}
                        onChange={(e) => setRounds(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      >
                        <option value={1}>1 Round</option>
                        <option value={2}>2 Rounds</option>
                        <option value={3}>3 Rounds</option>
                        <option value={4}>4 Rounds</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-sm text-green-300">
                    <p>• <strong>League Phase:</strong> All teams play each other (with BYE for odd numbers)</p>
                    <p>• <strong>Custom Playoff:</strong> Configure each playoff round as knockout or additional league</p>
                    <p>• <strong>Points System:</strong> Additional league games count toward table, knockout games don't</p>
                    <p>• <strong>Flexible:</strong> Mix knockout and league games as needed</p>
                  </div>
                </div>
              )}

              {mode === 'groups_with_divisions' && (
                <div className="space-y-4 p-4 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                  <h3 className="text-lg font-semibold text-blue-400">Groups + Divisions Configuration</h3>
                  <p className="text-sm opacity-80 mb-4">
                    Teams will be divided into groups. Top 2 teams from each group go to Division 1 playoffs. 
                    3rd and 4th place teams go to Division 2 playoffs.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Number of Groups</label>
                      <select
                        value={numberOfGroups}
                        onChange={(e) => {
                          const numGroups = Number(e.target.value)
                          setNumberOfGroups(numGroups)
                          // Auto-calculate teams per group if possible
                          if (selectedTeamIds.length > 0) {
                            const calculatedTeamsPerGroup = Math.floor(selectedTeamIds.length / numGroups)
                            if (calculatedTeamsPerGroup >= 4 && calculatedTeamsPerGroup <= 8) {
                              setTeamsPerGroup(calculatedTeamsPerGroup)
                            }
                          }
                        }}
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      >
                        <option value={2}>2 Groups</option>
                        <option value={3}>3 Groups</option>
                        <option value={4}>4 Groups</option>
                        <option value={5}>5 Groups</option>
                        <option value={6}>6 Groups</option>
                        <option value={8}>8 Groups</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Teams per Group</label>
                      <select
                        value={teamsPerGroup}
                        onChange={(e) => setTeamsPerGroup(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      >
                        <option value={3}>3 Teams</option>
                        <option value={4}>4 Teams</option>
                        <option value={5}>5 Teams</option>
                        <option value={6}>6 Teams</option>
                        <option value={7}>7 Teams</option>
                        <option value={8}>8 Teams</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Group Stage Rounds</label>
                      <select
                        value={groupRounds}
                        onChange={(e) => setGroupRounds(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      >
                        <option value={1}>1 Round</option>
                        <option value={2}>2 Rounds</option>
                      </select>
                    </div>
                  </div>
                  {selectedTeamIds.length > 0 && (
                    <div className="mt-4 p-3 bg-white/5 rounded-lg">
                      <p className="text-sm">
                        <strong>Total Teams:</strong> {selectedTeamIds.length}<br />
                        <strong>Total Needed:</strong> {numberOfGroups * teamsPerGroup}<br />
                        {selectedTeamIds.length < numberOfGroups * teamsPerGroup && (
                          <span className="inline-flex items-center justify-center gap-1.5 text-yellow-400">
                            <IconWarning size={14} /> Not enough teams! Need {numberOfGroups * teamsPerGroup - selectedTeamIds.length} more.
                          </span>
                        )}
                        {selectedTeamIds.length > numberOfGroups * teamsPerGroup && (
                          <span className="text-gray-400">
                            ℹ️ {selectedTeamIds.length - numberOfGroups * teamsPerGroup} team(s) will not participate.
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Creating generates every fixture at once and there is no undo, so
              say what is about to happen. */}
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
            <div className="font-medium mb-1">About to create</div>
            <p className="opacity-80">
              {selectedTeamIds.length < 2
                ? 'Pick at least two teams.'
                : `${selectedFormat.title.toLowerCase()} with ${selectedTeamIds.length} teams — ${plan.summary}.`}
              {startDate && plan.rounds
                ? ` First round on ${new Date(`${startDate}T${kickOff || '12:00'}`).toLocaleDateString()}` +
                  (intervalDays > 0 ? `, then every ${intervalDays} days.` : '.')
                : ''}
            </p>
          </div>

          <button
            type="submit"
            disabled={!tournamentName.trim() || selectedTeamIds.length < 2}
            className="w-full px-4 py-2 rounded-md glass hover:bg-white/10 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Tournament
          </button>
          {/* Creation defaults to private, which was not visible anywhere before. */}
          <p className="text-xs opacity-60 text-center">
            New tournaments start private. Publish it from the tournaments list when the draw is ready.
          </p>
        </form>
      </section>
    </div>
  )
}
