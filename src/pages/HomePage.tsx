import { useState, useEffect } from 'react'
import { useAppStore } from '../store'
import { Link } from 'react-router-dom'
import DebugInfo from '../components/DebugInfo'

export default function HomePage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [organizerName, setOrganizerName] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  
  const { 
    organizers, 
    // currentOrganizerId, 
    createOrganizer, 
    setCurrentOrganizer,
    getCurrentOrganizer
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  
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

  // Countdown timer effect
  useEffect(() => {
    const updateCountdown = () => {
      const launchDate = new Date('2024-12-31T00:00:00').getTime()
      const now = new Date().getTime()
      const distance = launchDate - now

      if (distance > 0) {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24))
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((distance % (1000 * 60)) / 1000)

        const daysEl = document.getElementById('days')
        const hoursEl = document.getElementById('hours')
        const minutesEl = document.getElementById('minutes')
        const secondsEl = document.getElementById('seconds')

        if (daysEl) daysEl.textContent = days.toString().padStart(2, '0')
        if (hoursEl) hoursEl.textContent = hours.toString().padStart(2, '0')
        if (minutesEl) minutesEl.textContent = minutes.toString().padStart(2, '0')
        if (secondsEl) secondsEl.textContent = seconds.toString().padStart(2, '0')
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [])
  
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
      {/* Football Stadium Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1629217855633-79a6925d6c47?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8OHx8Zm9vdGJhbGwlMjBzdGFkaXVtfGVufDB8fDB8fHww')`,
          filter: 'brightness(0.6)'
        }}
      />
      
      {/* Glass Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-12 max-w-4xl w-full text-center">
          {/* Logo/Title */}
          <div className="mb-8">
            <div className="text-6xl mb-4">🏆</div>
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              MFTournament
            </h1>
            <p className="text-xl opacity-90 mb-6">
              Football Tournament Management Platform
            </p>
            
            {/* Construction Badge */}
            <div className="inline-block bg-gradient-to-r from-orange-500 to-red-500 text-white px-8 py-3 rounded-full text-lg font-bold mb-8 animate-pulse">
              🚧 Under Construction 🚧
            </div>
          </div>
          
          {/* Description */}
          <p className="text-lg opacity-80 mb-8 max-w-2xl mx-auto">
            We're building something amazing! MFTournament will be the ultimate platform for managing football tournaments, 
            teams, players, and matches. Get ready for a revolutionary tournament experience.
          </p>
          
          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="glass rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">🏈</div>
              <h3 className="text-lg font-semibold mb-2 text-green-400">Tournament Management</h3>
              <p className="text-sm opacity-80">Create and manage tournaments with ease</p>
            </div>
            <div className="glass rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">👥</div>
              <h3 className="text-lg font-semibold mb-2 text-blue-400">Team Management</h3>
              <p className="text-sm opacity-80">Organize teams and track performance</p>
            </div>
            <div className="glass rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">⚽</div>
              <h3 className="text-lg font-semibold mb-2 text-purple-400">Match Tracking</h3>
              <p className="text-sm opacity-80">Real-time match updates and statistics</p>
            </div>
            <div className="glass rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">📊</div>
              <h3 className="text-lg font-semibold mb-2 text-yellow-400">Player Statistics</h3>
              <p className="text-sm opacity-80">Detailed player performance analytics</p>
            </div>
          </div>
          
          {/* Countdown Timer */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold mb-6 text-yellow-400">🚀 Launch Countdown</h3>
            <div className="flex justify-center gap-4 flex-wrap">
              <div className="glass rounded-lg p-4 min-w-[80px] border border-white/20">
                <div className="text-2xl font-bold text-green-400" id="days">00</div>
                <div className="text-xs uppercase opacity-70">Days</div>
              </div>
              <div className="glass rounded-lg p-4 min-w-[80px] border border-white/20">
                <div className="text-2xl font-bold text-green-400" id="hours">00</div>
                <div className="text-xs uppercase opacity-70">Hours</div>
              </div>
              <div className="glass rounded-lg p-4 min-w-[80px] border border-white/20">
                <div className="text-2xl font-bold text-green-400" id="minutes">00</div>
                <div className="text-xs uppercase opacity-70">Minutes</div>
              </div>
              <div className="glass rounded-lg p-4 min-w-[80px] border border-white/20">
                <div className="text-2xl font-bold text-green-400" id="seconds">00</div>
                <div className="text-xs uppercase opacity-70">Seconds</div>
              </div>
            </div>
          </div>
          
          {/* Contact Info */}
          <div className="border-t border-white/20 pt-8">
            <h3 className="text-xl font-semibold mb-4 text-blue-400">📧 Stay Updated</h3>
            <p className="opacity-80 mb-2">Get notified when we launch!</p>
            <p className="opacity-80 mb-4">Email: info@myfootballtournament.com</p>
            
            <div className="flex justify-center gap-4 text-2xl">
              <a href="#" className="text-blue-400 hover:scale-110 transition-transform" title="Facebook">📘</a>
              <a href="#" className="text-blue-400 hover:scale-110 transition-transform" title="Twitter">🐦</a>
              <a href="#" className="text-pink-400 hover:scale-110 transition-transform" title="Instagram">📷</a>
              <a href="#" className="text-blue-600 hover:scale-110 transition-transform" title="LinkedIn">💼</a>
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

