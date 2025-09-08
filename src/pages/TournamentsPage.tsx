import { useState } from "react"
import { useAppStore } from "../store"
import { Link } from "react-router-dom"
import LogoUploader from "../components/LogoUploader"

export default function TournamentsPage() {
  const [tournamentName, setTournamentName] = useState("")
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [rounds, setRounds] = useState(1)
  const [mode, setMode] = useState<'league' | 'league_playoff' | 'swiss_elimination' | 'custom_playoff_homebush'>('league')
  const [qualifiers, setQualifiers] = useState(4)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string>("")
  
  const { 
    getCurrentOrganizer, 
    getOrganizerTeams, 
    getOrganizerTournaments, 
    createTournament,
    deleteTournament,
    uploadTournamentLogo
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()
  
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
        rounds,
        mode,
        playoffQualifiers: mode === 'league_playoff' ? qualifiers : undefined,
        customPlayoffConfig: mode === 'custom_playoff_homebush' ? {
          topSeeds: 4,
          playoffTeams: qualifiers,
          enableBye: true,
          reSeedRound5: true
        } : undefined
      }
      
      // Create tournament first
      await createTournament(tournamentName.trim(), selectedTeamIds, format)
      
      // Upload logo if provided
      if (logoFile) {
        const newTournament = tournaments.find(t => t.name === tournamentName.trim())
        if (newTournament) {
          await uploadTournamentLogo(newTournament.id, logoFile)
        }
      }
      
      setTournamentName("")
      setSelectedTeamIds([])
      setShowAdvanced(false)
      setRounds(1)
      setMode('league')
      setQualifiers(4)
      setLogoFile(null)
      setLogoPreview("")
    }
  }
  
  const handleTeamToggle = (teamId: string) => {
    setSelectedTeamIds(prev => 
      prev.includes(teamId) 
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    )
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
            <label className="block text-sm font-medium mb-2">Select Teams ({selectedTeamIds.length} selected)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 border border-white/20 rounded">
              {teams.map((team) => (
                <label key={team.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTeamIds.includes(team.id)}
                    onChange={() => handleTeamToggle(team.id)}
                    className="rounded"
                  />
                  <span className="text-sm">{team.name}</span>
                </label>
              ))}
            </div>
            {teams.length === 0 && (
              <p className="text-sm opacity-70 text-center py-4">No teams available. Create teams first!</p>
            )}
          </div>
          
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-4 py-2 rounded-md glass hover:bg-white/10 transition-all text-sm"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>
          </div>
          
          {showAdvanced && (
            <div className="space-y-4 p-4 glass rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Number of Rounds</label>
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
                
                <div>
                  <label className="block text-sm font-medium mb-2">Tournament Mode</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'league' | 'league_playoff' | 'swiss_elimination' | 'custom_playoff_homebush')}
                    className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                  >
                    <option value="league">League Only</option>
                    <option value="league_playoff">League + Playoffs</option>
                    <option value="swiss_elimination">Swiss + Elimination</option>
                    <option value="custom_playoff_homebush">Custom Playoff Homebush</option>
                  </select>
                </div>
              </div>
              
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

              {mode === 'custom_playoff_homebush' && (
                <div className="space-y-4 p-4 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                  <h3 className="text-lg font-semibold text-blue-400">Custom Playoff Homebush Configuration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Playoff Teams</label>
                      <select
                        value={qualifiers}
                        onChange={(e) => setQualifiers(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      >
                        <option value={8}>8 Teams</option>
                        <option value={9}>9 Teams (with BYE)</option>
                        <option value={10}>10 Teams</option>
                        <option value={12}>12 Teams</option>
                        <option value={16}>16 Teams</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Top Seeds</label>
                      <select
                        value={4}
                        disabled
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none opacity-50"
                      >
                        <option value={4}>4 Teams (Double-Chance)</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-sm text-blue-300">
                    <p>• <strong>Double-Chance Path:</strong> Top 4 seeds get second opportunity</p>
                    <p>• <strong>Elimination Ladder:</strong> Lower seeds fight through elimination bracket</p>
                    <p>• <strong>6 Rounds:</strong> Complete tournament progression to Grand Final</p>
                    <p>• <strong>Re-seeding:</strong> Teams re-seeded for Preliminary Finals</p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <button
            type="submit"
            disabled={!tournamentName.trim() || selectedTeamIds.length < 2}
            className="w-full px-4 py-2 rounded-md glass hover:bg-white/10 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Tournament
          </button>
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
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Link
                      to={`/tournaments/${tournament.id}`}
                      className="px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center"
                    >
                      🏆 View
                    </Link>
                    <Link
                      to={`/public/tournaments/${tournament.id}`}
                      target="_blank"
                      className="px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center text-sm"
                    >
                      🌐 Public
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

