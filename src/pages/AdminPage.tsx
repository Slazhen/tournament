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
      const tournaments = getOrganizerTournaments()
      if (tournaments.length > 0) {
        // Sort tournaments by creation date (most recent first)
        const sortedTournaments = [...tournaments].sort((a, b) => 
          new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime()
        )
        const lastTournament = sortedTournaments[0]
        navigate(`/tournaments/${lastTournament.id}`)
      } else {
        // If no tournaments exist, go to tournaments page to create one
        navigate('/tournaments')
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
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="glass rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">MFTournament Admin</h1>
          <p className="opacity-80">Organizer Login</p>
        </div>
        
        {organizers.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 text-center">Select Organizer</h2>
            <div className="grid gap-3">
              {organizers.map((organizer) => (
                <button
                  key={organizer.id}
                  onClick={() => handleSelectOrganizer(organizer.id)}
                  className="p-3 glass rounded-lg hover:bg-white/10 transition-all text-left"
                >
                  <div className="font-medium">{organizer.name}</div>
                  <div className="text-sm opacity-70">{organizer.email}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="text-center">
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all text-lg font-medium"
          >
            {organizers.length === 0 ? 'Create First Organizer' : 'Create New Organizer'}
          </button>
        </div>
        
        {showCreateForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="glass rounded-xl p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4 text-center">Create Organizer</h2>
              
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
            </div>
          </div>
        )}
        
        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="glass rounded-xl p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4 text-center">Settings</h2>
              
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
