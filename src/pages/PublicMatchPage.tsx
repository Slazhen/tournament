import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useEffect, useState } from 'react'

export default function PublicMatchPage() {
  const { tournamentId, matchId } = useParams()
  const { getAllTournaments, getAllTeams, loadTournaments, loadTeams } = useAppStore()
  const [isLoading, setIsLoading] = useState(true)
  const [dataLoaded, setDataLoaded] = useState(false)

  // Load data from AWS when component mounts
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([loadTournaments(), loadTeams()])
        setDataLoaded(true)
      } catch (error) {
        console.error('Error loading data for public match page:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [loadTournaments, loadTeams])

  if (isLoading || !dataLoaded) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="opacity-80">Loading match...</p>
        </div>
      </div>
    )
  }

  // Only access data after it's loaded
  const tournaments = getAllTournaments()
  const teams = getAllTeams()

  const tournament = tournaments.find(t => t.id === tournamentId)
  const match = tournament?.matches.find(m => m.id === matchId)
  
  const homeTeam = teams.find(t => t.id === match?.homeTeamId)
  const awayTeam = teams.find(t => t.id === match?.awayTeamId)

  if (!tournament || !match || !homeTeam || !awayTeam) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Match Not Found</h1>
          <p className="opacity-80 mb-6">The match you're looking for doesn't exist or is not publicly visible.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  const getPlayerName = (playerId: string, team: typeof homeTeam) => {
    const player = team?.players.find(p => p.id === playerId)
    return player ? `${player.firstName} ${player.lastName}` : 'Unknown Player'
  }

  const getMatchStatus = () => {
    if (!match.dateISO) return 'scheduled'
    const now = new Date()
    const matchDate = new Date(match.dateISO)
    if (now < matchDate) return 'scheduled'
    if (match.homeGoals !== undefined && match.awayGoals !== undefined) return 'finished'
    return 'live'
  }

  const matchStatus = getMatchStatus()

  return (
    <div className="grid gap-6 place-items-center">
      {/* Header */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <Link to={`/public/tournaments/${tournament.id}`} className="text-sm opacity-70 hover:opacity-100 flex items-center gap-2">
            ← Back to {tournament.name}
          </Link>
        </div>

        {/* Match Header */}
        <div className="text-center mb-6">
          <div className="text-sm opacity-70 mb-2">
            {tournament.name} • Round {match.round || 1}
            {match.isPlayoff && ` • Playoff Round ${match.playoffRound}`}
          </div>
          
          {/* Teams and Score */}
          <div className="flex items-center justify-center gap-8 mb-4">
            <div className="text-center">
              {/* Home Team Logo */}
              <div className="flex justify-center mb-2">
                {homeTeam.logo ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                    <img src={homeTeam.logo} alt={`${homeTeam.name} logo`} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: homeTeam.colors?.[0] || '#3B82F6' }}>
                    <span className="text-white font-bold text-lg">{homeTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <Link 
                to={`/public/teams/${homeTeam.id}`}
                className="text-lg font-semibold hover:opacity-80 transition-opacity"
              >
                {homeTeam.name}
              </Link>
              <div className="text-4xl font-bold text-blue-400">
                {match.homeGoals !== undefined ? match.homeGoals : '-'}
              </div>
            </div>
            
            <div className="text-2xl font-bold opacity-50">vs</div>
            
            <div className="text-center">
              {/* Away Team Logo */}
              <div className="flex justify-center mb-2">
                {awayTeam.logo ? (
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                    <img src={awayTeam.logo} alt={`${awayTeam.name} logo`} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: awayTeam.colors?.[0] || '#3B82F6' }}>
                    <span className="text-white font-bold text-lg">{awayTeam.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <Link 
                to={`/public/teams/${awayTeam.id}`}
                className="text-lg font-semibold hover:opacity-80 transition-opacity"
              >
                {awayTeam.name}
              </Link>
              <div className="text-4xl font-bold text-red-400">
                {match.awayGoals !== undefined ? match.awayGoals : '-'}
              </div>
            </div>
          </div>

          {/* Match Info */}
          <div className="flex items-center justify-center gap-6 text-sm">
            {match.dateISO && (
              <div>
                <span className="opacity-70">Date:</span>
                <span className="ml-2">{new Date(match.dateISO).toLocaleDateString()}</span>
              </div>
            )}
            {match.venue && (
              <div>
                <span className="opacity-70">Venue:</span>
                <span className="ml-2">{match.venue}</span>
              </div>
            )}
            {match.referee && (
              <div>
                <span className="opacity-70">Referee:</span>
                <span className="ml-2">{match.referee}</span>
              </div>
            )}
            <div>
              <span className="opacity-70">Status:</span>
              <span className={`ml-2 font-semibold ${
                matchStatus === 'finished' ? 'text-green-400' :
                matchStatus === 'live' ? 'text-yellow-400' :
                'text-blue-400'
              }`}>
                {matchStatus.charAt(0).toUpperCase() + matchStatus.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Match Statistics */}
      {match.statistics && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-lg font-semibold mb-4 text-center">Match Statistics</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 px-4 font-semibold">Statistic</th>
                  <th className="text-center py-3 px-4 font-semibold">{homeTeam.name}</th>
                  <th className="text-center py-3 px-4 font-semibold">{awayTeam.name}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Goals', home: 'goals', away: 'goals' },
                  { label: 'Shots', home: 'shots', away: 'shots' },
                  { label: 'Shots on Target', home: 'shotsOnTarget', away: 'shotsOnTarget' },
                  { label: 'Corners', home: 'corners', away: 'corners' },
                  { label: 'Fouls', home: 'fouls', away: 'fouls' },
                  { label: 'Yellow Cards', home: 'yellowCards', away: 'yellowCards' },
                  { label: 'Red Cards', home: 'redCards', away: 'redCards' },
                  { label: 'Possession', home: 'possession', away: 'possession', suffix: '%' }
                ].map(stat => (
                  <tr key={stat.label} className="border-b border-white/10">
                    <td className="py-3 px-4 font-medium">{stat.label}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-blue-400 font-bold">
                        {stat.label === 'Goals' 
                          ? (match.homeGoals || 0)
                          : (match.statistics?.home[stat.home as keyof typeof match.statistics.home] || 0)
                        }
                        {stat.suffix || ''}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-red-400 font-bold">
                        {stat.label === 'Goals' 
                          ? (match.awayGoals || 0)
                          : (match.statistics?.away[stat.away as keyof typeof match.statistics.away] || 0)
                        }
                        {stat.suffix || ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Goals Timeline */}
      {match.goals && match.goals.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-lg font-semibold mb-4 text-center">Goals Timeline</h2>
          <div className="space-y-2">
            {match.goals
              .sort((a, b) => a.minute - b.minute)
              .map(goal => (
              <div key={goal.id} className="flex items-center justify-between p-3 glass rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono bg-white/20 px-2 py-1 rounded">
                    {goal.minute}'
                  </span>
                  <Link 
                    to={`/public/players/${goal.playerId}`}
                    className={`font-semibold hover:opacity-80 transition-opacity ${goal.team === 'home' ? 'text-blue-400' : 'text-red-400'}`}
                  >
                    {getPlayerName(goal.playerId, goal.team === 'home' ? homeTeam : awayTeam)}
                  </Link>
                  <span className="text-sm opacity-70">
                    {goal.type === 'penalty' ? '(Penalty)' : goal.type === 'own_goal' ? '(Own Goal)' : ''}
                  </span>
                  {goal.assistPlayerId && (
                    <span className="text-sm opacity-70">
                      (Assist: <Link 
                        to={`/public/players/${goal.assistPlayerId}`}
                        className="hover:opacity-80 transition-opacity"
                      >
                        {getPlayerName(goal.assistPlayerId, goal.team === 'home' ? homeTeam : awayTeam)}
                      </Link>)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Team Lineups */}
      {match.lineups && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-lg font-semibold mb-4 text-center">Team Lineups</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Home Team Lineup */}
            <div className="glass rounded-lg p-4">
              <h3 className="font-semibold mb-4 text-blue-400">{homeTeam.name}</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 opacity-70">Starting XI</h4>
                  <div className="space-y-2">
                    {match.lineups.home.starting.map((playerId) => {
                      const player = homeTeam.players.find(p => p.id === playerId)
                      return (
                        <div key={playerId} className="flex items-center justify-between p-2 glass rounded">
                          {player ? (
                            <Link 
                              to={`/public/players/${player.id}`}
                              className="text-sm hover:opacity-80 transition-opacity"
                            >
                              {`${player.firstName} ${player.lastName}`}
                            </Link>
                          ) : (
                            <span className="text-sm">Unknown Player</span>
                          )}
                          {player?.number && (
                            <span className="text-xs opacity-70">#{player.number}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {match.lineups.home.substitutes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 opacity-70">Substitutes</h4>
                    <div className="space-y-2">
                      {match.lineups.home.substitutes.map((playerId) => {
                        const player = homeTeam.players.find(p => p.id === playerId)
                        return (
                          <div key={playerId} className="flex items-center justify-between p-2 glass rounded">
                            {player ? (
                              <Link 
                                to={`/public/players/${player.id}`}
                                className="text-sm hover:opacity-80 transition-opacity"
                              >
                                {`${player.firstName} ${player.lastName}`}
                              </Link>
                            ) : (
                              <span className="text-sm">Unknown Player</span>
                            )}
                            {player?.number && (
                              <span className="text-xs opacity-70">#{player.number}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Away Team Lineup */}
            <div className="glass rounded-lg p-4">
              <h3 className="font-semibold mb-4 text-red-400">{awayTeam.name}</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 opacity-70">Starting XI</h4>
                  <div className="space-y-2">
                    {match.lineups.away.starting.map((playerId) => {
                      const player = awayTeam.players.find(p => p.id === playerId)
                      return (
                        <div key={playerId} className="flex items-center justify-between p-2 glass rounded">
                          {player ? (
                            <Link 
                              to={`/public/players/${player.id}`}
                              className="text-sm hover:opacity-80 transition-opacity"
                            >
                              {`${player.firstName} ${player.lastName}`}
                            </Link>
                          ) : (
                            <span className="text-sm">Unknown Player</span>
                          )}
                          {player?.number && (
                            <span className="text-xs opacity-70">#{player.number}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {match.lineups.away.substitutes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 opacity-70">Substitutes</h4>
                    <div className="space-y-2">
                      {match.lineups.away.substitutes.map((playerId) => {
                        const player = awayTeam.players.find(p => p.id === playerId)
                        return (
                          <div key={playerId} className="flex items-center justify-between p-2 glass rounded">
                            {player ? (
                              <Link 
                                to={`/public/players/${player.id}`}
                                className="text-sm hover:opacity-80 transition-opacity"
                              >
                                {`${player.firstName} ${player.lastName}`}
                              </Link>
                            ) : (
                              <span className="text-sm">Unknown Player</span>
                            )}
                            {player?.number && (
                              <span className="text-xs opacity-70">#{player.number}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Match Content */}
      {(match.preview || match.report || match.videoUrl) && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-lg font-semibold mb-4 text-center">Match Content</h2>
          
          {match.preview && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Match Preview</h3>
              <div className="glass rounded-lg p-4">
                <p className="whitespace-pre-wrap">{match.preview}</p>
              </div>
            </div>
          )}
          
          {match.report && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Match Report</h3>
              <div className="glass rounded-lg p-4">
                <p className="whitespace-pre-wrap">{match.report}</p>
              </div>
            </div>
          )}
          
          {match.videoUrl && (
            <div>
              <h3 className="font-semibold mb-2">Match Video</h3>
              <div className="glass rounded-lg p-4 text-center">
                <a
                  href={match.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded glass hover:bg-white/10 transition-all"
                >
                  🎥 Watch Match Video
                </a>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
