import { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

interface ProtectedRouteProps {
  children: ReactNode
  requireSuperAdmin?: boolean
  requireOrganizer?: boolean
  fallbackPath?: string
}

export default function ProtectedRoute({ 
  children, 
  requireSuperAdmin = false, 
  requireOrganizer = false,
  fallbackPath = '/admin/login'
}: ProtectedRouteProps) {
  const { user, isLoading, isSuperAdmin, isOrganizer } = useAuth()

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

  if (requireSuperAdmin && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4 text-white">Access Denied</h1>
          <p className="text-gray-400 mb-6">You need super admin privileges to access this page</p>
          <Navigate to="/admin" replace />
        </div>
      </div>
    )
  }

  if (requireOrganizer && !isOrganizer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4 text-white">Access Denied</h1>
          <p className="text-gray-400 mb-6">You need organizer privileges to access this page</p>
          <Navigate to="/admin" replace />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
