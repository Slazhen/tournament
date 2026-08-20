import { Link, Outlet } from 'react-router-dom'
import { useAppStore } from './store'
import { useEffect } from 'react'
import AdminNavigation from './components/AdminNavigation'
import { useAuth } from './contexts/AuthContext'
import { isSignedIn } from './lib/api'

function App() {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  // const currentOrganizerId = useAppStore((s) => s.currentOrganizerId)
  const getCurrentOrganizer = useAppStore((s) => s.getCurrentOrganizer)

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


  const { user, isLoading } = useAuth()

  // While the session is being verified we already know a token is stored, so
  // show the admin bar straight away. Deciding purely on loaded data made the
  // header flip from the public version to the admin one on every page load.
  const showAdminNavigation = Boolean(user) || Boolean(currentOrganizer) || (isLoading && isSignedIn())

  return (
    <div className="min-h-full">
      {showAdminNavigation ? (
        <AdminNavigation />
      ) : (
        <>
          <header className="sticky top-0 z-50 glass-header">
            <div className="mx-auto container-max px-6 py-6 flex items-center justify-between">
              <div className="font-semibold tracking-wide text-lg">MFTournament</div>
              
              <nav className="flex items-center gap-4 text-base">
                <Link to="/" className="opacity-90 hover:opacity-100 transition-opacity">Home</Link>
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
        </>
      )}
      
      <main className="mx-auto container-max px-4 py-6">
        <Outlet />
      </main>
      
      <footer className="mx-auto container-max px-4 py-8 text-xs opacity-70">
        MFTournament — tournament management for local football and futsal.
      </footer>
    </div>
  )
}

export default App
