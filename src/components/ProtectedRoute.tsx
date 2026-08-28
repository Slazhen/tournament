import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { landingPathFor } from '../lib/auth'

interface ProtectedRouteProps {
  children: ReactNode
  requireSuperAdmin?: boolean
  /** The organiser's area: an organizer or the super admin, never a club manager. */
  requireOrganizer?: boolean
  fallbackPath?: string
}

export default function ProtectedRoute({
  children,
  requireSuperAdmin = false,
  requireOrganizer = false,
  fallbackPath = '/login',
}: ProtectedRouteProps) {
  const { user, isLoading, isSuperAdmin } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={fallbackPath} replace />
  }

  // Somebody who may not be here is sent where they belong rather than told
  // what they are missing. A club manager has no reason to learn that the
  // organiser's screens exist, and an "Access denied" page is an invitation to
  // wonder what is behind it. The version this replaces rendered that page with
  // a <Navigate> inside it, so it flashed and redirected anyway - and it sent
  // everyone to the organiser's panel, which is the page a manager must not
  // reach in the first place.
  const canOrganize = isSuperAdmin || user.role === 'organizer'

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to={landingPathFor(user)} replace />
  }

  if (requireOrganizer && !canOrganize) {
    return <Navigate to={landingPathFor(user)} replace />
  }

  return <>{children}</>
}
