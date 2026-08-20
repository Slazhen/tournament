import { useState } from "react"
import { useAppStore } from "../store"
import { Link } from "react-router-dom"
import { getAdminTournamentUrl, getPublicTournamentUrl } from "../utils/urls"
import LogoUploader from "../components/LogoUploader"
import { CompactVisibilityToggle } from "../components/VisibilityToggle"
import FormatPicker from "../components/FormatPicker"
import TeamPicker from "../components/TeamPicker"
import { findFormat, planSchedule } from "../utils/formats"

export default function TournamentsPage() {
  const [tournamentName, setTournamentName] = useState("")
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [formatId, setFormatId] = useState('league_single')
  const [rounds, setRounds] = useState(1)
  // The first matchday. Fixtures are dated on creation so a new season does not
  // arrive as twenty-odd empty date fields.
  const [startDate, setStartDate] = useState('')
  const [kickOff, setKickOff] = useState('19:00')
  const [intervalDays, setIntervalDays] = useState(7)
  const [qualifiers, setQualifiers] = useState(4)
  const [numberOfGroups, setNumberOfGroups] = useState(4)
  const [teamsPerGroup, setTeamsPerGroup] = useState(4)
  const [groupRounds, setGroupRounds] = useState(1)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>("")
  
  const { 
    getCurrentOrganizer, 
    getOrganizerTeams, 
    getOrganizerTournaments, 
    createTournament,
    updateTournament,
    deleteTournament,
    uploadTournamentLogo
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()

  const selectedFormat = findFormat(formatId)
  const mode = selectedFormat.mode
  const plan = planSchedule(selectedFormat, selectedTeamIds.length, qualifiers)
  
  // Redirect if no organizer is selected
  if (!currentOrganizer) {
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
    if (tournamentName.trim() && selectedTeamIds.length >= 2) {
      const format = {
        rounds: selectedFormat.mode === 'league_custom_playoff' ? rounds : selectedFormat.rounds,
        mode,
        playoffQualifiers: mode === 'league_playoff' ? qualifiers : undefined,
        customPlayoffConfig: mode === 'league_custom_playoff' ? {
          playoffTeams: qualifiers,
          enableBye: true,
          playoffRounds: [] // Will be configured later
        } : undefined,
        groupsWithDivisionsConfig: mode === 'groups_with_divisions' ? {
          numberOfGroups,
          teamsPerGroup,
          groupRounds
        } : undefined
      }
      
      // Create tournament first
      await createTournament(tournamentName.trim(), selectedTeamIds, format, {
        startDate,
        time: kickOff,
        intervalDays,
      })
      
      // Upload logo if provided
      if (logoFile) {
        const newTournament = tournaments.find(t => t.name === tournamentName.trim())
        if (newTournament) {
          await uploadTournamentLogo(newTournament.id, logoFile)
        }
      }
      
      setTournamentName("")
      setSelectedTeamIds([])
      setRounds(1)
      setFormatId('league_single')
      setStartDate("")
      setQualifiers(4)
      setLogoFile(null)
      setLogoPreview("")
    }
  }
  
  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Manage Tournaments</h1>
        <p className="opacity-80">Organizer: {currentOrganizer.name}</p>
      </div>
      
      {/* Create Tournament Form */}
      <section className="glass rounded-xl p-6 w-full max-w-2xl">
        <h2 className="text-lg font-semibold mb-4 text-center">Create New Tournament</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Tournament Name</label>
            <input
              type="text"
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
              placeholder="Enter tournament name"
              required
            />
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
              previousTournaments={tournaments}
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
                          <span className="text-yellow-400">
                            ⚠️ Not enough teams! Need {numberOfGroups * teamsPerGroup - selectedTeamIds.length} more.
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
            New tournaments start private. Publish one from the list below when the draw is ready.
          </p>
        </form>
      </section>
      
      {/* Tournaments List */}
      <section className="glass rounded-xl p-6 w-full max-w-4xl">
        <h2 className="text-lg font-semibold mb-4 text-center">Your Tournaments ({tournaments.length})</h2>
        
        {tournaments.length === 0 ? (
          <p className="text-center opacity-70">No tournaments yet. Create your first tournament above!</p>
        ) : (
          <div className="grid gap-4">
            {tournaments.map((tournament) => (
              <div key={tournament.id} className="glass rounded-lg p-4">
                <div className="flex items-center gap-4">
                  {/* Tournament Logo */}
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10 flex-shrink-0">
                    {tournament.logo ? (
                      <img
              loading="lazy"
              decoding="async" 
                        src={tournament.logo} 
                        alt={`${tournament.name} logo`} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="text-2xl opacity-50">🏆</div>
                    )}
                  </div>
                  
                  {/* Tournament Info */}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1">{tournament.name}</h3>
                    <div className="text-sm opacity-70 space-y-1">
                      <div>Teams: {tournament.teamIds.length}</div>
                      <div>Format: {
                        tournament.format?.mode === 'league_playoff' ? 'League + Playoffs' :
                        tournament.format?.mode === 'swiss_elimination' ? 'Swiss + Elimination' :
                        'League Only'
                      }</div>
                      {tournament.format?.mode === 'league_playoff' && (
                        <div>Playoff Qualifiers: {tournament.format.playoffQualifiers}</div>
                      )}
                      <div>Created: {new Date(tournament.createdAtISO).toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* Current visibility — click to switch it */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide opacity-50">Visibility</span>
                    <CompactVisibilityToggle
                      isPublic={tournament.visibility !== 'private'}
                      onToggle={async (isPublic) => {
                        try {
                          await updateTournament(tournament.id, { 
                            visibility: isPublic ? 'public' : 'private' 
                          })
                        } catch (error) {
                          console.error('Failed to update tournament visibility:', error)
                          alert('Failed to update tournament visibility. Please try again.')
                        }
                      }}
                    />
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Link
                      to={currentOrganizer ? getAdminTournamentUrl(tournament, currentOrganizer) : `/tournaments/${tournament.id}`}
                      className="px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center"
                    >
                      🏆 View
                    </Link>
                    <Link
                      to={currentOrganizer ? getPublicTournamentUrl(tournament, currentOrganizer) : `/public/tournaments/${tournament.id}`}
                      target="_blank"
                      className="px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center text-sm"
                    >
                      🌐 Open public page
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete the tournament "${tournament.name}"?\n\nThis will permanently remove:\n• All match results\n• Tournament standings\n• Playoff brackets\n• Tournament data\n\nThis action cannot be undone.`)) {
                          deleteTournament(tournament.id)
                          // Refresh the page to show updated list
                          window.location.reload()
                        }
                      }}
                      className="px-4 py-2 rounded glass hover:bg-red-500/20 hover:text-red-300 transition-all text-center text-sm text-red-400"
                      title="Delete tournament"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

