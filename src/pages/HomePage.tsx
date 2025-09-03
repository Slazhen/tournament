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
      
      {/* Floating Particles Effect */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}
      </div>
      
      {/* Glass Overlay with Enhanced Blur */}
      <div className="absolute inset-0 backdrop-blur-md bg-black/30" />
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-3xl p-12 max-w-5xl w-full text-center shadow-2xl border border-white/30 hover-lift backdrop-blur-xl bg-white/5">
          {/* Logo/Title */}
          <div className="mb-8">
            <div className="text-8xl mb-6 animate-float">🏆</div>
            <h1 className="text-6xl font-bold mb-6 text-gradient animate-pulse">
              MFTournament
            </h1>
            <p className="text-2xl opacity-90 mb-8 font-light">
              Football Tournament Management Platform
            </p>
            
            {/* Construction Badge */}
            <div className="inline-block bg-gradient-to-r from-orange-500 via-red-500 to-orange-500 text-white px-10 py-4 rounded-full text-xl font-bold mb-8 animate-pulse shadow-lg border border-orange-300/30">
              🚧 Under Construction 🚧
            </div>
          </div>
          
          {/* Description */}
          <p className="text-lg opacity-80 mb-8 max-w-2xl mx-auto">
            We're building something amazing! MFTournament will be the ultimate platform for managing football tournaments, 
            teams, players, and matches. Get ready for a revolutionary tournament experience.
          </p>
          
          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            <div className="glass rounded-2xl p-8 border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 hover-lift bg-gradient-to-br from-green-500/10 to-transparent">
              <div className="text-5xl mb-4 animate-pulse">🏈</div>
              <h3 className="text-xl font-bold mb-3 text-green-300">Tournament Management</h3>
              <p className="text-sm opacity-80 leading-relaxed">Create and manage tournaments with ease</p>
            </div>
            <div className="glass rounded-2xl p-8 border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 hover-lift bg-gradient-to-br from-blue-500/10 to-transparent">
              <div className="text-5xl mb-4 animate-pulse">👥</div>
              <h3 className="text-xl font-bold mb-3 text-blue-300">Team Management</h3>
              <p className="text-sm opacity-80 leading-relaxed">Organize teams and track performance</p>
            </div>
            <div className="glass rounded-2xl p-8 border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 hover-lift bg-gradient-to-br from-purple-500/10 to-transparent">
              <div className="text-5xl mb-4 animate-pulse">⚽</div>
              <h3 className="text-xl font-bold mb-3 text-purple-300">Match Tracking</h3>
              <p className="text-sm opacity-80 leading-relaxed">Real-time match updates and statistics</p>
            </div>
            <div className="glass rounded-2xl p-8 border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 hover-lift bg-gradient-to-br from-yellow-500/10 to-transparent">
              <div className="text-5xl mb-4 animate-pulse">📊</div>
              <h3 className="text-xl font-bold mb-3 text-yellow-300">Player Statistics</h3>
              <p className="text-sm opacity-80 leading-relaxed">Detailed player performance analytics</p>
            </div>
          </div>
          
          {/* Countdown Timer */}
          <div className="mb-12">
            <h3 className="text-3xl font-bold mb-8 text-yellow-300 animate-pulse">🚀 Launch Countdown</h3>
            <div className="flex justify-center gap-6 flex-wrap">
              <div className="glass rounded-2xl p-6 min-w-[100px] border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 bg-gradient-to-br from-green-500/20 to-transparent">
                <div className="text-4xl font-bold text-green-300 animate-pulse" id="days">00</div>
                <div className="text-sm uppercase opacity-80 font-semibold">Days</div>
              </div>
              <div className="glass rounded-2xl p-6 min-w-[100px] border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 bg-gradient-to-br from-blue-500/20 to-transparent">
                <div className="text-4xl font-bold text-blue-300 animate-pulse" id="hours">00</div>
                <div className="text-sm uppercase opacity-80 font-semibold">Hours</div>
              </div>
              <div className="glass rounded-2xl p-6 min-w-[100px] border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 bg-gradient-to-br from-purple-500/20 to-transparent">
                <div className="text-4xl font-bold text-purple-300 animate-pulse" id="minutes">00</div>
                <div className="text-sm uppercase opacity-80 font-semibold">Minutes</div>
              </div>
              <div className="glass rounded-2xl p-6 min-w-[100px] border border-white/30 hover:border-white/50 transition-all duration-500 hover:scale-110 bg-gradient-to-br from-yellow-500/20 to-transparent">
                <div className="text-4xl font-bold text-yellow-300 animate-pulse" id="seconds">00</div>
                <div className="text-sm uppercase opacity-80 font-semibold">Seconds</div>
              </div>
            </div>
          </div>
          
          {/* Contact Info */}
          <div className="border-t border-white/30 pt-10">
            <h3 className="text-2xl font-bold mb-6 text-blue-300 animate-pulse">📧 Stay Updated</h3>
            <p className="text-lg opacity-90 mb-3 font-light">Get notified when we launch!</p>
            <p className="text-lg opacity-90 mb-8 font-medium text-blue-200">Email: info@myfootballtournament.com</p>
            
            <div className="flex justify-center gap-8 text-3xl">
              <a href="#" className="text-blue-400 hover:scale-125 transition-all duration-300 hover:text-blue-300" title="Facebook">📘</a>
              <a href="#" className="text-blue-400 hover:scale-125 transition-all duration-300 hover:text-blue-300" title="Twitter">🐦</a>
              <a href="#" className="text-pink-400 hover:scale-125 transition-all duration-300 hover:text-pink-300" title="Instagram">📷</a>
              <a href="#" className="text-blue-600 hover:scale-125 transition-all duration-300 hover:text-blue-500" title="LinkedIn">💼</a>
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

