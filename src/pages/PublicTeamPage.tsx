import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import { useState } from 'react'

export default function PublicTeamPage() {
  const { teamId } = useParams()
  const { getAllTournaments, getAllTeams } = useAppStore()
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  
  const teams = getAllTeams()
  const tournaments = getAllTournaments()
  
  // Find the specific team by ID
  const team = teams.find(t => t.id === teamId)
  
  // Show team not found if it doesn't exist
  if (!team) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Team Not Found</h1>
          <p className="opacity-80 mb-6">The team you're looking for doesn't exist.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  // Find tournaments where this team participates
  const teamTournaments = tournaments.filter(t => 
    t.teamIds.includes(teamId!)
  )

  // Create dynamic gradient based on team colors
  const getTeamGradient = () => {
    if (team.colors && team.colors.length > 0) {
      if (team.colors.length === 1) {
        return `linear-gradient(135deg, ${team.colors[0]} 0%, ${team.colors[0]}CC 50%, ${team.colors[0]}99 100%)`
      } else {
        return `linear-gradient(135deg, ${team.colors[0]} 0%, ${team.colors[1]} 50%, ${team.colors[0]}CC 100%)`
      }
    }
    return 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 50%, #1E3A8A 100%)'
  }

  return (
    <div className="grid gap-6 place-items-center">
      {/* Dynamic Team Header */}
      <section className="relative w-full max-w-6xl rounded-xl overflow-hidden">
        {/* Background with team colors */}
        <div 
          className="absolute inset-0"
          style={{ 
            background: getTeamGradient(),
            filter: 'brightness(0.8)'
          }}
        />
        
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-black/20" />
        
        {/* Content */}
        <div className="relative p-8">
          <div className="flex items-center gap-8 mb-6">
            {/* Team Logo - Larger and more prominent */}
            <div className="w-32 h-32 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-2xl">
              {team.logo ? (
                <img
                  src={team.logo}
                  alt={`${team.name} logo`}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="text-4xl opacity-80">🏆</div>
              )}
            </div>
            
            {/* Team Details */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-3 text-white drop-shadow-lg">{team.name}</h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-white">
                <div>
                  <span className="opacity-80 text-sm">Players</span>
                  <div className="font-bold text-xl">{team.players?.length || 0}</div>
                </div>
                <div>
                  <span className="opacity-80 text-sm">Founded</span>
                  <div className="font-bold text-xl">{new Date(team.createdAtISO).getFullYear()}</div>
                </div>
                <div>
                  <span className="opacity-80 text-sm">Colors</span>
                  <div className="flex items-center gap-2 mt-1">
                    {team.colors && team.colors.length > 0 && team.colors.map((color, index) => (
                      <div 
                        key={index}
                        className="w-6 h-6 rounded-full border-2 border-white/30 shadow-lg"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                {team.establishedDate && (
                  <div>
                    <span className="opacity-80 text-sm">Established</span>
                    <div className="font-bold text-xl">{new Date(team.establishedDate).getFullYear()}</div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Team Photo - Larger and more prominent */}
            <div 
              className="w-[200px] h-[150px] rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity shadow-2xl" 
              onClick={() => team.photo && setShowPhotoModal(true)}
            >
              {team.photo ? (
                <img
                  src={team.photo}
                  alt={`${team.name} photo`}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <div className="text-white opacity-60">Team Photo</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Social Media Links - Only show if not empty */}
      {(team.socialMedia?.facebook || team.socialMedia?.instagram) && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="flex items-center justify-center gap-6 text-sm">
            {team.socialMedia?.facebook && (
              <a 
                href={team.socialMedia.facebook} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity px-4 py-2 glass rounded-lg"
              >
                <FacebookIcon size={16} />
                <span>Facebook</span>
              </a>
            )}
            {team.socialMedia?.instagram && (
              <a 
                href={team.socialMedia.instagram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity px-4 py-2 glass rounded-lg"
              >
                <InstagramIcon size={16} />
                <span>Instagram</span>
              </a>
            )}
          </div>
        </section>
      )}

      {/* Players Section - Only show if players exist */}
      {team.players && team.players.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-xl font-semibold mb-4 text-center">Players ({team.players.length})</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left">Player</th>
                  <th className="py-3 px-4 text-left">Position</th>
                  <th className="py-3 px-4 text-left">Number</th>
                  <th className="py-3 px-4 text-left">Joined</th>
                </tr>
              </thead>
              <tbody>
                {team.players.map((player) => (
                  <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                          {player.photo ? (
                            <img
                              src={player.photo}
                                                             alt={`${player.firstName} ${player.lastName} photo`}
                              className="w-full h-full object-cover rounded-full"
                            />
                          ) : (
                            <div className="text-sm opacity-50">👤</div>
                          )}
                        </div>
                        <div>
                          <Link
                            to={`/public/players/${player.id}`}
                            className="font-medium hover:opacity-80 transition-opacity"
                          >
                            {`${player.firstName} ${player.lastName}`}
                          </Link>
                          <div className="text-xs opacity-70">ID: {player.id.slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm">{player.position || '—'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm">{player.number || '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-sm opacity-70">
                      {new Date(player.createdAtISO).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}



      {/* All Games Section */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <h2 className="text-xl font-semibold mb-4 text-center">All Games</h2>
        
        {/* Team Performance Summary */}
        {(() => {
          let totalGames = 0
          let wins = 0
          let draws = 0
          let losses = 0
          let goalsFor = 0
          let goalsAgainst = 0
          
          teamTournaments.forEach(tournament => {
            const teamMatches = tournament.matches.filter(m => 
              m.homeTeamId === team.id || m.awayTeamId === team.id
            )
            
            teamMatches.forEach(match => {
              if (match.homeGoals != null && match.awayGoals != null) {
                totalGames++
                const isHome = match.homeTeamId === team.id
                const teamGoals = isHome ? match.homeGoals : match.awayGoals
                const opponentGoals = isHome ? match.awayGoals : match.homeGoals
                
                goalsFor += teamGoals
                goalsAgainst += opponentGoals
                
                if (teamGoals && opponentGoals) {
                  if (teamGoals > opponentGoals) wins++
                  else if (teamGoals < opponentGoals) losses++
                  else draws++
                }
              }
            })
          })
          
          if (totalGames > 0) {
            return (
              <div className="mb-6 p-4 glass rounded-lg">
                <h3 className="font-medium mb-3 text-center">Season Summary</h3>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center text-sm">
                  <div>
                    <div className="font-semibold">{totalGames}</div>
                    <div className="opacity-70">Games</div>
                  </div>
                  <div>
                    <div className="font-semibold text-green-400">{wins}</div>
                    <div className="opacity-70">Wins</div>
                  </div>
                  <div>
                    <div className="font-semibold text-yellow-400">{draws}</div>
                    <div className="opacity-70">Draws</div>
                  </div>
                  <div>
                    <div className="font-semibold text-red-400">{losses}</div>
                    <div className="opacity-70">Losses</div>
                  </div>
                  <div>
                    <div className="font-semibold">{goalsFor}</div>
                    <div className="opacity-70">GF</div>
                  </div>
                  <div>
                    <div className="font-semibold">{goalsAgainst}</div>
                    <div className="opacity-70">GA</div>
                  </div>
                </div>
              </div>
            )
          }
          return null
        })()}
        
        {teamTournaments.length === 0 ? (
          <p className="text-center opacity-70">This team is not participating in any tournaments yet.</p>
        ) : (
          <div className="grid gap-4">
            {teamTournaments.map((tournament) => {
              // Get all matches for this team in this tournament
              const teamMatches = tournament.matches.filter(m => 
                m.homeTeamId === team.id || m.awayTeamId === team.id
              )
              
              if (teamMatches.length === 0) return null
              
              return (
                <div key={tournament.id} className="glass rounded-lg p-4">
                  <h3 className="font-medium mb-3 text-center">{tournament.name}</h3>
                  <div className="grid gap-2">
                    {/* Games Table Header */}
                    <div className="grid grid-cols-4 gap-2 items-center p-2 glass rounded text-sm font-medium opacity-70">
                      <div className="col-span-2 text-center">Match</div>
                      <div className="text-center">Score</div>
                      <div className="text-center">Date</div>
                    </div>
                    {teamMatches.map((match) => {
                      const isHome = match.homeTeamId === team.id
                      const opponentId = isHome ? match.awayTeamId : match.homeTeamId
                      const opponent = teams.find(t => t.id === opponentId)
                      const opponentName = opponent?.name || 'Unknown Team'
                      
                      return (
                        <div key={match.id} className={`grid grid-cols-4 gap-2 items-center p-2 glass rounded text-sm ${
                          match.homeGoals != null && match.awayGoals != null 
                            ? (() => {
                                const isHome = match.homeTeamId === team.id
                                const teamGoals = isHome ? match.homeGoals : match.awayGoals
                                const opponentGoals = isHome ? match.awayGoals : match.homeGoals
                                if (teamGoals && opponentGoals) {
                                  if (teamGoals > opponentGoals) return 'border-l-4 border-l-green-500'
                                  if (teamGoals < opponentGoals) return 'border-l-4 border-l-red-500'
                                  return 'border-l-4 border-l-yellow-500'
                                }
                                return 'border-l-4 border-l-gray-500'
                              })()
                            : ''
                        }`}>
                          <div className="col-span-2 flex items-center gap-2">
                            <span className={isHome ? "font-semibold" : ""}>
                              {isHome ? team.name : opponentName}
                            </span>
                            <span>vs</span>
                            <span className={!isHome ? "font-semibold" : ""}>
                              {!isHome ? team.name : opponentName}
                            </span>
                          </div>
                          
                          <div className="text-center">
                            {match.homeGoals != null && match.awayGoals != null ? (
                              <span className="font-semibold">
                                {match.homeGoals} : {match.awayGoals}
                              </span>
                            ) : (
                              <span className="opacity-70">TBD</span>
                            )}
                          </div>
                          
                          <div className="text-center">
                            {match.dateISO ? (
                              <span className="text-sm">{new Date(match.dateISO).toLocaleDateString()}</span>
                            ) : (
                              <span className="text-xs opacity-50">Scheduled</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Tournaments Section - Only show if team participates in tournaments */}
      {teamTournaments.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-xl font-semibold mb-4 text-center">Tournaments</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left">Tournament</th>
                  <th className="py-3 px-4 text-center">Teams</th>
                  <th className="py-3 px-4 text-center">Matches</th>
                  <th className="py-3 px-4 text-center">Format</th>
                  <th className="py-3 px-4 text-center">Position</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teamTournaments.map((tournament) => (
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
                                m.homeTeamId === team.id || m.awayTeamId === team.id
                              )
                              const completedMatches = teamMatches.filter(m => 
                                m.homeGoals != null && m.awayGoals != null
                              )
                              if (completedMatches.length === 0) return 'No games played'
                              
                              // Calculate points
                              let points = 0
                              completedMatches.forEach(match => {
                                const isHome = match.homeTeamId === team.id
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
                      <span className="font-semibold">{tournament.teamIds.length}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold">{tournament.matches.length}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-sm">
                        {tournament.format?.mode === 'league_playoff' ? 'League + Playoffs' : 'League Only'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {(() => {
                        // Calculate team position in tournament
                        const teamMatches = tournament.matches.filter(m => 
                          m.homeTeamId === team.id || m.awayTeamId === team.id
                        )
                        const completedMatches = teamMatches.filter(m => 
                          m.homeGoals != null && m.awayGoals != null
                        )
                        if (completedMatches.length === 0) return <span className="text-sm opacity-70">No games</span>
                        
                        // Calculate points
                        let points = 0
                        completedMatches.forEach(match => {
                          const isHome = match.homeTeamId === team.id
                          const teamGoals = isHome ? match.homeGoals : match.awayGoals
                          const opponentGoals = isHome ? match.awayGoals : match.homeGoals
                          if (teamGoals && opponentGoals) {
                            if (teamGoals > opponentGoals) points += 3
                            else if (teamGoals === opponentGoals) points += 1
                          }
                        })
                        
                        return <span className="font-semibold text-green-400">{points} pts</span>
                      })()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        to={`/public/tournaments/${tournament.id}`}
                        className="px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center"
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

      {/* Photo Modal */}
      {showPhotoModal && team.photo && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPhotoModal(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={team.photo}
              alt={`${team.name} photo`}
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setShowPhotoModal(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-xl transition-all"
            >
              ✕
            </button>
            <div className="absolute bottom-4 left-4 text-white text-sm opacity-80">
              Click anywhere to close
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
