import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { dynamoDB, TABLES } from '../lib/aws-config'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

interface Team {
  id: string
  name: string
  logo?: string
  colors?: string[]
  players?: Player[]
  socialMedia?: any
  establishedDate?: string
}

interface Player {
  id: string
  firstName: string
  lastName: string
  number?: number
  position?: string
  photo?: string
  isPublic: boolean
}

export default function NewPublicTeam() {
  const { id } = useParams()
  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadTeam = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await dynamoDB.send(new GetCommand({
          TableName: TABLES.TEAMS,
          Key: { id }
        }))

        if (!response.Item) {
          setError('Team not found')
          return
        }

        setTeam(response.Item as Team)

      } catch (err) {
        console.error('Error loading team:', err)
        setError('Failed to load team data')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      loadTeam()
    }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading team...</p>
        </div>
      </div>
    )
  }

  if (error || !team) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">⚽</div>
          <h1 className="text-3xl font-bold text-white mb-4">Team Not Found</h1>
          <p className="text-gray-300 mb-6">{error || 'The team you\'re looking for doesn\'t exist.'}</p>
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

  const publicPlayers = team.players?.filter(player => player.isPublic) || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-blue-900 to-purple-900">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative container mx-auto px-4 py-16 text-center">
          {team.logo && (
            <div className="mb-6">
              <img 
                src={team.logo} 
                alt={`${team.name} logo`}
                className="w-32 h-32 mx-auto rounded-full object-cover border-4 border-white/20"
              />
            </div>
          )}
          <h1 className="text-5xl font-bold text-white mb-4">{team.name}</h1>
          {team.establishedDate && (
            <p className="text-xl text-gray-300 mb-8">
              Established {new Date(team.establishedDate).getFullYear()}
            </p>
          )}
          <div className="flex justify-center gap-4 text-sm text-gray-300">
            <span>{publicPlayers.length} Players</span>
            {team.colors && team.colors.length > 0 && (
              <>
                <span>•</span>
                <span>Team Colors</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Team Colors */}
      {team.colors && team.colors.length > 0 && (
        <div className="container mx-auto px-4 py-8">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">Team Colors</h2>
          <div className="flex justify-center gap-4">
            {team.colors.map((color, index) => (
              <div
                key={index}
                className="w-16 h-16 rounded-full border-4 border-white/20"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Players */}
      <div className="container mx-auto px-4 py-8">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">Squad</h2>
        {publicPlayers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {publicPlayers.map((player) => (
              <Link
                key={player.id}
                to={`/public/players/${player.id}`}
                className="bg-white/10 backdrop-blur-sm rounded-xl p-6 hover:bg-white/15 transition-all group"
              >
                <div className="text-center">
                  {player.photo ? (
                    <img 
                      src={player.photo} 
                      alt={`${player.firstName} ${player.lastName}`}
                      className="w-20 h-20 mx-auto rounded-full object-cover mb-4 border-2 border-white/20 group-hover:border-white/40 transition-colors"
                    />
                  ) : (
                    <div className="w-20 h-20 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
                      <span className="text-2xl font-bold text-white">
                        {player.firstName[0]}{player.lastName[0]}
                      </span>
                    </div>
                  )}
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {player.firstName} {player.lastName}
                  </h3>
                  {player.number && (
                    <p className="text-sm text-gray-300 mb-1">#{player.number}</p>
                  )}
                  {player.position && (
                    <p className="text-sm text-gray-400">{player.position}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-300">
            <p>No public players available</p>
          </div>
        )}
      </div>

      {/* Social Media */}
      {team.socialMedia && (team.socialMedia.facebook || team.socialMedia.instagram) && (
        <div className="container mx-auto px-4 py-8">
          <h2 className="text-2xl font-bold text-white mb-4 text-center">Follow Us</h2>
          <div className="flex justify-center gap-4">
            {team.socialMedia.facebook && (
              <a
                href={team.socialMedia.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all"
              >
                Facebook
              </a>
            )}
            {team.socialMedia.instagram && (
              <a
                href={team.socialMedia.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-pink-600 hover:bg-pink-700 text-white px-6 py-3 rounded-lg transition-all"
              >
                Instagram
              </a>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-gray-400 py-8">
        <p>Powered by MFTournament</p>
      </div>
    </div>
  )
}
