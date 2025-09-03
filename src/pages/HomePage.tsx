import { useState } from 'react'
import { useAppStore } from '../store'
import { Link } from 'react-router-dom'
import DebugInfo from '../components/DebugInfo'

export default function HomePage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [organizerName, setOrganizerName] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  
  const { 
    organizers, 
    currentOrganizerId, 
    createOrganizer, 
    setCurrentOrganizer,
    getCurrentOrganizer,
    getAllTournaments,
    settings
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const allTournaments = getAllTournaments()
  const exampleTournament = allTournaments.length > 0 ? allTournaments[0] : null
  
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
  
  if (currentOrganizer) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Welcome, {currentOrganizer.name}!</h1>
            <p className="opacity-80">You're now in your organizer space</p>
          </div>
          
          <div className="grid gap-4">
            <Link
              to="/teams"
              className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all text-lg font-medium"
            >
              👥 Manage Teams
            </Link>
            
            <Link
              to="/tournaments"
              className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all text-lg font-medium"
            >
              🏆 Manage Tournaments
            </Link>
            
            <Link
              to="/calendar"
              className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all text-lg font-medium"
            >
              📅 View Calendar
            </Link>
            
            <button
              onClick={() => setCurrentOrganizer('')}
              className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all text-lg font-medium opacity-70 hover:opacity-100"
            >
              🔄 Switch Organizer
            </button>
          </div>
        </div>
        <DebugInfo />
      </div>
    )
  }
  
  return (
    <div className="min-h-screen relative">
      {/* Background Image or Default Football Field */}
      {settings.backgroundImage ? (
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${settings.backgroundImage})`,
            filter: `brightness(${settings.backgroundTint})`
          }}
        />
      ) : (
        <>
          {/* Default Football Field Background */}
          <div 
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(135deg, #0f4c3a 0%, #1a5a47 25%, #0f4c3a 50%, #1a5a47 75%, #0f4c3a 100%),
                repeating-linear-gradient(
                  90deg,
                  transparent 0px,
                  transparent 98px,
                  rgba(255,255,255,0.15) 100px,
                  rgba(255,255,255,0.15) 102px
                ),
                repeating-linear-gradient(
                  0deg,
                  transparent 0px,
                  transparent 48px,
                  rgba(255,255,255,0.15) 50px,
                  rgba(255,255,255,0.15) 52px
                )
              `,
              filter: 'brightness(0.6)'
            }}
          />
          
          {/* Football Field Lines Overlay */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: `
                linear-gradient(90deg, transparent 0%, transparent 49%, white 50%, transparent 51%),
                linear-gradient(0deg, transparent 0%, transparent 49%, white 50%, transparent 51%),
                radial-gradient(circle at 50% 50%, transparent 0%, transparent 8%, white 8.5%, transparent 9%)
              `,
              backgroundSize: '100% 100%, 100% 100%, 100% 100%'
            }}
          />
        </>
      )}
      
      {/* Glass Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-12 max-w-2xl w-full text-center">
          {/* Logo/Title */}
          <div className="mb-8">
            <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              MFTournament
            </h1>
            <p className="text-xl opacity-90">
              Create your football tournament easy and customize it like you want
            </p>
          </div>
          
          {/* Main Actions */}
          <div className="grid gap-6 mb-8">
            <Link
              to="/admin"
              className="px-8 py-4 rounded-xl glass hover:bg-white/10 transition-all text-xl font-semibold bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30"
            >
              🏆 Go to Admin Panel
            </Link>
            
            {exampleTournament ? (
              <Link
                to={`/public/tournaments/${exampleTournament.id}`}
                className="px-8 py-4 rounded-xl glass hover:bg-white/10 transition-all text-xl font-semibold bg-gradient-to-r from-green-500/20 to-blue-500/20 border border-green-500/30"
              >
                👀 View Example Tournament
              </Link>
            ) : (
              <div className="px-8 py-4 rounded-xl glass text-xl font-semibold bg-gradient-to-r from-gray-500/20 to-gray-500/20 border border-gray-500/30 opacity-50">
                👀 No Tournaments Available
              </div>
            )}
          </div>
          
          {/* Features */}
          <div className="grid md:grid-cols-3 gap-4 text-sm opacity-80">
            <div className="flex items-center justify-center gap-2">
              <span className="text-green-400">⚽</span>
              <span>Easy Setup</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-blue-400">🎨</span>
              <span>Customizable</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-purple-400">📊</span>
              <span>Live Statistics</span>
            </div>
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

