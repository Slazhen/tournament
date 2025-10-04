import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store'
import { Link } from 'react-router-dom'
import { initializeSuperAdmin } from '../lib/auth'

export default function AdminPage() {
  const { user, isSuperAdmin, isOrganizer, logout } = useAuth()
  const { getOrganizerTeams, getOrganizerTournaments, getAllTeams, getAllTournaments, organizers } = useAppStore()
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize super admin on first load
  useEffect(() => {
    const init = async () => {
      try {
        console.log('Initializing super admin...')
        await initializeSuperAdmin()
        console.log('Super admin initialized successfully')
        setIsInitialized(true)
      } catch (error) {
        console.error('Failed to initialize super admin:', error)
        setIsInitialized(true)
      }
    }
    init()
  }, [])

  // Show all data for super admin, organizer-specific data for organizers
  const teams = isSuperAdmin ? getAllTeams() : getOrganizerTeams()
  const tournaments = isSuperAdmin ? getAllTournaments() : getOrganizerTournaments()

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white">Initializing...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4 text-white">Access Denied</h1>
          <p className="text-gray-400 mb-6">Please log in to access the admin panel</p>
          <Link to="/admin/login" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all text-white">
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-4xl font-bold text-white">Admin Panel</h1>
              {isSuperAdmin && (
                <div className="px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/30 rounded-full">
                  <span className="text-yellow-400 font-semibold text-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                    SUPERADMIN
                  </span>
                </div>
              )}
            </div>
            <p className="text-gray-400">
              Welcome, {user.email} {isSuperAdmin ? '- Full System Access' : '- Organizer Access'}
            </p>
          </div>
          <button
            onClick={logout}
            className="px-6 py-3 rounded-lg glass hover:bg-red-500/20 transition-all border border-red-400/30 text-red-400"
          >
            Logout
          </button>
        </div>

        {/* Super Admin Section */}
        {isSuperAdmin && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Super Admin Controls</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* All Organizers */}
              <div className="glass rounded-2xl p-6 shadow-2xl border border-white/20">
                <h3 className="text-xl font-semibold text-white mb-4">All Organizers</h3>
                <p className="text-gray-400 mb-4">Manage all tournament organizers</p>
                <Link
                  to="/admin/organizers"
                  className="inline-flex items-center px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg transition-all text-blue-400"
                >
                  Manage Organizers
                </Link>
              </div>

              {/* All Tournaments */}
              <div className="glass rounded-2xl p-6 shadow-2xl border border-white/20">
                <h3 className="text-xl font-semibold text-white mb-4">All Tournaments</h3>
                <p className="text-gray-400 mb-4">View and manage all tournaments</p>
                <Link
                  to="/admin/tournaments"
                  className="inline-flex items-center px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 rounded-lg transition-all text-purple-400"
                >
                  Manage Tournaments
                </Link>
              </div>

            </div>
          </div>
        )}

        {/* Organizer Section */}
        {isOrganizer && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Organizer Dashboard</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* My Tournaments */}
              <div className="glass rounded-2xl p-6 shadow-2xl border border-white/20">
                <h3 className="text-xl font-semibold text-white mb-4">My Tournaments</h3>
                <p className="text-gray-400 mb-4">Manage your tournaments</p>
                <Link
                  to="/admin/tournaments"
                  className="inline-flex items-center px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg transition-all text-blue-400"
                >
                  Manage Tournaments
                </Link>
              </div>

              {/* My Teams */}
              <div className="glass rounded-2xl p-6 shadow-2xl border border-white/20">
                <h3 className="text-xl font-semibold text-white mb-4">My Teams</h3>
                <p className="text-gray-400 mb-4">Manage your teams</p>
                <Link
                  to="/admin/teams"
                  className="inline-flex items-center px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 rounded-lg transition-all text-purple-400"
                >
                  Manage Teams
                </Link>
              </div>

              {/* Create New Tournament */}
              <div className="glass rounded-2xl p-6 shadow-2xl border border-white/20">
                <h3 className="text-xl font-semibold text-white mb-4">Create Tournament</h3>
                <p className="text-gray-400 mb-4">Start a new tournament</p>
                <Link
                  to="/admin/tournaments/new"
                  className="inline-flex items-center px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 rounded-lg transition-all text-green-400"
                >
                  Create Tournament
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="glass rounded-2xl p-6 shadow-2xl border border-white/20">
          <h3 className="text-xl font-semibold text-white mb-4">Quick Stats</h3>
          <div className={`grid gap-4 ${isSuperAdmin ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
            {isSuperAdmin && (
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{organizers.length}</div>
                <div className="text-sm text-gray-400">Organizers</div>
              </div>
            )}
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{teams.length}</div>
              <div className="text-sm text-gray-400">Teams</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">{tournaments.length}</div>
              <div className="text-sm text-gray-400">Tournaments</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {tournaments.reduce((acc, t) => acc + (t.matches?.length || 0), 0)}
              </div>
              <div className="text-sm text-gray-400">Matches</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400">
                {teams.reduce((acc, t) => acc + (t.players?.length || 0), 0)}
              </div>
              <div className="text-sm text-gray-400">Players</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}