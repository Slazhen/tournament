import { Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from './store'
import { useEffect } from 'react'
import AdminNavigation from './components/AdminNavigation'
import { useSignedIn } from './contexts/AuthContext'
import { isSignedIn } from './lib/api'

/**
 * The shell around every page.
 *
 * A visitor used to get a bar of their own here — the name, a "Home" link and a
 * theme switch — which sat on top of the landing page's own header and offered
 * nothing: "Home" while standing on the home page, and a light theme nobody
 * asked for. Signed out there is now no chrome at all, and the landing page
 * owns its full width.
 */
function App() {
  const loadOrganizers = useAppStore((s) => s.loadOrganizers)
  const location = useLocation()

  // Only for somebody signed in. `organizerService.getAll` follows a token to
  // /admin/organizers and a visitor without one to /public/organizers, and the
  // landing page - the only page under this shell a visitor sees - already
  // reads that list for itself. So for a visitor this was a second copy of a
  // request the page had already made, on the slowest part of the load.
  useEffect(() => {
    if (!isSignedIn()) return
    void loadOrganizers()
  }, [loadOrganizers])

  const signedIn = useSignedIn()

  // The landing page brings its own header and footer, edge to edge.
  if (location.pathname === '/' && !signedIn) {
    return <Outlet />
  }

  return (
    <div className="min-h-full">
      {signedIn && <AdminNavigation />}

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
