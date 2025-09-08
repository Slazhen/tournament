import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store'
import { useNavigate } from 'react-router-dom'
import DebugInfo from '../components/DebugInfo'

export default function AdminPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [organizerName, setOrganizerName] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  
  const { 
    organizers, 
    createOrganizer, 
    setCurrentOrganizer,
    getCurrentOrganizer,
    getOrganizerTournaments,
    settings,
    updateSettings
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  
  // Redirect to last created tournament when organizer is logged in
  useEffect(() => {
    if (currentOrganizer) {
      console.log('AdminPage: Organizer logged in, checking tournaments...')
      const tournaments = getOrganizerTournaments()
      console.log('AdminPage: Found tournaments:', tournaments.length)
      
      if (tournaments.length > 0) {
        // Sort tournaments by creation date (most recent first)
        const sortedTournaments = [...tournaments].sort((a, b) => 
          new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime()
        )
        const lastTournament = sortedTournaments[0]
        console.log('AdminPage: Redirecting to tournament:', lastTournament.id)
        
        // Add a small delay to make the loading state visible
        setTimeout(() => {
          navigate(`/tournaments/${lastTournament.id}`)
        }, 1000)
      } else {
        console.log('AdminPage: No tournaments, redirecting to tournaments page')
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

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        updateSettings({ backgroundImage: dataUrl })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveBackground = () => {
    updateSettings({ backgroundImage: undefined })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  // Show loading state while redirecting
  if (currentOrganizer) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-green-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        </div>
        
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center relative z-10 shadow-2xl border border-white/20">
          <div className="mb-8">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center border border-white/20 animate-pulse">
              <span className="text-3xl">⚽</span>
            </div>
            <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Welcome, {currentOrganizer.name}!
            </h1>
            <p className="text-lg opacity-80 text-gray-300">Redirecting to your latest tournament...</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-blue-400"></div>
          </div>
        </div>
        <DebugInfo />
      </div>
    )
  }
  
  return (
    <div className="min-h-[80vh] flex items-center justify-center relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        <div className="absolute bottom-32 right-1/3 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl animate-pulse delay-3000"></div>
      </div>
      
      <div className="glass rounded-2xl p-8 max-w-lg w-full relative z-10 shadow-2xl border border-white/20">
        <div className="text-center mb-8">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center border border-white/20">
              <span className="text-3xl">⚽</span>
            </div>
            <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              MFTournament Admin
            </h1>
            <p className="text-lg opacity-80 text-gray-300">Organizer Login Portal</p>
          </div>
        </div>
        
        {organizers.length > 0 && (
          <div className="mb-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold mb-2 text-white">Select Organizer</h2>
              <p className="text-sm text-gray-400">Choose your account to continue</p>
            </div>
            <div className="grid gap-4">
              {organizers.map((organizer, index) => (
                <button
                  key={organizer.id}
                  onClick={() => handleSelectOrganizer(organizer.id)}
                  className="group p-4 glass rounded-xl hover:bg-white/10 transition-all duration-300 text-left border border-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-white/5"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform duration-300">
                      <span className="text-lg font-bold text-white">
                        {organizer.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-white group-hover:text-blue-300 transition-colors">
                        {organizer.name}
                      </div>
                      <div className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                        {organizer.email}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="text-center">
          <button
            onClick={() => setShowCreateForm(true)}
            className="group relative px-8 py-4 rounded-xl glass hover:bg-white/10 transition-all duration-300 text-lg font-medium border border-white/20 hover:border-white/30 hover:shadow-lg hover:shadow-white/5 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center justify-center gap-2">
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>{organizers.length === 0 ? 'Create First Organizer' : 'Create New Organizer'}</span>
            </div>
          </button>
        </div>
        
        {showCreateForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass rounded-2xl p-8 max-w-md w-full relative shadow-2xl border border-white/20 animate-in fade-in-0 zoom-in-95 duration-300">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center border border-white/20">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Create Organizer</h2>
                <p className="text-gray-400">Set up your tournament management account</p>
              </div>
              
              <form onSubmit={handleCreateOrganizer} className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white mb-2">Organizer Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={organizerName}
                      onChange={(e) => setOrganizerName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all duration-300 text-white placeholder-gray-400"
                      placeholder="Enter organizer name"
                      required
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-white mb-2">Email Address</label>
                  <div className="relative">
                    <input
                      type="email"
                      value={organizerEmail}
                      onChange={(e) => setOrganizerEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all duration-300 text-white placeholder-gray-400"
                      placeholder="Enter email address"
                      required
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all duration-300 border border-white/20 hover:border-white/30 text-white font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 hover:from-blue-500/30 hover:to-purple-500/30 border border-blue-400/30 hover:border-blue-400/50 transition-all duration-300 text-white font-medium hover:shadow-lg hover:shadow-blue-500/20"
                  >
                    Create Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass rounded-2xl p-8 max-w-md w-full relative shadow-2xl border border-white/20 animate-in fade-in-0 zoom-in-95 duration-300">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-xl flex items-center justify-center border border-white/20">
                  <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Settings</h2>
                <p className="text-gray-400">Customize your tournament experience</p>
              </div>
              
              <div className="space-y-6">
                {/* Background Image Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2">Landing Page Background</label>
                  <div className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBackgroundUpload}
                      className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                    />
                    
                    {settings.backgroundImage && (
                      <div className="space-y-2">
                        <div className="text-sm opacity-70">Current background:</div>
                        <div className="relative">
                          <img 
                            src={settings.backgroundImage} 
                            alt="Background preview" 
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <button
                            onClick={handleRemoveBackground}
                            className="absolute top-2 right-2 px-2 py-1 rounded-md bg-red-500/80 hover:bg-red-500 text-white text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Background Tint Slider */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Background Tint: {Math.round(settings.backgroundTint * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.backgroundTint}
                    onChange={(e) => updateSettings({ backgroundTint: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-4 py-2 rounded-md glass hover:bg-white/10 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <DebugInfo />
    </div>
  )
}
