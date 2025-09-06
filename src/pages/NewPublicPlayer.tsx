import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { dynamoDB, TABLES } from '../lib/aws-config'
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

interface Player {
  id: string
  firstName: string
  lastName: string
  number?: number
  position?: string
  photo?: string
  isPublic: boolean
  dateOfBirth?: string
  socialMedia?: any
}

interface Team {
  id: string
  name: string
  logo?: string
  colors?: string[]
}

export default function NewPublicPlayer() {
  const { id } = useParams()
  const [player, setPlayer] = useState<Player | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPlayer = async () => {
      try {
        setLoading(true)
        setError(null)

        // Find player across all teams
        const teamsResponse = await dynamoDB.send(new ScanCommand({
          TableName: TABLES.TEAMS
        }))

        let foundPlayer: Player | null = null
        let foundTeam: Team | null = null

        for (const teamData of teamsResponse.Items || []) {
          const team = teamData as Team & { players?: Player[] }
          if (team.players) {
            const playerData = team.players.find(p => p.id === id && p.isPublic)
            if (playerData) {
              foundPlayer = playerData
              foundTeam = team
              break
            }
          }
        }

        if (!foundPlayer || !foundTeam) {
          setError('Player not found or not publicly visible')
          return
        }

        setPlayer(foundPlayer)
        setTeam(foundTeam)

      } catch (err) {
        console.error('Error loading player:', err)
        setError('Failed to load player data')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      loadPlayer()
    }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-900 via-red-900 to-pink-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading player...</p>
        </div>
      </div>
    )
  }

  if (error || !player || !team) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-900 via-red-900 to-pink-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">⚽</div>
          <h1 className="text-3xl font-bold text-white mb-4">Player Not Found</h1>
          <p className="text-gray-300 mb-6">{error || 'The player you\'re looking for doesn\'t exist or is not publicly visible.'}</p>
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

  const getAge = () => {
    if (!player.dateOfBirth) return null
    const today = new Date()
    const birthDate = new Date(player.dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-900 via-red-900 to-pink-900">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative container mx-auto px-4 py-16">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Player Photo */}
            <div className="flex-shrink-0">
              {player.photo ? (
                <img 
                  src={player.photo} 
                  alt={`${player.firstName} ${player.lastName}`}
                  className="w-48 h-48 rounded-full object-cover border-4 border-white/20"
                />
              ) : (
                <div className="w-48 h-48 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/20">
                  <span className="text-6xl font-bold text-white">
                    {player.firstName[0]}{player.lastName[0]}
                  </span>
                </div>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-5xl font-bold text-white mb-4">
                {player.firstName} {player.lastName}
              </h1>
              
              <div className="flex flex-wrap justify-center md:justify-start gap-4 mb-6">
                {player.number && (
                  <span className="bg-white/20 text-white px-4 py-2 rounded-lg text-lg font-semibold">
                    #{player.number}
                  </span>
                )}
                {player.position && (
                  <span className="bg-white/20 text-white px-4 py-2 rounded-lg text-lg">
                    {player.position}
                  </span>
                )}
                {getAge() && (
                  <span className="bg-white/20 text-white px-4 py-2 rounded-lg text-lg">
                    {getAge()} years old
                  </span>
                )}
              </div>

              {/* Team Info */}
              <div className="flex items-center justify-center md:justify-start gap-4 mb-6">
                {team.logo && (
                  <img 
                    src={team.logo} 
                    alt={`${team.name} logo`}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                )}
                <Link 
                  to={`/public/teams/${team.id}`}
                  className="text-2xl font-semibold text-white hover:opacity-80 transition-opacity"
                >
                  {team.name}
                </Link>
              </div>

              {/* Social Media */}
              {player.socialMedia && (player.socialMedia.facebook || player.socialMedia.instagram) && (
                <div className="flex justify-center md:justify-start gap-4">
                  {player.socialMedia.facebook && (
                    <a
                      href={player.socialMedia.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all"
                    >
                      Facebook
                    </a>
                  )}
                  {player.socialMedia.instagram && (
                    <a
                      href={player.socialMedia.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-pink-600 hover:bg-pink-700 text-white px-6 py-3 rounded-lg transition-all"
                    >
                      Instagram
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="container mx-auto px-4 py-8">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">Player Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-white mb-2">0</div>
            <div className="text-gray-300">Goals</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-white mb-2">0</div>
            <div className="text-gray-300">Assists</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-white mb-2">0</div>
            <div className="text-gray-300">Matches</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-400 py-8">
        <p>Powered by MFTournament</p>
      </div>
    </div>
  )
}
