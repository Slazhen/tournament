import React, { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser, AuthSession } from '../lib/auth'
import { authenticateUser, verifySession, deleteSession, canAccessOrganizer } from '../lib/auth'
import { useAppStore } from '../store'

interface AuthContextType {
  user: AuthUser | null
  session: AuthSession | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<boolean>
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
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const setCurrentOrganizer = useAppStore((state) => state.setCurrentOrganizer)

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        if (token) {
          const result = await verifySession(token)
          if (result) {
            setUser(result.user)
            setSession(result.session)
            
            // Set current organizer ID if user is an organizer
            if (result.user.role === 'organizer' && result.user.organizerId) {
              console.log('Restoring current organizer ID:', result.user.organizerId)
              setCurrentOrganizer(result.user.organizerId)
            } else if (result.user.role === 'super_admin') {
              // Clear organizer ID for super admin
              setCurrentOrganizer('')
            }
          } else {
            localStorage.removeItem('auth_token')
          }
        }
      } catch (error) {
        console.error('Error checking existing session:', error)
        localStorage.removeItem('auth_token')
      } finally {
        setIsLoading(false)
      }
    }

    checkExistingSession()
  }, [setCurrentOrganizer])

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true)
      const result = await authenticateUser(username, password)
      
      if (result) {
        setUser(result.user)
        setSession(result.session)
        localStorage.setItem('auth_token', result.session.token)
        
        // Set current organizer ID if user is an organizer
        if (result.user.role === 'organizer' && result.user.organizerId) {
          console.log('Setting current organizer ID:', result.user.organizerId)
          setCurrentOrganizer(result.user.organizerId)
        } else if (result.user.role === 'super_admin') {
          // Clear organizer ID for super admin
          setCurrentOrganizer('')
        }
        
        return true
      }
      
      return false
    } catch (error) {
      console.error('Login error:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async (): Promise<void> => {
    try {
      if (session) {
        await deleteSession(session.token)
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      setSession(null)
      localStorage.removeItem('auth_token')
    }
  }

  const canAccess = (organizerId: string): boolean => {
    if (!user) return false
    return canAccessOrganizer(user, organizerId)
  }

  const isSuperAdmin = user?.role === 'super_admin'
  const isOrganizer = user?.role === 'organizer'

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    login,
    logout,
    canAccess,
    isSuperAdmin,
    isOrganizer
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
