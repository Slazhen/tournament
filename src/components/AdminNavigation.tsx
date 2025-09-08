import { Link, useLocation } from 'react-router-dom'
import { useAppStore } from '../store'
import { useAuth } from '../contexts/AuthContext'

export default function AdminNavigation() {
  const { getCurrentOrganizer, setCurrentOrganizer, settings, updateSettings } = useAppStore()
  const { isSuperAdmin } = useAuth()
  const currentOrganizer = getCurrentOrganizer()
  const location = useLocation()

  if (!currentOrganizer && !isSuperAdmin) {
    return null
  }

  const handleSwitchOrganizer = () => {
    setCurrentOrganizer('')
  }

  const handleThemeToggle = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'bright' : 'dark' })
  }

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10">
      <div className="mx-auto container-max px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: User Info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-4 py-2 glass rounded-lg">
              {isSuperAdmin ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm">
                    S
                  </div>
                  <div>
                    <div className="font-medium text-sm">Logged in as</div>
                    <div className="font-semibold flex items-center gap-2">
                      <span className="px-2 py-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/30 rounded-full text-xs text-yellow-400 font-bold">
                        SUPERADMIN
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                    {currentOrganizer?.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-sm">Logged in as</div>
                    <div className="font-semibold">{currentOrganizer?.name}</div>
                  </div>
                  <button
                    onClick={handleSwitchOrganizer}
                    className="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
                    title="Switch organizer"
                  >
                    <span className="text-lg">🔄</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Center: Navigation Tabs */}
          <nav className="flex items-center gap-1 glass rounded-lg p-1">
            <Link
              to="/tournaments"
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                isActive('/tournaments')
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              🏆 Tournaments
            </Link>
            <Link
              to="/teams"
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                isActive('/teams')
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              👥 Teams
            </Link>
            <Link
              to="/calendar"
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                isActive('/calendar')
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              📅 Calendar
            </Link>
          </nav>

          {/* Right: Home Link and Theme Toggle */}
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all"
            >
              🏠 Home
            </Link>
            <button
              onClick={handleThemeToggle}
              className="p-2 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all"
              title={`Switch to ${settings.theme === 'dark' ? 'bright' : 'dark'} theme`}
            >
              {settings.theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
