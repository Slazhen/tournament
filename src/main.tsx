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
                    { path: 'tournaments/:id', element: <PublicTournamentPage /> },
                    { path: 'tournaments/:tournamentId/matches/:matchId', element: <PublicMatchPage /> },
                    { path: 'teams/:teamId', element: <PublicTeamPage /> },
                    { path: 'players/:playerId', element: <PublicPlayerPage /> },
                  ],
                },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
