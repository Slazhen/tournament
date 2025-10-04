import { useState, useEffect } from 'react'
import { useAppStore } from '../store'
import { useNavigate, Link } from 'react-router-dom'
import { dynamoDB, TABLES } from '../lib/aws-config'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

interface Organizer {
  id: string
  name: string
  email: string
  createdAtISO: string
  logo?: string
  description?: string
}

interface Tournament {
  id: string
  name: string
  organizerId: string
  logo?: string
  location?: string
  createdAtISO: string
}

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([])
  const [allOrganizers, setAllOrganizers] = useState<Organizer[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  
  const { 
    getCurrentOrganizer,
    loadOrganizers
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  
  // Redirect to admin if organizer is logged in
  useEffect(() => {
    if (currentOrganizer) {
      navigate('/admin')
    }
  }, [currentOrganizer, navigate])

  // Load all organizers and tournaments for public display
  useEffect(() => {
    const loadPublicData = async () => {
      try {
        setLoading(true)
        
        // Load organizers
        const organizersResult = await dynamoDB.send(new ScanCommand({
          TableName: TABLES.ORGANIZERS
        }))
        setAllOrganizers(organizersResult.Items as Organizer[] || [])
        
        // Load tournaments
        const tournamentsResult = await dynamoDB.send(new ScanCommand({
          TableName: TABLES.TOURNAMENTS
        }))
        setAllTournaments(tournamentsResult.Items as Tournament[] || [])
        
        // Also load local organizers
        loadOrganizers()
      } catch (error) {
        console.error('Error loading public data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadPublicData()
  }, [loadOrganizers])

  // Filter organizers and tournaments based on search query
  const filteredOrganizers = allOrganizers.filter(org =>
    typeof org.name === 'string' && org.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredTournaments = allTournaments.filter(tournament => {
    const organizer = allOrganizers.find(org => org.id === tournament.organizerId)
    return (
      (typeof tournament.name === 'string' && tournament.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (organizer && typeof organizer.name === 'string' && organizer.name.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  })

  const handleAdminLogin = () => {
    navigate('/admin/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center border border-white/20 animate-pulse">
              <span className="text-2xl">🏆</span>
            </div>
            <h1 className="text-2xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Loading MFTournament
            </h1>
            <p className="text-lg opacity-80 text-gray-300">Please wait while we load the tournaments...</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-white/20 border-t-blue-400"></div>
          </div>
        </div>
      </div>
    )
  }
  
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
            {/* Logo/Title */}
            <div className="mb-8">
              <div className="text-6xl mb-6 animate-float">🏆</div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                MFTournament
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl opacity-90 mb-8 font-light text-gray-300">
                Football Tournament Management Platform
              </p>
            </div>
            
            {/* Search Section */}
            <div className="mb-8">
              <div className="max-w-2xl mx-auto">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-6 py-4 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all text-white placeholder-gray-400 text-lg"
                    placeholder="Search organizers or tournaments..."
                  />
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                    <span className="text-2xl opacity-60">🔍</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Access Button */}
            <div className="mb-8">
              <button
                onClick={handleAdminLogin}
                className="px-8 py-4 rounded-xl glass hover:bg-white/10 transition-all text-lg font-semibold border border-white/30 hover:border-white/50"
              >
                ⚙️ Admin Access
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Results */}
      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Organizers Section */}
        {searchQuery && filteredOrganizers.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 text-center">
              Organizers
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredOrganizers.map((organizer) => (
                <div key={organizer.id} className="glass rounded-2xl p-6 shadow-2xl border border-white/20 hover:border-white/40 transition-all">
                  <div className="flex items-center gap-4 mb-4">
                    {organizer.logo ? (
                      <img 
                        src={organizer.logo} 
                        alt={`${typeof organizer.name === 'string' ? organizer.name : 'Organizer'} logo`}
                        className="w-16 h-16 rounded-full object-cover border border-white/20"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20">
                        <span className="text-2xl font-bold text-white">
                          {typeof organizer.name === 'string' ? organizer.name.charAt(0) : 'O'}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-xl font-bold text-white">{typeof organizer.name === 'string' ? organizer.name : 'Organizer'}</h3>
                      <p className="text-gray-400 text-sm">{typeof organizer.email === 'string' ? organizer.email : 'No email'}</p>
                    </div>
                  </div>
                  {organizer.description && typeof organizer.description === 'string' && (
                    <p className="text-gray-300 text-sm mb-4">{organizer.description}</p>
                  )}
                  <div className="text-xs text-blue-400">
                    Created: {new Date(organizer.createdAtISO).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Public Tournaments Section */}
        {searchQuery && filteredTournaments.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 text-center">
              Available Tournaments
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredTournaments.map((tournament) => {
                const organizer = allOrganizers.find(org => org.id === tournament.organizerId)
                return (
                  <Link
                    key={tournament.id}
                    to={`/${organizer?.name || 'unknown'}/${tournament.id}`}
                    className="glass rounded-2xl p-6 shadow-2xl border border-white/20 hover:border-white/40 transition-all group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      {tournament.logo ? (
                        <img 
                          src={tournament.logo} 
                          alt={`${tournament.name} logo`}
                          className="w-16 h-16 rounded-full object-cover border border-white/20 group-hover:border-blue-400/50 transition-colors"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20 group-hover:border-blue-400/50 transition-colors">
                          <span className="text-2xl font-bold text-white">🏆</span>
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-blue-300 transition-colors">
                          {typeof tournament.name === 'string' ? tournament.name : 'Tournament'}
                        </h3>
                        <p className="text-gray-400 text-sm">by {typeof organizer?.name === 'string' ? organizer.name : 'Unknown'}</p>
                      </div>
                    </div>
                    {tournament.location && typeof tournament.location === 'string' && (
                      <div className="flex items-center gap-2 text-gray-300 text-sm mb-4">
                        <span>📍</span>
                        <span>{tournament.location}</span>
                      </div>
                    )}
                    <div className="text-xs text-blue-400">
                      Created: {new Date(tournament.createdAtISO).toLocaleDateString()}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* No Results */}
        {searchQuery && filteredOrganizers.length === 0 && filteredTournaments.length === 0 && (
          <div className="text-center py-12">
            <div className="glass rounded-2xl p-8 max-w-md mx-auto shadow-2xl border border-white/20">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-xl font-bold text-white mb-2">No Results Found</h3>
              <p className="text-gray-400">Try searching for a different organizer or tournament name.</p>
            </div>
          </div>
        )}

        {/* Welcome Message when no search */}
        {!searchQuery && (
          <div className="text-center py-12">
            <div className="glass rounded-2xl p-8 max-w-2xl mx-auto shadow-2xl border border-white/20">
              <div className="text-4xl mb-4">⚽</div>
              <h3 className="text-2xl font-bold text-white mb-4">Welcome to MFTournament</h3>
              <p className="text-gray-300 mb-6">
                Search for organizers and discover available public tournaments. 
                Use the search bar above to find tournaments by organizer name or tournament title.
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                  <span>Search organizers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                  <span>View public tournaments</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  <span>Access admin panel</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-gray-400 py-8 relative z-10">
        <p>Powered by MFTournament - Football Tournament Management Platform</p>
      </div>
    </div>
  )
}

