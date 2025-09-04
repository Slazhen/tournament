import { Link, Outlet } from 'react-router-dom'
import { useAppStore } from './store'
import { useEffect } from 'react'

function App() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  // const currentOrganizerId = useAppStore((s) => s.currentOrganizerId)
  const getCurrentOrganizer = useAppStore((s) => s.getCurrentOrganizer)
  const setCurrentOrganizer = useAppStore((s) => s.setCurrentOrganizer)

  const currentOrganizer = getCurrentOrganizer()
  const loadOrganizers = useAppStore((s) => s.loadOrganizers)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
  }, [settings])

  useEffect(() => {
    // Load organizers from AWS when app starts
    loadOrganizers()
  }, [loadOrganizers])

  const handleThemeToggle = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'bright' : 'dark' })
  }

  const handleSwitchOrganizer = () => {
    setCurrentOrganizer('')
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 glass">
        <div className="mx-auto container-max px-6 py-6 flex items-center gap-4">
          <div className="font-semibold tracking-wide text-lg">MFTournament</div>
          
          {/* Current Organizer Display */}
          {currentOrganizer && (
            <div className="flex items-center gap-2 px-3 py-1 glass rounded-lg">
              <span className="text-sm opacity-80">Organizer:</span>
              <span className="font-medium">{currentOrganizer.name}</span>
              <button
                onClick={handleSwitchOrganizer}
                className="text-xs opacity-60 hover:opacity-100 transition-opacity"
                title="Switch organizer"
              >
                🔄
              </button>
            </div>
          )}
          
          <nav className="ml-auto flex items-center gap-4 text-base">
            <Link to="/" className="opacity-90 hover:opacity-100 transition-opacity">Home</Link>
            {currentOrganizer && (
              <>
                <Link to="/tournaments" className="opacity-90 hover:opacity-100 transition-opacity">Tournaments</Link>
                <Link to="/teams" className="opacity-90 hover:opacity-100 transition-opacity">Teams</Link>
                <Link to="/calendar" className="opacity-90 hover:opacity-100 transition-opacity">Calendar</Link>
              </>
            )}
          </nav>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleThemeToggle}
              className="px-4 py-2 rounded-md glass text-base"
              title={`Switch to ${settings.theme === 'dark' ? 'bright' : 'dark'} theme`}
            >
              {settings.theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>
      
      <main className="mx-auto container-max px-4 py-6">
        <Outlet />
      </main>
      
      <footer className="mx-auto container-max px-4 py-8 text-xs opacity-70">
        Local-first. Export to GitHub Pages when ready.
      </footer>
    </div>
  )
}

export default App
