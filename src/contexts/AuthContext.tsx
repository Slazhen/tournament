import React, { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '../lib/auth'
import {
  authenticateUser,
  canAccessOrganizer,
  logout as apiLogout,
  verifySession,
} from '../lib/auth'
import { isSignedIn } from '../lib/api'
import { useAppStore } from '../store'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  /** The account on success, null when the credentials do not match one. */
  login: (loginCredential: string, password: string) => Promise<AuthUser | null>
  logout: () => Promise<void>
  canAccess: (organizerId: string) => boolean
  /** Re-reads the session from the API — after a password reset signs someone in. */
  refresh: () => Promise<AuthUser | null>
  isSuperAdmin: boolean
  isOrganizer: boolean
  /**
   * Whether this account is a club manager, which is a question about the role
   * and not about `teamIds`: the account's list and the `managerUserIds` on the
   * clubs are written one after the other and can disagree, and a manager whose
   * list came back empty was being offered the organiser's screens instead.
   */
  isTeamManager: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Whether somebody is signed in, for the chrome around a page.
 *
 * A token in storage counts while the session is still being verified: deciding
 * purely on loaded data made the header flip from the public version to the
 * admin one on every page load. Kept here rather than written out twice, because
 * the shell and the landing page each draw a header and the two disagreeing is
 * how a signed-in organiser ended up with a Sign in button.
 */
export function useSignedIn(): boolean {
  const { user, isLoading } = useAuth()
  const currentOrganizer = useAppStore((state) => state.getCurrentOrganizer())

  return Boolean(user) || Boolean(currentOrganizer) || (isLoading && isSignedIn())
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const applyScope = useAppStore((state) => state.applyScope)

  /**
   * Points the store at whatever this account administers: one organizer, all
   * of them for a super admin, or none at all.
   */
  const applyOrganizerScope = (nextUser: AuthUser | null) => {
    applyScope(nextUser)
  }

  // On load, ask the API whether the stored token is still a valid session.
  // The answer comes from the server; the browser cannot decide this itself.
  useEffect(() => {
    let cancelled = false

    const restoreSession = async () => {
      if (!isSignedIn()) {
        setIsLoading(false)
        return
      }

      const result = await verifySession()
      if (cancelled) return

      setUser(result?.user ?? null)
      applyOrganizerScope(result?.user ?? null)
      setIsLoading(false)
    }

    void restoreSession()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = async (
    loginCredential: string,
    password: string,
  ): Promise<AuthUser | null> => {
    setIsLoading(true)
    try {
      const result = await authenticateUser(loginCredential, password)
      if (!result) return null

      setUser(result.user)
      applyOrganizerScope(result.user)
      // Returned rather than only stored: the caller decides where to send
      // somebody, and the state set here is not readable until the next render.
      return result.user
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
      applyOrganizerScope(null)
    }
  }

  const canAccess = (organizerId: string): boolean => canAccessOrganizer(user, organizerId)

  const refresh = async (): Promise<AuthUser | null> => {
    const result = await verifySession()
    setUser(result?.user ?? null)
    applyOrganizerScope(result?.user ?? null)
    return result?.user ?? null
  }

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    canAccess,
    refresh,
    isSuperAdmin: user?.role === 'super_admin',
    isOrganizer: user?.role === 'organizer',
    isTeamManager: user?.role === 'team_manager',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
