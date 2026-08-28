import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link, Navigate } from 'react-router-dom'
import {
  IconBall,
} from '../components/icons'
import { landingPathFor } from '../lib/auth'

export default function LoginPage() {
  const [loginCredential, setLoginCredential] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login, user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const account = await login(loginCredential, password)
      if (account) {
        navigate(landingPathFor(account))
      } else {
        setError('That email and password do not match an account')
      }
    } catch (err) {
      setError('Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Somebody already signed in is not shown a sign-in form. The link that gets
  // sent around is this one, and following it while signed in used to leave a
  // club manager looking at a door they had already come through.
  if (!authLoading && user) {
    return <Navigate to={landingPathFor(user)} replace />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center p-4">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="glass rounded-2xl p-8 shadow-2xl border border-white/20">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
              <IconBall size={24} />
            </div>
            {/* One door for everyone, at /login. A separate super-admin URL
                protected nothing — the route is in the bundle for anyone to
                read — and it meant maintaining two login screens. */}
            <h1 className="text-3xl font-bold text-white mb-2">Sign in</h1>
            <p className="text-gray-400">Tournament management</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              {/* The login is the email address. Signing in by username was a
                  second door into the same account, and a second thing to keep
                  honest; old accounts keep the name, not the door. */}
              <label htmlFor="loginCredential" className="block text-sm font-medium text-gray-300 mb-2">
                Email address
              </label>
              <input
                id="loginCredential"
                type="email"
                autoComplete="email"
                value={loginCredential}
                onChange={(e) => setLoginCredential(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all text-white placeholder-gray-400"
                placeholder="you@example.com"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all text-white placeholder-gray-400"
                placeholder="Enter your password"
                required
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>

            <p className="text-center text-sm">
              <Link
                to="/forgot-password"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Forgotten your password?
              </Link>
            </p>
          </form>

        </div>
      </div>
    </div>
  )
}
