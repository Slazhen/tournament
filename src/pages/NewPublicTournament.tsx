import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { dynamoDB, TABLES } from '../lib/aws-config'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

interface Tournament {
  id: string
  name: string
  format: any
  teamIds: string[]
  organizerId: string
  matches: any[]
  logo?: string
  location?: string
  socialMedia?: any
  createdAtISO: string
}

interface Team {
  id: string
  name: string
  logo?: string
  colors?: string[]
  players?: any[]
  socialMedia?: any
}

export default function NewPublicTournament() {
  const { id } = useParams()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playerStatsFilter, setPlayerStatsFilter] = useState<'all' | 'scorers' | 'assists'>('scorers')

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Load tournament
        const tournamentResponse = await dynamoDB.send(new GetCommand({
          TableName: TABLES.TOURNAMENTS,
          Key: { id }
        }))

        if (!tournamentResponse.Item) {
          setError('Tournament not found')
          return
        }

        const tournamentData = tournamentResponse.Item as Tournament
        setTournament(tournamentData)

        // Load teams
        if (tournamentData.teamIds && tournamentData.teamIds.length > 0) {
          const teamPromises = tournamentData.teamIds.map(teamId =>
            dynamoDB.send(new GetCommand({
              TableName: TABLES.TEAMS,
              Key: { id: teamId }
            }))
          )

          const teamResponses = await Promise.all(teamPromises)
          const teamData = teamResponses
            .map(response => response.Item)
            .filter(Boolean) as Team[]
          
          setTeams(teamData)
        }

      } catch (err) {
        console.error('Error loading tournament data:', err)
        setError('Failed to load tournament data')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      loadData()
    }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
          <div className="absolute bottom-32 right-1/3 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl animate-pulse delay-3000"></div>
        </div>
        
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center relative z-10 shadow-2xl border border-white/20">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center border border-white/20 animate-pulse">
              <span className="text-3xl">🏆</span>
            </div>
            <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Loading Tournament
            </h1>
            <p className="text-lg opacity-80 text-gray-300">Please wait while we load the tournament data...</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-blue-400"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        </div>
        
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center relative z-10 shadow-2xl border border-white/20">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center border border-white/20">
              <span className="text-3xl">🏆</span>
            </div>
            <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Tournament Not Found
            </h1>
            <p className="text-lg opacity-80 text-gray-300 mb-6">{error || 'The tournament you\'re looking for doesn\'t exist.'}</p>
            <Link 
              to="/" 
              className="inline-block px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all duration-300 text-white font-medium border border-white/20 hover:border-white/30 hover:shadow-lg hover:shadow-white/5"
            >
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Calculate standings
  const calculateStandings = () => {
    const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
    
    // Initialize stats for all teams
    teams.forEach(team => {
      stats[team.id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
    })

    // Process matches
    tournament.matches?.forEach(match => {
      console.log('Processing match:', match.id, 'homeGoals:', match.homeGoals, 'awayGoals:', match.awayGoals)
      // Only process matches that have been played (both scores are valid numbers)
      const hasValidScores = typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number' &&
                           !isNaN(match.homeGoals) && !isNaN(match.awayGoals) &&
                           match.homeGoals >= 0 && match.awayGoals >= 0
      
      if (hasValidScores) {
        const homeTeam = stats[match.homeTeamId]
        const awayTeam = stats[match.awayTeamId]
        
        if (homeTeam && awayTeam) {
          homeTeam.p++
          awayTeam.p++
          homeTeam.gf += match.homeGoals
          homeTeam.ga += match.awayGoals
          awayTeam.gf += match.awayGoals
          awayTeam.ga += match.homeGoals

          if (match.homeGoals > match.awayGoals) {
            homeTeam.w++
            awayTeam.l++
            homeTeam.pts += 3
          } else if (match.homeGoals < match.awayGoals) {
            awayTeam.w++
            homeTeam.l++
            awayTeam.pts += 3
          } else {
            homeTeam.d++
            awayTeam.d++
            homeTeam.pts++
            awayTeam.pts++
          }
        }
      }
    })

    const finalStandings = Object.entries(stats)
      .map(([teamId, stats]) => ({ teamId, ...stats }))
      .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
    
    console.log('Final standings:', finalStandings)
    return finalStandings
  }

  const standings = calculateStandings()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        <div className="absolute bottom-32 right-1/3 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl animate-pulse delay-3000"></div>
      </div>

      {/* Header */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="glass rounded-2xl p-8 max-w-4xl mx-auto shadow-2xl border border-white/20">
            {tournament.logo && (
              <div className="mb-6">
                <div className="relative inline-block">
                  <div className="absolute inset-0 rounded-full blur-2xl opacity-30 bg-gradient-to-r from-blue-400/20 to-purple-400/20"></div>
                  <div className="relative bg-white/10 backdrop-blur-sm rounded-full p-6 border border-white/20 shadow-xl">
                    <img 
                      src={tournament.logo} 
                      alt={`${tournament.name} logo`}
                      className="w-24 h-24 object-contain"
                    />
                  </div>
                </div>
              </div>
            )}
            
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              {tournament.name}
            </h1>
            
            {/* Tournament Info */}
            <div className="space-y-4 mb-8">
              {tournament.location && (
                <div className="flex items-center justify-center gap-2 text-xl text-gray-300">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  <span>📍 {tournament.location}</span>
                </div>
              )}
              
              {/* Social Media Links */}
              {tournament.socialMedia && (tournament.socialMedia.facebook || tournament.socialMedia.instagram) && (
                <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
                  {tournament.socialMedia.facebook && (
                    <a 
                      href={tournament.socialMedia.facebook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex items-center justify-center gap-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-400/30 hover:border-blue-400/50 px-6 py-3 rounded-xl transition-all backdrop-blur-sm"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">📘</span>
                      <span className="text-white font-medium">Facebook</span>
                    </a>
                  )}
                  {tournament.socialMedia.instagram && (
                    <a 
                      href={tournament.socialMedia.instagram} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="group flex items-center justify-center gap-3 bg-pink-600/20 hover:bg-pink-600/30 border border-pink-400/30 hover:border-pink-400/50 px-6 py-3 rounded-xl transition-all backdrop-blur-sm"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">📷</span>
                      <span className="text-white font-medium">Instagram</span>
                    </a>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex justify-center gap-6 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>{teams.length} Teams</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span>{tournament.matches?.length || 0} Matches</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Standings */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Standings</h2>
            <p className="text-gray-400">Current tournament rankings</p>
          </div>
          <div className="glass rounded-2xl p-8 overflow-hidden shadow-2xl border border-white/20">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-4 px-6 text-white font-semibold text-lg">#</th>
                    <th className="text-left py-4 px-6 text-white font-semibold text-lg">Team</th>
                    <th className="text-center py-4 px-6 text-white font-semibold text-lg">P</th>
                    <th className="text-center py-4 px-6 text-white font-semibold text-lg">W</th>
                    <th className="text-center py-4 px-6 text-white font-semibold text-lg">D</th>
                    <th className="text-center py-4 px-6 text-white font-semibold text-lg">L</th>
                    <th className="text-center py-4 px-6 text-white font-semibold text-lg">GF</th>
                    <th className="text-center py-4 px-6 text-white font-semibold text-lg">GA</th>
                    <th className="text-center py-4 px-6 text-white font-semibold text-lg">GD</th>
                    <th className="text-center py-4 px-6 text-white font-semibold text-lg">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team, index) => {
                    const teamData = teams.find(t => t.id === team.teamId)
                    const isTopThree = index < 3
                    return (
                      <tr key={team.teamId} className={`border-b border-white/10 hover:bg-white/5 transition-all duration-300 ${isTopThree ? 'bg-gradient-to-r from-yellow-500/5 to-orange-500/5' : ''}`}>
                        <td className="py-6 px-6 text-white font-bold text-lg">
                          <div className="flex items-center gap-2">
                            {isTopThree && (
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                index === 0 ? 'bg-yellow-500 text-black' : 
                                index === 1 ? 'bg-gray-400 text-black' : 
                                'bg-orange-500 text-black'
                              }`}>
                                {index + 1}
                              </div>
                            )}
                            {!isTopThree && <span>{index + 1}</span>}
                          </div>
                        </td>
                        <td className="py-6 px-6">
                          <Link 
                            to={`/public/teams/${team.teamId}`}
                            className="group flex items-center gap-4 hover:text-blue-300 transition-colors duration-300"
                          >
                            {teamData?.logo ? (
                              <div className="relative">
                                <img 
                                  src={teamData.logo} 
                                  alt={`${teamData.name} logo`}
                                  className="w-10 h-10 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                />
                                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                <span className="text-sm font-bold text-white">
                                  {teamData?.name?.charAt(0) || 'T'}
                                </span>
                              </div>
                            )}
                            <span className="font-medium text-lg group-hover:text-blue-300 transition-colors duration-300">
                              {teamData?.name || 'Unknown Team'}
                            </span>
                          </Link>
                        </td>
                        <td className="py-6 px-6 text-center text-white text-lg font-medium">{team.p}</td>
                        <td className="py-6 px-6 text-center text-white text-lg font-medium">{team.w}</td>
                        <td className="py-6 px-6 text-center text-white text-lg font-medium">{team.d}</td>
                        <td className="py-6 px-6 text-center text-white text-lg font-medium">{team.l}</td>
                        <td className="py-6 px-6 text-center text-white text-lg font-medium">{team.gf}</td>
                        <td className="py-6 px-6 text-center text-white text-lg font-medium">{team.ga}</td>
                        <td className="py-6 px-6 text-center text-white text-lg font-medium">{team.gf - team.ga}</td>
                        <td className="py-6 px-6 text-center text-white font-bold text-xl">{team.pts}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Statistics</h2>
            <p className="text-gray-400">Player performance analytics</p>
          </div>
          
          {/* Player Statistics */}
          <div className="glass rounded-2xl p-8 shadow-2xl border border-white/20">

            {/* Team Statistics Tab - Removed */}
            {false && (
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white mb-6">Team Performance</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left py-4 px-6 text-white font-semibold text-lg">#</th>
                        <th className="text-left py-4 px-6 text-white font-semibold text-lg">Team</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">P</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">W</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">D</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">L</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">GF</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">GA</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">GD</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Calculate team statistics
                        const teamStats = teams.map(team => {
                          const teamMatches = tournament?.matches?.filter(match => 
                            match.homeTeamId === team.id || match.awayTeamId === team.id
                          ) || []
                          
                          let played = 0
                          let won = 0
                          let drawn = 0
                          let lost = 0
                          let goalsFor = 0
                          let goalsAgainst = 0
                          
                          teamMatches.forEach(match => {
                            if (match.homeGoals !== null && match.awayGoals !== null) {
                              played++
                              const isHome = match.homeTeamId === team.id
                              const teamGoals = isHome ? match.homeGoals : match.awayGoals
                              const opponentGoals = isHome ? match.awayGoals : match.homeGoals
                              
                              goalsFor += teamGoals
                              goalsAgainst += opponentGoals
                              
                              if (teamGoals > opponentGoals) won++
                              else if (teamGoals === opponentGoals) drawn++
                              else lost++
                            }
                          })
                          
                          const goalDifference = goalsFor - goalsAgainst
                          const points = won * 3 + drawn
                          
                          return {
                            team,
                            played,
                            won,
                            drawn,
                            lost,
                            goalsFor,
                            goalsAgainst,
                            goalDifference,
                            points
                          }
                        })
                        
                        // Sort by points, then goal difference, then goals for
                        teamStats.sort((a, b) => {
                          if (b.points !== a.points) return b.points - a.points
                          if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
                          return b.goalsFor - a.goalsFor
                        })
                        
                        return teamStats.map((stats, index) => (
                          <tr key={stats.team.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                            <td className="py-4 px-6 text-white font-bold text-lg">
                              {index < 3 ? (
                                <div className="flex items-center gap-2">
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                                    index === 0 ? 'bg-yellow-500 text-black' :
                                    index === 1 ? 'bg-gray-400 text-black' :
                                    'bg-orange-500 text-black'
                                  }`}>
                                    {index + 1}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-300">{index + 1}</span>
                              )}
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                {stats.team.logo ? (
                                  <img 
                                    src={stats.team.logo} 
                                    alt={`${stats.team.name} logo`}
                                    className="w-10 h-10 rounded-full object-cover border border-white/20"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20">
                                    <span className="text-sm font-bold text-white">
                                      {stats.team.name.charAt(0)}
                                    </span>
                                  </div>
                                )}
                                <span className="text-white font-semibold text-lg">{stats.team.name}</span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center text-white font-semibold">{stats.played}</td>
                            <td className="py-4 px-6 text-center text-white font-semibold">{stats.won}</td>
                            <td className="py-4 px-6 text-center text-white font-semibold">{stats.drawn}</td>
                            <td className="py-4 px-6 text-center text-white font-semibold">{stats.lost}</td>
                            <td className="py-4 px-6 text-center text-white font-semibold">{stats.goalsFor}</td>
                            <td className="py-4 px-6 text-center text-white font-semibold">{stats.goalsAgainst}</td>
                            <td className="py-4 px-6 text-center text-white font-semibold">
                              <span className={stats.goalDifference > 0 ? 'text-green-400' : stats.goalDifference < 0 ? 'text-red-400' : 'text-gray-400'}>
                                {stats.goalDifference > 0 ? '+' : ''}{stats.goalDifference}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center text-white font-bold text-lg">{stats.points}</td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Player Statistics */}
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <h3 className="text-2xl font-bold text-white">Player Performance</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPlayerStatsFilter('all')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        playerStatsFilter === 'all'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                      }`}
                    >
                      All Players
                    </button>
                    <button
                      onClick={() => setPlayerStatsFilter('scorers')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        playerStatsFilter === 'scorers'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                      }`}
                    >
                      Top Scorers
                    </button>
                    <button
                      onClick={() => setPlayerStatsFilter('assists')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        playerStatsFilter === 'assists'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                      }`}
                    >
                      Top Assists
                    </button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left py-4 px-6 text-white font-semibold text-lg">Player</th>
                        <th className="text-left py-4 px-6 text-white font-semibold text-lg">Club</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">Games</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">Goals</th>
                        <th className="text-center py-4 px-6 text-white font-semibold text-lg">Assists</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Calculate player statistics
                        const playerStats = teams.flatMap(team => 
                          (team.players || []).map(player => {
                            const playerMatches = tournament.matches?.filter(match => {
                              const isHome = match.homeTeamId === team.id
                              const teamPlayers = isHome ? match.lineups?.home?.starting || [] : match.lineups?.away?.starting || []
                              return teamPlayers.includes(player.id) && match.homeGoals !== null && match.awayGoals !== null
                            }) || []
                            
                            let goals = 0
                            let assists = 0
                            
                            tournament.matches?.forEach(match => {
                              if (match.goals) {
                                match.goals.forEach((goal: any) => {
                                  if (goal.playerId === player.id) goals++
                                  if (goal.assistPlayerId === player.id) assists++
                                })
                              }
                            })
                            
                            return {
                              player,
                              team,
                              gamesPlayed: playerMatches.length,
                              goals,
                              assists
                            }
                          })
                        )
                        
                        // Filter and sort based on selected filter
                        let filteredStats = playerStats
                        if (playerStatsFilter === 'scorers') {
                          filteredStats = playerStats.filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 5)
                        } else if (playerStatsFilter === 'assists') {
                          filteredStats = playerStats.filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 5)
                        } else {
                          // Sort by goals first, then assists
                          filteredStats = playerStats.sort((a, b) => {
                            if (b.goals !== a.goals) return b.goals - a.goals
                            return b.assists - a.assists
                          })
                        }
                        
                        return filteredStats.map((stats) => (
                          <tr key={`${stats.team.id}-${stats.player.id}`} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                {stats.player.photo ? (
                                  <img 
                                    src={stats.player.photo} 
                                    alt={`${stats.player.firstName} ${stats.player.lastName}`}
                                    className="w-10 h-10 rounded-full object-cover border border-white/20"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20">
                                    <span className="text-sm font-bold text-white">
                                      {stats.player.firstName.charAt(0)}{stats.player.lastName.charAt(0)}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <div className="text-white font-semibold text-lg">
                                    {stats.player.firstName} {stats.player.lastName}
                                  </div>
                                  {stats.player.number && (
                                    <div className="text-sm text-gray-400">#{stats.player.number}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                {stats.team.logo ? (
                                  <img 
                                    src={stats.team.logo} 
                                    alt={`${stats.team.name} logo`}
                                    className="w-6 h-6 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">
                                      {stats.team.name.charAt(0)}
                                    </span>
                                  </div>
                                )}
                                <span className="text-white font-medium">{stats.team.name}</span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-center text-white font-semibold">{stats.gamesPlayed}</td>
                            <td className="py-4 px-6 text-center text-white font-semibold">
                              <span className="text-yellow-400 font-bold">{stats.goals}</span>
                            </td>
                            <td className="py-4 px-6 text-center text-white font-semibold">
                              <span className="text-blue-400 font-bold">{stats.assists}</span>
                            </td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        </div>

        {/* Matches by Rounds */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Fixtures & Results</h2>
            <p className="text-gray-400">Matches organized by rounds</p>
          </div>
          
          {(() => {
            // Group matches by round
            const matchesByRound: Record<number, any[]> = {}
            tournament.matches?.forEach(match => {
              const round = match.round || 0
              if (!matchesByRound[round]) {
                matchesByRound[round] = []
              }
              matchesByRound[round].push(match)
            })
            
            // Sort rounds
            const sortedRounds = Object.keys(matchesByRound)
              .map(Number)
              .sort((a, b) => a - b)
            
            return sortedRounds.map(roundNumber => {
              const roundMatches = matchesByRound[roundNumber]
              const isFinished = roundMatches.every(match => 
                match.homeGoals !== null && match.awayGoals !== null
              )
              const isUpcoming = roundMatches.every(match => 
                match.homeGoals === null && match.awayGoals === null
              )
              
              return (
                <div key={roundNumber} className="mb-8">
                  <div className="glass rounded-2xl p-6 shadow-2xl border border-white/20">
                    {/* Round Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center border border-white/20">
                          <span className="text-xl font-bold text-white">{roundNumber + 1}</span>
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white">Tour {roundNumber + 1}</h3>
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <span>{roundMatches.length} matches</span>
                            <span>•</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              isFinished ? 'bg-green-500/20 text-green-400 border border-green-400/30' :
                              isUpcoming ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30' :
                              'bg-yellow-500/20 text-yellow-400 border border-yellow-400/30'
                            }`}>
                              {isFinished ? 'Finished' : isUpcoming ? 'Upcoming' : 'In Progress'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Matches Grid */}
                    <div className="grid gap-4">
                      {roundMatches.map((match) => {
                        const homeTeam = teams.find(t => t.id === match.homeTeamId)
                        const awayTeam = teams.find(t => t.id === match.awayTeamId)
                        const isMatchFinished = match.homeGoals !== null && match.awayGoals !== null
                        const isMatchUpcoming = match.homeGoals === null && match.awayGoals === null
                        
                        return (
                          <div key={match.id} className={`group relative bg-white/5 backdrop-blur-sm rounded-xl p-6 hover:bg-white/10 transition-all duration-300 border ${
                            isMatchFinished ? 'border-green-500/20' : 
                            isMatchUpcoming ? 'border-blue-500/20' : 
                            'border-yellow-500/20'
                          }`}>
                            {/* Match Status Indicator */}
                            <div className="absolute top-4 right-4">
                              <div className={`w-3 h-3 rounded-full ${
                                isMatchFinished ? 'bg-green-400' : 
                                isMatchUpcoming ? 'bg-blue-400' : 
                                'bg-yellow-400 animate-pulse'
                              }`}></div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              {/* Home Team */}
                              <div className="flex items-center gap-4 flex-1">
                                {homeTeam?.logo ? (
                                  <div className="relative">
                                    <img 
                                      src={homeTeam.logo} 
                                      alt={`${homeTeam.name} logo`}
                                      className="w-14 h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                    />
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                  </div>
                                ) : (
                                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                    <span className="text-lg font-bold text-white">
                                      {homeTeam?.name?.charAt(0) || 'H'}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-white font-semibold text-lg group-hover:text-blue-300 transition-colors duration-300">
                                    {homeTeam?.name || 'Unknown Team'}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Score/VS */}
                              <div className="text-center px-6">
                                {isMatchFinished ? (
                                  <div className="space-y-2">
                                    <div className="text-3xl font-bold text-white">
                                      {match.homeGoals} - {match.awayGoals}
                                    </div>
                                    <div className="text-xs text-green-400 font-medium">FINAL</div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="text-xl font-semibold text-gray-300">vs</div>
                                    <div className="text-xs text-blue-400 font-medium">
                                      {isMatchUpcoming ? 'UPCOMING' : 'LIVE'}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Match Date */}
                                {match.dateISO && (
                                  <div className="text-sm text-gray-400 mt-2">
                                    {new Date(match.dateISO).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </div>
                                )}
                              </div>
                              
                              {/* Away Team */}
                              <div className="flex items-center gap-4 flex-1 justify-end">
                                <div className="text-right">
                                  <span className="text-white font-semibold text-lg group-hover:text-blue-300 transition-colors duration-300">
                                    {awayTeam?.name || 'Unknown Team'}
                                  </span>
                                </div>
                                {awayTeam?.logo ? (
                                  <div className="relative">
                                    <img 
                                      src={awayTeam.logo} 
                                      alt={`${awayTeam.name} logo`}
                                      className="w-14 h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                    />
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                  </div>
                                ) : (
                                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                    <span className="text-lg font-bold text-white">
                                      {awayTeam?.name?.charAt(0) || 'A'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })
          })()}
        </div>

        {/* Footer */}
        <div className="text-center text-gray-400">
          <p>Powered by MFTournament</p>
        </div>
      </div>
    </div>
  )
}
