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
      if (match.homeGoals !== null && match.awayGoals !== null) {
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

    return Object.entries(stats)
      .map(([teamId, stats]) => ({ teamId, ...stats }))
      .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
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

        {/* Matches */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">Recent Matches</h2>
          <div className="space-y-4">
            {tournament.matches?.slice(0, 10).map((match) => {
              const homeTeam = teams.find(t => t.id === match.homeTeamId)
              const awayTeam = teams.find(t => t.id === match.awayTeamId)
              
              return (
                <div key={match.id} className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {homeTeam?.logo && (
                        <img 
                          src={homeTeam.logo} 
                          alt={`${homeTeam.name} logo`}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                      <span className="text-white font-semibold text-lg">
                        {homeTeam?.name || 'Unknown Team'}
                      </span>
                    </div>
                    
                    <div className="text-center">
                      {match.homeGoals !== null && match.awayGoals !== null ? (
                        <div className="text-2xl font-bold text-white">
                          {match.homeGoals} - {match.awayGoals}
                        </div>
                      ) : (
                        <div className="text-lg text-gray-300">vs</div>
                      )}
                      {match.dateISO && (
                        <div className="text-sm text-gray-400 mt-1">
                          {new Date(match.dateISO).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <span className="text-white font-semibold text-lg">
                        {awayTeam?.name || 'Unknown Team'}
                      </span>
                      {awayTeam?.logo && (
                        <img 
                          src={awayTeam.logo} 
                          alt={`${awayTeam.name} logo`}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-400">
          <p>Powered by MFTournament</p>
        </div>
      </div>
    </div>
  )
}
