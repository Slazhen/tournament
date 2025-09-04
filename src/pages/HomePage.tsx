import { useState, useEffect } from 'react'
import { useAppStore } from '../store'
import { useNavigate } from 'react-router-dom'
import DebugInfo from '../components/DebugInfo'

export default function HomePage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [organizerName, setOrganizerName] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  const navigate = useNavigate()
  
  const { 
    organizers, 
    // currentOrganizerId, 
    createOrganizer, 
    setCurrentOrganizer,
    getCurrentOrganizer,
    getOrganizerTournaments
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  
  // Redirect to last created tournament when organizer is logged in
  useEffect(() => {
    if (currentOrganizer) {
      console.log('HomePage: Organizer logged in, checking tournaments...')
      const tournaments = getOrganizerTournaments()
      console.log('HomePage: Found tournaments:', tournaments.length)
      
      if (tournaments.length > 0) {
        // Sort tournaments by creation date (most recent first)
        const sortedTournaments = [...tournaments].sort((a, b) => 
          new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime()
        )
        const lastTournament = sortedTournaments[0]
        console.log('HomePage: Redirecting to tournament:', lastTournament.id)
        
        // Add a small delay to make the loading state visible
        setTimeout(() => {
          navigate(`/tournaments/${lastTournament.id}`)
        }, 1000)
      } else {
        console.log('HomePage: No tournaments, redirecting to tournaments page')
        // If no tournaments exist, go to tournaments page to create one
        setTimeout(() => {
          navigate('/tournaments')
        }, 1000)
      }
    }
  }, [currentOrganizer, getOrganizerTournaments, navigate])
  
  const handleCreateOrganizer = (e: React.FormEvent) => {
    e.preventDefault()
    if (organizerName.trim() && organizerEmail.trim()) {
      createOrganizer(organizerName.trim(), organizerEmail.trim())
      setOrganizerName('')
      setOrganizerEmail('')
      setShowCreateForm(false)
    }
  }
  
  const handleSelectOrganizer = (organizerId: string) => {
    setCurrentOrganizer(organizerId)
  }

  
  // Show loading state while redirecting
  if (currentOrganizer) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Welcome, {currentOrganizer.name}!</h1>
            <p className="opacity-80">Redirecting to your latest tournament...</p>
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        </div>
        <DebugInfo />
      </div>
    )
  }
  
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Football Stadium Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1629217855633-79a6925d6c47?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8Zm9vdGJhbGwlMjBzdGFkaXVtfGVufDB8fDB8fHww')`,
          filter: 'brightness(0.4) saturate(1.2)',
          backgroundAttachment: 'fixed',
          backgroundSize: 'cover'
        }}
      />
      
      {/* Animated Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60" />
      
      {/* Glass Overlay with Enhanced Blur */}
      <div className="absolute inset-0 backdrop-blur-md bg-black/30" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-3xl p-12 max-w-4xl w-full text-center shadow-2xl border border-white/30 hover-lift backdrop-blur-xl bg-white/5">
          {/* Logo/Title */}
          <div className="mb-8">
            <div className="text-8xl mb-6 animate-float">🏆</div>
            <h1 className="text-6xl font-bold mb-6 text-gradient animate-pulse">
              MFTournament
            </h1>
            <p className="text-2xl opacity-90 mb-8 font-light">
              Football Tournament Management Platform
            </p>
          </div>
          
          {/* Description */}
          <p className="text-lg opacity-80 mb-8 max-w-2xl mx-auto">
            Welcome to MFTournament! Create and manage football tournaments, teams, players, and matches with ease. 
            Get started by selecting or creating an organizer account.
          </p>
          
          {/* Admin Access Button */}
          <div className="mb-8">
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-8 py-4 rounded-xl glass hover:bg-white/10 transition-all text-xl font-semibold border border-white/30 hover:border-white/50"
            >
              ⚙️ Admin Access
            </button>
          </div>
          
          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-2xl p-6 border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 hover-lift bg-gradient-to-br from-green-500/10 to-transparent">
              <div className="text-4xl mb-3 animate-pulse">🏈</div>
              <h3 className="text-lg font-bold mb-2 text-green-300">Tournament Management</h3>
              <p className="text-sm opacity-80 leading-relaxed">Create and manage tournaments with ease</p>
            </div>
            <div className="glass rounded-2xl p-6 border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 hover-lift bg-gradient-to-br from-blue-500/10 to-transparent">
              <div className="text-4xl mb-3 animate-pulse">👥</div>
              <h3 className="text-lg font-bold mb-2 text-blue-300">Team Management</h3>
              <p className="text-sm opacity-80 leading-relaxed">Organize teams and track performance</p>
            </div>
            <div className="glass rounded-2xl p-6 border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 hover-lift bg-gradient-to-br from-purple-500/10 to-transparent">
              <div className="text-4xl mb-3 animate-pulse">⚽</div>
              <h3 className="text-lg font-bold mb-2 text-purple-300">Match Tracking</h3>
              <p className="text-sm opacity-80 leading-relaxed">Real-time match updates and statistics</p>
            </div>
            <div className="glass rounded-2xl p-6 border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 hover-lift bg-gradient-to-br from-yellow-500/10 to-transparent">
              <div className="text-4xl mb-3 animate-pulse">📊</div>
              <h3 className="text-lg font-bold mb-2 text-yellow-300">Player Statistics</h3>
              <p className="text-sm opacity-80 leading-relaxed">Detailed player performance analytics</p>
            </div>
          </div>
          
          {/* Public Access Info */}
          <div className="border-t border-white/30 pt-6">
            <p className="text-sm opacity-70 mb-2">Public tournament pages are available for viewing</p>
            <p className="text-xs opacity-50">Contact organizers for public tournament links</p>
          </div>
        </div>
      </div>
      
      {/* Admin Panel Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="glass rounded-xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6 text-center">Admin Access</h2>
            
            {organizers.length > 0 ? (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4 text-center">Select Organizer</h3>
                <div className="grid gap-3">
                  {organizers.map((organizer) => (
                    <button
                      key={organizer.id}
                      onClick={() => handleSelectOrganizer(organizer.id)}
                      className="p-4 glass rounded-lg hover:bg-white/10 transition-all text-left"
                    >
                      <div className="font-medium">{organizer.name}</div>
                      <div className="text-sm opacity-70">{organizer.email}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <button
                    onClick={() => {
                      setShowCreateForm(false)
                      // Show create form by setting organizers to empty temporarily
                    }}
                    className="w-full px-4 py-2 rounded-md glass hover:bg-white/10 transition-all text-sm"
                  >
                    + Create New Organizer
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateOrganizer} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Organizer Name</label>
                  <input
                    type="text"
                    value={organizerName}
                    onChange={(e) => setOrganizerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                    placeholder="Enter organizer name"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={organizerEmail}
                    onChange={(e) => setOrganizerEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                    placeholder="Enter email address"
                    required
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 px-4 py-2 rounded-md glass hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 rounded-md glass hover:bg-white/10 transition-all font-medium"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      
      <DebugInfo />
    </div>
  )
}

