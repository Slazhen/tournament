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
import NewPublicTournament from './pages/NewPublicTournament.tsx'
import NewPublicTeam from './pages/NewPublicTeam.tsx'
import NewPublicPlayer from './pages/NewPublicPlayer.tsx'
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
    children: [
      { 
        path: 'tournaments/:id', 
        element: <NewPublicTournament />
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
  // New URL structure: /orgname/tournamentid, /orgname/playerid
  {
    path: '/:orgName',
    children: [
      { 
        path: ':tournamentId', 
        element: <NewPublicTournament />
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
    <RouterProvider router={router} />
  </StrictMode>,
)
