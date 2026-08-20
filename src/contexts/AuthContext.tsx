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
  login: (loginCredential: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  canAccess: (organizerId: string) => boolean
  isSuperAdmin: boolean
  isOrganizer: boolean
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const setCurrentOrganizer = useAppStore((state) => state.setCurrentOrganizer)

  /** Points the store at whichever organizer this user administers. */
  const applyOrganizerScope = (nextUser: AuthUser | null) => {
    if (nextUser?.role === 'organizer' && nextUser.organizerId) {
      setCurrentOrganizer(nextUser.organizerId)
    } else {
      setCurrentOrganizer('')
    }
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

  const login = async (loginCredential: string, password: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const result = await authenticateUser(loginCredential, password)
      if (!result) return false

      setUser(result.user)
      applyOrganizerScope(result.user)
      return true
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

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    canAccess,
    isSuperAdmin: user?.role === 'super_admin',
    isOrganizer: user?.role === 'organizer',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
