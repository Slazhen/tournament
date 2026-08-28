import { StrictMode, Suspense, lazy } from 'react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useParams } from 'react-router-dom'
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
const LoginPage = lazyPage(() => import('./pages/LoginPage.tsx'))
const ForgotPasswordPage = lazyPage(() => import('./pages/ForgotPasswordPage.tsx'))
const ResetPasswordPage = lazyPage(() => import('./pages/ResetPasswordPage.tsx'))
const AuditLogPage = lazyPage(() => import('./pages/AuditLogPage.tsx'))
const ClaimTeamPage = lazyPage(() => import('./pages/ClaimTeamPage.tsx'))
const MyClubPage = lazyPage(() => import('./pages/MyClubPage.tsx'))
const ClubPlayerPage = lazyPage(() => import('./pages/ClubPlayerPage.tsx'))
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
// Two versions of these pages lived in the tree. The ones the router used
// showed a club's crest and squad and nothing else, and found a player by
// pulling every team into the browser through a service that follows a
// signed-in user to /admin/teams. These read the purpose-built public
// endpoints and show what a visitor comes for: the matches and the numbers.
const PublicTeamPage = lazyPage(() => import('./pages/PublicTeamPage.tsx'))
const PublicPlayerPage = lazyPage(() => import('./pages/PublicPlayerPage.tsx'))
const PublicMatchPage = lazyPage(() => import('./pages/PublicMatchPage.tsx'))

/**
 * Where an /admin address goes now.
 *
 * The word is gone from the site's URLs: the panel is /dashboard, the rest kept
 * their own names one level up, and the slug form /admin/:orgSlug/:tournamentSlug
 * became /tournaments/:orgSlug/:tournamentSlug because the two-segment address
 * belongs to the public page. Anything under /admin that is not one of the
 * sections below is therefore that slug pair.
 */
const MOVED_SECTIONS = new Set([
  'login',
  'tournaments',
  'teams',
  'players',
  'calendar',
  'organizers',
  'changes',
])

function LegacyAdminRoute() {
  const rest = (useParams()['*'] ?? '').replace(/^\/+/, '')
  const { search, hash } = useLocation()
  const section = rest.split('/')[0]

  const path = !rest
    ? '/dashboard'
    : MOVED_SECTIONS.has(section)
      ? `/${rest}`
      : `/tournaments/${rest}`

  return <Navigate to={`${path}${search}${hash}`} replace />
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },

      /* ---------- Open to anyone ---------- */
      // One door for everybody, organiser, super admin and club manager alike.
      // The old /admin/login is answered below, because it is in bookmarks and
      // in messages people were sent.
      { path: 'login', element: <LoginPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      // An invitation to run a club: opened from a link somebody was sent.
      { path: 'join', element: <ClaimTeamPage /> },

      /* ---------- The club manager's own screens ---------- */
      { path: 'my-club', element: <MyClubPage /> },
      // A player of a club this account runs. Separate from /players/:id, which
      // is the organiser's screen and reads the organiser's store; this one
      // reads /manager/overview, so a coach with no organizer can open it.
      {
        path: 'my-club/players/:playerId',
        element: (
          <ProtectedRoute>
            <ClubPlayerPage />
          </ProtectedRoute>
        ),
      },

      /* ---------- The organiser's screens ----------
         Behind requireOrganizer, not merely behind a session. Being signed in
         was the whole gate, so a club manager arriving on one of these - a
         bookmark, a link, the address bar - got the organiser's panel counting
         zero competitions and zero clubs, a screen they should not know exists.
         The server refuses their data either way; this is about what the site
         admits to having. */
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute requireOrganizer>
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organizers',
        element: (
          <ProtectedRoute requireSuperAdmin>
            <OrganizersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'changes',
        element: (
          <ProtectedRoute requireSuperAdmin>
            <AuditLogPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'tournaments',
        element: <ProtectedRoute requireOrganizer><TournamentsPage /></ProtectedRoute>,
      },
      {
        path: 'tournaments/new',
        element: <ProtectedRoute requireOrganizer><CreateTournamentPage /></ProtectedRoute>,
      },
      {
        path: 'tournaments/:id',
        element: <ProtectedRoute requireOrganizer><TournamentPage /></ProtectedRoute>,
      },
      {
        path: 'tournaments/:id/settings',
        element: <ProtectedRoute requireOrganizer><TournamentSettingsPage /></ProtectedRoute>,
      },
      {
        path: 'tournaments/:tournamentId/matches/:matchId',
        element: <ProtectedRoute requireOrganizer><MatchPage /></ProtectedRoute>,
      },
      // The readable address of a competition for the people running it:
      // /tournaments/homebush_futsal/homebush_futsal_premier_league_2025. It
      // used to be /admin/:orgSlug/:tournamentSlug and cannot simply lose the
      // prefix, because /:orgSlug/:tournamentSlug is the public page.
      {
        path: 'tournaments/:orgSlug/:tournamentSlug',
        element: <ProtectedRoute requireOrganizer><TournamentPage /></ProtectedRoute>,
      },
      {
        path: 'tournaments/:orgSlug/:tournamentSlug/matches/:matchId',
        element: <ProtectedRoute requireOrganizer><MatchPage /></ProtectedRoute>,
      },
      { path: 'teams', element: <ProtectedRoute requireOrganizer><TeamsPage /></ProtectedRoute> },
      {
        path: 'teams/:teamId',
        element: <ProtectedRoute requireOrganizer><TeamPage /></ProtectedRoute>,
      },
      {
        path: 'players/:playerId',
        element: <ProtectedRoute requireOrganizer><PlayerPage /></ProtectedRoute>,
      },
      { path: 'calendar', element: <ProtectedRoute requireOrganizer><CalendarPage /></ProtectedRoute> },

      /* ---------- The addresses these screens used to have ----------
         Every one of them is in somebody's bookmarks and in every organiser's
         browser history, so they answer with a redirect rather than a 404. */
      { path: 'admin', element: <Navigate to="/dashboard" replace /> },
      { path: 'admin/*', element: <LegacyAdminRoute /> },
      // A second sign-in address for the super admin, which protected nothing:
      // the route was in the bundle for anyone to read.
      { path: 'adminslazhen', element: <Navigate to="/login" replace /> },
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
        path: 'teams/:teamId', 
        element: <PublicTeamPage />
      },
      { 
        path: 'players/:playerId', 
        element: <PublicPlayerPage />
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
        // A match inside a named season. Without it the only address a fixture
        // had was the two-segment one, so a link built from the page a visitor
        // was actually reading had nowhere to land.
        path: ':seriesSlug/:seasonSlug/matches/:matchId',
        element: <PublicMatchPage />,
      },
      { 
        path: 'players/:playerId', 
        element: <PublicPlayerPage />
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
