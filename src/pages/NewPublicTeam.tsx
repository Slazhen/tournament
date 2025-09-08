import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { dynamoDB, TABLES } from '../lib/aws-config'
import { GetCommand } from '@aws-sdk/lib-dynamodb'

interface Team {
  id: string
  name: string
  logo?: string
  photo?: string
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black">
      {/* Hero Header with Bundesliga-style background */}
      <div className="relative overflow-hidden">
        {/* Dynamic background based on team colors */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            background: team.colors && team.colors.length > 0 
              ? `linear-gradient(135deg, ${team.colors[0]}20, ${team.colors[1] || team.colors[0]}20, ${team.colors[2] || team.colors[0]}20)`
              : 'linear-gradient(135deg, #1e40af20, #7c3aed20, #dc262620)'
          }}
        ></div>
        
        {/* Geometric patterns overlay */}
        <div className="absolute inset-0">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white/5 rounded-full blur-3xl"></div>
          <div className="absolute top-32 right-20 w-24 h-24 bg-white/5 rounded-full blur-2xl"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-32 right-1/3 w-28 h-28 bg-white/5 rounded-full blur-2xl"></div>
        </div>
        
        <div className="relative container mx-auto px-4 py-20">
          <div className="max-w-6xl mx-auto">
            {/* Team Logo with unique background effect */}
            <div className="text-center mb-12">
              {team.logo && (
                <div className="relative inline-block mb-8">
                  {/* Glowing background effect */}
                  <div 
                    className="absolute inset-0 rounded-full blur-2xl opacity-30"
                    style={{
                      background: team.colors && team.colors.length > 0 
                        ? `linear-gradient(45deg, ${team.colors[0]}, ${team.colors[1] || team.colors[0]})`
                        : 'linear-gradient(45deg, #3b82f6, #8b5cf6)'
                    }}
                  ></div>
                  
                  {/* Logo container with border effect */}
                  <div className="relative bg-white/10 backdrop-blur-sm rounded-full p-8 border border-white/20 shadow-2xl">
                    <img 
                      src={team.logo} 
                      alt={`${team.name} logo`}
                      className="w-32 h-32 object-contain"
                    />
                  </div>
                  
                  {/* Floating elements around logo */}
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full animate-pulse"></div>
                  <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-blue-400 rounded-full animate-pulse delay-1000"></div>
                </div>
              )}
              
              <h1 className="text-6xl font-bold text-white mb-4 tracking-tight">
                {team.name}
              </h1>
              
              {team.establishedDate && (
                <div className="flex items-center justify-center gap-2 text-xl text-gray-300 mb-6">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  <span>Established {new Date(team.establishedDate).getFullYear()}</span>
                </div>
              )}
              
              {/* Team Stats Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-2xl mx-auto mb-8">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/20">
                  <div className="text-2xl font-bold text-white">{publicPlayers.length}</div>
                  <div className="text-sm text-gray-300">Players</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/20">
                  <div className="text-2xl font-bold text-white">
                    {team.colors?.length || 0}
                  </div>
                  <div className="text-sm text-gray-300">Colors</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/20">
                  <div className="text-2xl font-bold text-white">
                    {publicPlayers.filter(p => p.position === 'Goalkeeper').length}
                  </div>
                  <div className="text-sm text-gray-300">Keepers</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/20">
                  <div className="text-2xl font-bold text-white">
                    {publicPlayers.filter(p => p.position && p.position !== 'Goalkeeper').length}
                  </div>
                  <div className="text-sm text-gray-300">Outfield</div>
                </div>
              </div>
              
              {/* Social Media Links */}
              {team.socialMedia && (team.socialMedia.facebook || team.socialMedia.instagram) && (
                <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
                  {team.socialMedia.facebook && (
                    <a 
                      href={team.socialMedia.facebook} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-400/30 hover:border-blue-400/50 px-6 py-3 rounded-xl transition-all backdrop-blur-sm group"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">📘</span>
                      <span className="text-white font-medium">Facebook</span>
                    </a>
                  )}
                  {team.socialMedia.instagram && (
                    <a 
                      href={team.socialMedia.instagram} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-3 bg-pink-600/20 hover:bg-pink-600/30 border border-pink-400/30 hover:border-pink-400/50 px-6 py-3 rounded-xl transition-all backdrop-blur-sm group"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">📷</span>
                      <span className="text-white font-medium">Instagram</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Team Identity Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Team Colors */}
            {team.colors && team.colors.length > 0 && (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                <h2 className="text-3xl font-bold text-white mb-6">Team Colors</h2>
                <div className="flex flex-wrap gap-4">
                  {team.colors.map((color, index) => (
                    <div
                      key={index}
                      className="group relative"
                    >
                      <div
                        className="w-20 h-20 rounded-xl border-2 border-white/20 shadow-lg group-hover:scale-110 transition-transform duration-300"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                      <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {color}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Team Photo */}
            {team.photo && (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                <h2 className="text-3xl font-bold text-white mb-6">Team Photo</h2>
                <div className="relative group">
                  <img 
                    src={team.photo} 
                    alt={`${team.name} team photo`}
                    className="w-full h-64 object-cover rounded-xl shadow-2xl group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-xl"></div>
                  <div className="absolute bottom-4 left-4 text-white">
                    <p className="text-sm opacity-90">Official Team Photo</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Squad Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-white mb-4">Squad</h2>
            <p className="text-xl text-gray-300">Meet our players</p>
          </div>
          
          {publicPlayers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {publicPlayers.map((player) => (
                <Link
                  key={player.id}
                  to={`/public/players/${player.id}`}
                  className="group relative bg-white/5 backdrop-blur-sm rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 border border-white/10 hover:border-white/20 hover:shadow-2xl hover:shadow-white/10"
                >
                  {/* Player number badge */}
                  {player.number && (
                    <div className="absolute -top-3 -right-3 w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-black font-bold text-sm shadow-lg">
                      {player.number}
                    </div>
                  )}
                  
                  <div className="text-center">
                    {/* Player photo with Bundesliga-style effect */}
                    <div className="relative mb-6">
                      {player.photo ? (
                        <div className="relative">
                          <img 
                            src={player.photo} 
                            alt={`${player.firstName} ${player.lastName}`}
                            className="w-24 h-24 mx-auto rounded-full object-cover border-4 border-white/20 group-hover:border-white/40 transition-all duration-300 shadow-xl"
                          />
                          {/* Glow effect on hover */}
                          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl"></div>
                        </div>
                      ) : (
                        <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center group-hover:from-white/30 group-hover:to-white/20 transition-all duration-300 border-4 border-white/20 group-hover:border-white/40 shadow-xl">
                          <span className="text-3xl font-bold text-white">
                            {player.firstName[0]}{player.lastName[0]}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-yellow-300 transition-colors">
                      {player.firstName} {player.lastName}
                    </h3>
                    
                    {player.position && (
                      <div className="inline-block bg-white/10 px-3 py-1 rounded-full text-sm text-gray-300 group-hover:bg-white/20 transition-colors">
                        {player.position}
                      </div>
                    )}
                  </div>
                  
                  {/* Hover overlay effect */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">⚽</div>
              <h3 className="text-2xl font-bold text-white mb-2">No Players Available</h3>
              <p className="text-gray-300">Check back later for player information</p>
            </div>
          )}
        </div>
      </div>

      {/* Social Media & Contact */}
      {team.socialMedia && (team.socialMedia.facebook || team.socialMedia.instagram) && (
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">Connect With Us</h2>
                <p className="text-gray-300">Stay updated with our latest news and updates</p>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-center gap-6">
                {team.socialMedia.facebook && (
                  <a
                    href={team.socialMedia.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-center gap-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-400/30 hover:border-blue-400/50 px-8 py-4 rounded-xl transition-all backdrop-blur-sm"
                  >
                    <span className="text-3xl group-hover:scale-110 transition-transform">📘</span>
                    <div className="text-left">
                      <div className="text-white font-semibold">Facebook</div>
                      <div className="text-sm text-gray-300">Follow us for updates</div>
                    </div>
                  </a>
                )}
                {team.socialMedia.instagram && (
                  <a
                    href={team.socialMedia.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-center gap-3 bg-pink-600/20 hover:bg-pink-600/30 border border-pink-400/30 hover:border-pink-400/50 px-8 py-4 rounded-xl transition-all backdrop-blur-sm"
                  >
                    <span className="text-3xl group-hover:scale-110 transition-transform">📷</span>
                    <div className="text-left">
                      <div className="text-white font-semibold">Instagram</div>
                      <div className="text-sm text-gray-300">See our photos</div>
                    </div>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              {team.logo && (
                <img 
                  src={team.logo} 
                  alt={`${team.name} logo`}
                  className="w-8 h-8 object-contain"
                />
              )}
              <span className="text-xl font-bold text-white">{team.name}</span>
            </div>
            <p className="text-gray-400 text-sm">
              {team.establishedDate && `Established ${new Date(team.establishedDate).getFullYear()}`}
              {team.establishedDate && ' • '}
              {publicPlayers.length} Players • Professional Football Team
            </p>
            <p className="text-gray-500 text-xs mt-2">Powered by MFTournament</p>
          </div>
        </div>
      </div>
    </div>
  )
}
