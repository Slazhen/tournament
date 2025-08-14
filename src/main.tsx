import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

import HomePage from './pages/HomePage.tsx'
import TournamentsPage from './pages/TournamentsPage.tsx'
import TeamsPage from './pages/TeamsPage.tsx'
import CalendarPage from './pages/CalendarPage.tsx'
import TournamentPage from './pages/TournamentPage.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'tournaments', element: <TournamentsPage /> },
      { path: 'tournaments/:id', element: <TournamentPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
