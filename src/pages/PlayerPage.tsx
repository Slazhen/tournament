import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useRef } from 'react'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'

export default function PlayerPage() {
  const { playerId } = useParams()
  const { getCurrentOrganizer, getOrganizerTeams, getOrganizerTournaments, updateTeam } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()
  
  // Find the player across all teams
  let player: any = null
  let currentTeam: any = null
  
  for (const team of teams) {
    const foundPlayer = team.players?.find(p => p.id === playerId)
    if (foundPlayer) {
      player = foundPlayer
      currentTeam = team
      break
    }
  }
  
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
  
  // Show player not found if it doesn't exist
  if (!player || !currentTeam) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Player Not Found</h1>
          <p className="opacity-80 mb-6">The player you're looking for doesn't exist or you don't have access to it.</p>
          <Link to="/teams" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Back to Teams
          </Link>
        </div>
      </div>
    )
  }

  const photoFileRef = useRef<HTMLInputElement>(null)

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        updatePlayer(player.id, { photo: e.target?.result as string })
      }
      reader.readAsDataURL(file)
    }
  }

  const updatePlayer = (playerId: string, updates: any) => {
    if (!currentTeam.players) return
    const updatedPlayers = currentTeam.players.map((p: any) => 
      p.id === playerId ? { ...p, ...updates } : p
    )
    updateTeam(currentTeam.id, { players: updatedPlayers })
  }

  // Find all tournaments this player has participated in
  const playerTournaments = tournaments.filter(t => 
    t.teamIds.includes(currentTeam.id)
  )

  // Calculate player statistics
  const playerStats = {
    totalGames: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0
  }

  playerTournaments.forEach(tournament => {
    tournament.matches.forEach(match => {
      if (match.homeTeamId === currentTeam.id || match.awayTeamId === currentTeam.id) {
        if (match.homeGoals != null && match.awayGoals != null) {
          playerStats.totalGames++
          const isHome = match.homeTeamId === currentTeam.id
          const teamGoals = isHome ? match.homeGoals : match.awayGoals
          const opponentGoals = isHome ? match.awayGoals : match.homeGoals
          
          playerStats.goalsFor += teamGoals
          playerStats.goalsAgainst += opponentGoals
          
          if (teamGoals && opponentGoals) {
            if (teamGoals > opponentGoals) playerStats.wins++
            else if (teamGoals < opponentGoals) playerStats.losses++
            else playerStats.draws++
          }
        }
      }
    })
  })

  const fullName = `${player.firstName} ${player.lastName}`

  return (
    <div className="grid gap-6 place-items-center">
      {/* Header */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <Link to={`/teams/${currentTeam.id}`} className="text-sm opacity-70 hover:opacity-100 flex items-center gap-2">
            ← Back to {currentTeam.name}
          </Link>
          
          {/* Public Link */}
          <div className="text-center">
            <label className="block text-sm font-medium mb-2">Public Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/public/players/${player.id}`}
                className="px-3 py-2 rounded-md bg-transparent border border-white/20 text-center min-w-[300px] text-sm"
              />
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/public/players/${player.id}`)}
                className="px-3 py-2 rounded-md glass hover:bg-white/10 transition-all text-sm"
                title="Copy to clipboard"
              >
                📋 Copy
              </button>
            </div>
          </div>
        </div>
        
        {/* Player Info Header */}
        <div className="flex items-center gap-6 mb-6">
          {/* Player Photo */}
          <div className="relative group">
            {player.photo ? (
              <img
                src={player.photo}
                alt={`${fullName} photo`}
                className="w-32 h-32 object-cover rounded-lg"
              />
            ) : (
              <div className="w-32 h-32 rounded-lg bg-white/10 flex items-center justify-center text-4xl opacity-50">
                👤
              </div>
            )}
            <input
              ref={photoFileRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <button
              onClick={() => photoFileRef.current?.click()}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center text-white text-sm transition-all"
              title="Change photo"
            >
              {player.photo ? 'Change' : 'Add'}
            </button>
          </div>
          
          {/* Player Details */}
          <div className="flex-1">
            <div className="mb-4">
              <input
                type="text"
                value={player.firstName}
                onChange={(e) => updatePlayer(player.id, { firstName: e.target.value })}
                className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-white/20 focus:border-white/40 focus:outline-none transition-all mr-2"
                placeholder="First Name"
              />
              <input
                type="text"
                value={player.lastName}
                onChange={(e) => updatePlayer(player.id, { lastName: e.target.value })}
                className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-white/20 focus:border-white/40 focus:outline-none transition-all"
                placeholder="Last Name"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="opacity-70">Number:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={player.number || ''}
                    onChange={(e) => updatePlayer(player.id, { number: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-16 px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none text-center"
                    placeholder="#"
                  />
                </div>
              </div>
              <div>
                <span className="opacity-70">Position:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={player.position || ''}
                    onChange={(e) => updatePlayer(player.id, { position: e.target.value })}
                    className="px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none text-center"
                    placeholder="Position"
                  />
                </div>
              </div>
              <div>
                <span className="opacity-70">Date of Birth:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={player.dateOfBirth ? player.dateOfBirth.split('T')[0] : ''}
                    onChange={(e) => updatePlayer(player.id, { dateOfBirth: e.target.value })}
                    className="px-2 py-1 rounded bg-transparent border border-white/20 text-xs focus:border-white/40 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <span className="opacity-70">Public:</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={player.isPublic}
                      onChange={(e) => updatePlayer(player.id, { isPublic: e.target.checked })}
                      className="w-4 h-4 rounded border border-white/20"
                    />
                    <span className="text-xs">{player.isPublic ? 'Visible' : 'Hidden'}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          {/* Current Team Info */}
          <div className="text-right">
            <div className="text-sm opacity-70 mb-2">Current Team</div>
            <div className="flex items-center gap-3">
              {currentTeam.logo ? (
                <img
                  src={currentTeam.logo}
                  alt={`${currentTeam.name} logo`}
                  className="w-16 h-16 object-cover rounded-lg"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center text-2xl opacity-50">
                  🏆
                </div>
              )}
              <div>
                <div className="font-semibold">{currentTeam.name}</div>
                <div className="text-xs opacity-70">
                  {currentTeam.colors?.length || 0} colors
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Social Media Links */}
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <FacebookIcon size={16} />
            <input
              type="url"
              placeholder="Facebook profile..."
              value={player.socialMedia?.facebook || ''}
              onChange={(e) => updatePlayer(player.id, { 
                socialMedia: { 
                  ...player.socialMedia, 
                  facebook: e.target.value || undefined 
                } 
              })}
              className="px-3 py-2 rounded bg-transparent border border-white/20 text-center min-w-[250px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <InstagramIcon size={16} />
            <input
              type="url"
              placeholder="Instagram profile..."
              value={player.socialMedia?.instagram || ''}
              onChange={(e) => updatePlayer(player.id, { 
                socialMedia: { 
                  ...player.socialMedia, 
                  instagram: e.target.value || undefined 
                } 
              })}
              className="px-3 py-2 rounded bg-transparent border border-white/20 text-center min-w-[250px]"
            />
          </div>
        </div>
      </section>


      {/* Player Statistics */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <h2 className="text-xl font-semibold mb-4 text-center">Player Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-blue-400">{playerStats.totalGames}</div>
            <div className="text-sm opacity-70">Games</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-green-400">{playerStats.wins}</div>
            <div className="text-sm opacity-70">Wins</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-yellow-400">{playerStats.draws}</div>
            <div className="text-sm opacity-70">Draws</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-red-400">{playerStats.losses}</div>
            <div className="text-sm opacity-70">Losses</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-purple-400">{playerStats.goalsFor}</div>
            <div className="text-sm opacity-70">Goals For</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-indigo-400">{playerStats.goalsAgainst}</div>
            <div className="text-sm opacity-70">Goals Against</div>
          </div>
        </div>
      </section>

      {/* Tournaments Section */}
      {playerTournaments.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-xl font-semibold mb-4 text-center">Tournaments</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left">Tournament</th>
                  <th className="py-3 px-4 text-center">Team</th>
                  <th className="py-3 px-4 text-center">Games</th>
                  <th className="py-3 px-4 text-center">Format</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {playerTournaments.map((tournament) => (
                  <tr key={tournament.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                          {tournament.logo ? (
                            <img 
                              src={tournament.logo} 
                              alt={`${tournament.name} logo`} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <div className="text-lg opacity-50">🏆</div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{tournament.name}</div>
                          <div className="text-xs opacity-70">
                            {(() => {
                              // Calculate team position in tournament
                              const teamMatches = tournament.matches.filter(m => 
                                m.homeTeamId === currentTeam.id || m.awayTeamId === currentTeam.id
                              )
                              const completedMatches = teamMatches.filter(m => 
                                m.homeGoals != null && m.awayGoals != null
                              )
                              if (completedMatches.length === 0) return 'No games played'
                              
                              // Calculate points
                              let points = 0
                              completedMatches.forEach(match => {
                                const isHome = match.homeTeamId === currentTeam.id
                                const teamGoals = isHome ? match.homeGoals : match.awayGoals
                                const opponentGoals = isHome ? match.awayGoals : match.homeGoals
                                if (teamGoals && opponentGoals) {
                                  if (teamGoals > opponentGoals) points += 3
                                  else if (teamGoals === opponentGoals) points += 1
                                }
                              })
                              
                              return `${points} pts`
                            })()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {currentTeam.logo && (
                          <img
                            src={currentTeam.logo}
                            alt={`${currentTeam.name} logo`}
                            className="w-6 h-6 object-cover rounded"
                          />
                        )}
                        <span className="font-semibold">{currentTeam.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold">
                        {tournament.matches.filter(m => 
                          m.homeTeamId === currentTeam.id || m.awayTeamId === currentTeam.id
                        ).length}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-sm">
                        {tournament.format?.mode === 'league_playoff' ? 'League + Playoffs' : 'League Only'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        to={`/public/tournaments/${tournament.id}`}
                        target="_blank"
                        className="px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center text-sm"
                      >
                        🌐 View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
