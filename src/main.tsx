import { StrictMode, Suspense, lazy } from 'react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute.tsx'

import NotFound from './components/NotFound.tsx'

/**
 * Every page is a separate chunk.
 *
 * The bundle used to be one 583 KB file, so a visitor opening a public
 * tournament also downloaded the whole admin area — the 2.5k-line tournament
 * editor, the match editor, the organizer screens — and parsed all of it before
 * anything rendered. Now a route pulls only its own code.
 */

const RELOAD_FLAG = 'chunk_reloaded_at'

/**
 * A lazy page that survives a deploy.
 *
 * Chunk file names carry a content hash, so a deploy replaces them: a tab that
 * was open beforehand still holds the old index file, and the moment someone
 * navigates it asks for a chunk that no longer exists. The result was a bare
 * "Failed to fetch dynamically imported module" screen, and the only way out
 * was for the user to know to reload.
 *
 * The page reloads itself instead — once, guarded, so a genuinely broken build
 * cannot put the browser in a loop.
 */
function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const page = await load()
      sessionStorage.removeItem(RELOAD_FLAG)
      return page
    } catch (error) {
      const lastReload = Number(sessionStorage.getItem(RELOAD_FLAG) || 0)
      const reloadedRecently = Date.now() - lastReload < 30_000

      if (!reloadedRecently) {
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
        window.location.reload()
        // Never resolves: the reload takes over.
        return new Promise<never>(() => {})
      }

      throw error
    }
  })
}
const HomePage = lazyPage(() => import('./pages/HomePage.tsx'))
const AdminPage = lazyPage(() => import('./pages/AdminPage.tsx'))
const AdminLoginPage = lazyPage(() => import('./pages/AdminLoginPage.tsx'))
const ForgotPasswordPage = lazyPage(() => import('./pages/ForgotPasswordPage.tsx'))
const ResetPasswordPage = lazyPage(() => import('./pages/ResetPasswordPage.tsx'))
const AuditLogPage = lazyPage(() => import('./pages/AuditLogPage.tsx'))
const ClaimTeamPage = lazyPage(() => import('./pages/ClaimTeamPage.tsx'))
const MyClubPage = lazyPage(() => import('./pages/MyClubPage.tsx'))
const OrganizersPage = lazyPage(() => import('./pages/OrganizersPage.tsx'))
const TournamentsPage = lazyPage(() => import('./pages/TournamentsPage.tsx'))
const CreateTournamentPage = lazyPage(() => import('./pages/CreateTournamentPage.tsx'))
const TournamentSettingsPage = lazyPage(() => import('./pages/TournamentSettingsPage.tsx'))
const TeamsPage = lazyPage(() => import('./pages/TeamsPage.tsx'))
const CalendarPage = lazyPage(() => import('./pages/CalendarPage.tsx'))
const TournamentPage = lazyPage(() => import('./pages/TournamentPage.tsx'))
const TeamPage = lazyPage(() => import('./pages/TeamPage.tsx'))
const PlayerPage = lazyPage(() => import('./pages/PlayerPage.tsx'))
const MatchPage = lazyPage(() => import('./pages/MatchPage.tsx'))
const PublicTournamentPage = lazyPage(() => import('./pages/PublicTournamentPage.tsx'))
const NewPublicTeam = lazyPage(() => import('./pages/NewPublicTeam.tsx'))
const NewPublicPlayer = lazyPage(() => import('./pages/NewPublicPlayer.tsx'))
const PublicMatchPage = lazyPage(() => import('./pages/PublicMatchPage.tsx'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'admin/login', element: <AdminLoginPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      // An invitation to run a club: opened from a link somebody was sent.
      { path: 'join', element: <ClaimTeamPage /> },
      { path: 'my-club', element: <MyClubPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        path: 'admin/changes',
        element: (
          <ProtectedRoute requireSuperAdmin>
            <AuditLogPage />
          </ProtectedRoute>
        ),
      },
      { path: 'adminslazhen', element: <AdminLoginPage /> }, // Special route for super admin
      { 
        path: 'admin', 
        element: (
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/organizers', 
        element: (
          <ProtectedRoute requireSuperAdmin>
            <OrganizersPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/tournaments', 
        element: (
          <ProtectedRoute>
            <TournamentsPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/tournaments/:id', 
        element: (
          <ProtectedRoute>
            <TournamentPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/:orgSlug/:tournamentSlug', 
        element: (
          <ProtectedRoute>
            <TournamentPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/tournaments/:tournamentId/matches/:matchId', 
        element: (
          <ProtectedRoute>
            <MatchPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/:orgSlug/:tournamentSlug/matches/:matchId', 
        element: (
          <ProtectedRoute>
            <MatchPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/teams', 
        element: (
          <ProtectedRoute>
            <TeamsPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/teams/:teamId', 
        element: (
          <ProtectedRoute>
            <TeamPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/players/:playerId', 
        element: (
          <ProtectedRoute>
            <PlayerPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/calendar', 
        element: (
          <ProtectedRoute>
            <CalendarPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/tournaments/new', 
        element: (
          <ProtectedRoute>
            <CreateTournamentPage />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'admin/tournaments/:id/settings', 
        element: (
          <ProtectedRoute>
            <TournamentSettingsPage />
          </ProtectedRoute>
        ) 
      },
      // The addresses the admin bar links to. Protected like their /admin
      // equivalents: what stood in for a gate here was the "No organizer
      // selected" screen inside each page, and that screen now also means
      // "signed in as the super admin", so it stopped being a gate at all.
      { path: 'tournaments', element: <ProtectedRoute><TournamentsPage /></ProtectedRoute> },
      { path: 'tournaments/new', element: <ProtectedRoute><CreateTournamentPage /></ProtectedRoute> },
      { path: 'tournaments/:id', element: <ProtectedRoute><TournamentPage /></ProtectedRoute> },
      {
        path: 'tournaments/:id/settings',
        element: <ProtectedRoute><TournamentSettingsPage /></ProtectedRoute>,
      },
      {
        path: 'tournaments/:tournamentId/matches/:matchId',
        element: <ProtectedRoute><MatchPage /></ProtectedRoute>,
      },
      { path: 'teams', element: <ProtectedRoute><TeamsPage /></ProtectedRoute> },
      { path: 'teams/:teamId', element: <ProtectedRoute><TeamPage /></ProtectedRoute> },
      { path: 'players/:playerId', element: <ProtectedRoute><PlayerPage /></ProtectedRoute> },
      { path: 'calendar', element: <ProtectedRoute><CalendarPage /></ProtectedRoute> },
    ],
  },
  {
    path: '/public',
    errorElement: <RouteError />,
    children: [
      { 
        path: 'tournaments/:tournamentId/matches/:matchId', 
        element: <PublicMatchPage />
      },
      { 
        path: 'tournaments/:id', 
        element: <PublicTournamentPage />
      },
      { 
        path: 'tournaments/:orgName/:tournamentId', 
        element: <PublicTournamentPage />
      },
      { 
        path: 'teams/:id', 
        element: <NewPublicTeam />
      },
      { 
        path: 'players/:id', 
        element: <NewPublicPlayer />
      },
    ],
  },
  // New URL structure: /orgSlug/tournamentSlug, /orgSlug/players/playerId
  {
    path: '/:orgSlug',
    errorElement: <RouteError />,
    children: [
      { 
        path: ':tournamentSlug', 
        element: <PublicTournamentPage />
      },
      {
        // A named season: /homebush_futsal/homebush_futsal_premier_league/2025.
        // The two-segment route above still resolves an old tournament link or a
        // whole competition, and sends the browser here.
        path: ':seriesSlug/:seasonSlug',
        element: <PublicTournamentPage />,
      },
      { 
        path: ':tournamentSlug/matches/:matchId', 
        element: <PublicMatchPage />
      },
      { 
        path: 'players/:playerId', 
        element: <NewPublicPlayer />
      },
    ],
  },
  // Catch-all route for debugging
  {
    path: '*',
    element: <NotFound />,
  },
])

/**
 * What a visitor sees when a route throws.
 *
 * Without this React Router renders its own developer screen — stack trace,
 * its "Hey developer" screen — to whoever happens to be looking at the site.
 */
function RouteError() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center border border-white/20">
        <h1 className="text-2xl font-bold mb-2 text-white">Something went wrong</h1>
        <p className="opacity-70 mb-6 text-gray-300">
          This page failed to load. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all text-white border border-white/20"
        >
          Reload
        </button>
      </div>
    </div>
  )
}

/** Shown for the moment a route's chunk is in flight. */
function PageLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Suspense fallback={<PageLoading />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  </StrictMode>,
)
