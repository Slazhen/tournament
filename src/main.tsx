import { StrictMode, Suspense, lazy } from 'react'
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
const HomePage = lazy(() => import('./pages/HomePage.tsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.tsx'))
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage.tsx'))
const OrganizersPage = lazy(() => import('./pages/OrganizersPage.tsx'))
const TournamentsPage = lazy(() => import('./pages/TournamentsPage.tsx'))
const CreateTournamentPage = lazy(() => import('./pages/CreateTournamentPage.tsx'))
const TournamentSettingsPage = lazy(() => import('./pages/TournamentSettingsPage.tsx'))
const TeamsPage = lazy(() => import('./pages/TeamsPage.tsx'))
const CalendarPage = lazy(() => import('./pages/CalendarPage.tsx'))
const TournamentPage = lazy(() => import('./pages/TournamentPage.tsx'))
const TeamPage = lazy(() => import('./pages/TeamPage.tsx'))
const PlayerPage = lazy(() => import('./pages/PlayerPage.tsx'))
const MatchPage = lazy(() => import('./pages/MatchPage.tsx'))
const PublicTournamentPage = lazy(() => import('./pages/PublicTournamentPage.tsx'))
const NewPublicTeam = lazy(() => import('./pages/NewPublicTeam.tsx'))
const NewPublicPlayer = lazy(() => import('./pages/NewPublicPlayer.tsx'))
const PublicMatchPage = lazy(() => import('./pages/PublicMatchPage.tsx'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'admin/login', element: <AdminLoginPage /> },
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
      // Original routes for top navigation
      { path: 'tournaments', element: <TournamentsPage /> },
      { path: 'tournaments/new', element: <CreateTournamentPage /> },
      { path: 'tournaments/:id', element: <TournamentPage /> },
      { path: 'tournaments/:id/settings', element: <TournamentSettingsPage /> },
      { path: 'tournaments/:tournamentId/matches/:matchId', element: <MatchPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'teams/:teamId', element: <TeamPage /> },
      { path: 'players/:playerId', element: <PlayerPage /> },
      { path: 'calendar', element: <CalendarPage /> },
    ],
  },
  {
    path: '/public',
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
    children: [
      { 
        path: ':tournamentSlug', 
        element: <PublicTournamentPage />
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
