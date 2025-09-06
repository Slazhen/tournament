import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

import HomePage from './pages/HomePage.tsx'
import AdminPage from './pages/AdminPage.tsx'
import TournamentsPage from './pages/TournamentsPage.tsx'
import TeamsPage from './pages/TeamsPage.tsx'
import CalendarPage from './pages/CalendarPage.tsx'
import TournamentPage from './pages/TournamentPage.tsx'
import TeamPage from './pages/TeamPage.tsx'
import PlayerPage from './pages/PlayerPage.tsx'
import MatchPage from './pages/MatchPage.tsx'
import PublicTournamentPage from './pages/PublicTournamentPage.tsx'
import PublicTeamPage from './pages/PublicTeamPage.tsx'
import PublicPlayerPage from './pages/PublicPlayerPage.tsx'
import PublicMatchPage from './pages/PublicMatchPage.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import NotFound from './components/NotFound.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'admin', element: <AdminPage /> },
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
    element: <App />,
    children: [
      { 
        path: 'tournaments/:id', 
        element: (
          <ErrorBoundary>
            <PublicTournamentPage />
          </ErrorBoundary>
        )
      },
      { 
        path: 'tournaments/:tournamentId/matches/:matchId', 
        element: (
          <ErrorBoundary>
            <PublicMatchPage />
          </ErrorBoundary>
        )
      },
      { 
        path: 'teams/:teamId', 
        element: (
          <ErrorBoundary>
            <PublicTeamPage />
          </ErrorBoundary>
        )
      },
      { 
        path: 'players/:playerId', 
        element: (
          <ErrorBoundary>
            <PublicPlayerPage />
          </ErrorBoundary>
        )
      },
    ],
  },
  // New URL structure: /orgname/tournamentid, /orgname/playerid
  {
    path: '/:orgName',
    element: <App />,
    children: [
      { 
        path: ':tournamentId', 
        element: (
          <ErrorBoundary>
            <PublicTournamentPage />
          </ErrorBoundary>
        )
      },
      { 
        path: 'players/:playerId', 
        element: (
          <ErrorBoundary>
            <PublicPlayerPage />
          </ErrorBoundary>
        )
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
    <RouterProvider router={router} />
  </StrictMode>,
)
