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
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading tournament...</p>
        </div>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-3xl font-bold text-white mb-4">Tournament Not Found</h1>
          <p className="text-gray-300 mb-6">{error || 'The tournament you\'re looking for doesn\'t exist.'}</p>
          <Link 
            to="/" 
            className="inline-block bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-lg transition-all backdrop-blur-sm"
          >
            Go to Home
          </Link>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative container mx-auto px-4 py-16 text-center">
          {tournament.logo && (
            <div className="mb-6">
              <img 
                src={tournament.logo} 
                alt={`${tournament.name} logo`}
                className="w-24 h-24 mx-auto rounded-full object-cover border-4 border-white/20"
              />
            </div>
          )}
          <h1 className="text-5xl font-bold text-white mb-4">{tournament.name}</h1>
          {tournament.location && (
            <p className="text-xl text-gray-300 mb-8">📍 {tournament.location}</p>
          )}
          <div className="flex justify-center gap-4 text-sm text-gray-300">
            <span>{teams.length} Teams</span>
            <span>•</span>
            <span>{tournament.matches?.length || 0} Matches</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Standings */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">Standings</h2>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-3 px-4 text-white font-semibold">#</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Team</th>
                    <th className="text-center py-3 px-4 text-white font-semibold">P</th>
                    <th className="text-center py-3 px-4 text-white font-semibold">W</th>
                    <th className="text-center py-3 px-4 text-white font-semibold">D</th>
                    <th className="text-center py-3 px-4 text-white font-semibold">L</th>
                    <th className="text-center py-3 px-4 text-white font-semibold">GF</th>
                    <th className="text-center py-3 px-4 text-white font-semibold">GA</th>
                    <th className="text-center py-3 px-4 text-white font-semibold">GD</th>
                    <th className="text-center py-3 px-4 text-white font-semibold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team, index) => {
                    const teamData = teams.find(t => t.id === team.teamId)
                    return (
                      <tr key={team.teamId} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                        <td className="py-4 px-4 text-white font-bold">{index + 1}</td>
                        <td className="py-4 px-4">
                          <Link 
                            to={`/public/teams/${team.teamId}`}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                          >
                            {teamData?.logo && (
                              <img 
                                src={teamData.logo} 
                                alt={`${teamData.name} logo`}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            )}
                            <span className="text-white font-medium">{teamData?.name || 'Unknown Team'}</span>
                          </Link>
                        </td>
                        <td className="py-4 px-4 text-center text-white">{team.p}</td>
                        <td className="py-4 px-4 text-center text-white">{team.w}</td>
                        <td className="py-4 px-4 text-center text-white">{team.d}</td>
                        <td className="py-4 px-4 text-center text-white">{team.l}</td>
                        <td className="py-4 px-4 text-center text-white">{team.gf}</td>
                        <td className="py-4 px-4 text-center text-white">{team.ga}</td>
                        <td className="py-4 px-4 text-center text-white">{team.gf - team.ga}</td>
                        <td className="py-4 px-4 text-center text-white font-bold">{team.pts}</td>
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
