import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute.tsx'

import HomePage from './pages/HomePage.tsx'
import AdminPage from './pages/AdminPage.tsx'
import AdminLoginPage from './pages/AdminLoginPage.tsx'
import OrganizersPage from './pages/OrganizersPage.tsx'
import TournamentsPage from './pages/TournamentsPage.tsx'
import TeamsPage from './pages/TeamsPage.tsx'
import CalendarPage from './pages/CalendarPage.tsx'
import TournamentPage from './pages/TournamentPage.tsx'
import TeamPage from './pages/TeamPage.tsx'
import PlayerPage from './pages/PlayerPage.tsx'
import MatchPage from './pages/MatchPage.tsx'
import PublicTournamentPage from './pages/PublicTournamentPage.tsx'
import NewPublicTeam from './pages/NewPublicTeam.tsx'
import NewPublicPlayer from './pages/NewPublicPlayer.tsx'
import PublicMatchPage from './pages/PublicMatchPage.tsx'
import NotFound from './components/NotFound.tsx'

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
            <TournamentPage />
          </ProtectedRoute>
        ) 
      },
      // Original routes for top navigation
      { path: 'tournaments', element: <TournamentsPage /> },
      { path: 'tournaments/:id', element: <TournamentPage /> },
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
