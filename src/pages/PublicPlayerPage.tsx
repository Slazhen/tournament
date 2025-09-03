import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'

export default function PublicPlayerPage() {
  const { playerId } = useParams()
  const { getAllTournaments, teams: allTeams } = useAppStore()
  
  const teams = allTeams
  const tournaments = getAllTournaments()
  
  // Find the player across all teams
  let player: any = null
  let currentTeam: any = null
  
  for (const team of teams) {
    const foundPlayer = team.players?.find(p => p.id === playerId)
    if (foundPlayer && foundPlayer.isPublic) {
      player = foundPlayer
      currentTeam = team
      break
    }
  }
  
  // Show player not found if it doesn't exist or is not public
  if (!player || !currentTeam) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Player Not Found</h1>
          <p className="opacity-80 mb-6">The player you're looking for doesn't exist or is not publicly visible.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
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
          
          if (teamGoals > opponentGoals) playerStats.wins++
          else if (teamGoals < opponentGoals) playerStats.losses++
          else playerStats.draws++
        }
      }
    })
  })

  const fullName = `${player.firstName} ${player.lastName}`

  return (
    <div className="grid gap-6 place-items-center">
      {/* Header */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        {/* Player Info Header */}
        <div className="flex items-center gap-6 mb-6">
          {/* Player Photo */}
          <div className="w-32 h-32 rounded-lg bg-white/10 flex items-center justify-center">
            {player.photo ? (
              <img
                src={player.photo}
                alt={`${fullName} photo`}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="text-4xl opacity-50">👤</div>
            )}
          </div>
          
          {/* Player Details */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{fullName}</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {player.number && (
                <div>
                  <span className="opacity-70">Number:</span>
                  <div className="font-semibold">#{player.number}</div>
                </div>
              )}
              {player.position && (
                <div>
                  <span className="opacity-70">Position:</span>
                  <div className="font-semibold">{player.position}</div>
                </div>
              )}
              {player.dateOfBirth && (
                <div>
                  <span className="opacity-70">Date of Birth:</span>
                  <div className="font-semibold">{new Date(player.dateOfBirth).toLocaleDateString()}</div>
                </div>
              )}
              <div>
                <span className="opacity-70">Age:</span>
                <div className="font-semibold">
                  {player.dateOfBirth ? 
                    Math.floor((Date.now() - new Date(player.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : 
                    'N/A'
                  }
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
        
        {/* Social Media Links - Only show if available */}
        {(player.socialMedia?.facebook || player.socialMedia?.instagram) && (
          <div className="flex items-center justify-center gap-6 text-sm">
            {player.socialMedia?.facebook && (
              <a 
                href={player.socialMedia.facebook} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity px-4 py-2 glass rounded-lg"
              >
                <FacebookIcon size={16} />
                Facebook
              </a>
            )}
            {player.socialMedia?.instagram && (
              <a 
                href={player.socialMedia.instagram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity px-4 py-2 glass rounded-lg"
              >
                <InstagramIcon size={16} />
                Instagram
              </a>
            )}
          </div>
        )}
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
