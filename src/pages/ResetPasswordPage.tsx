import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { completePasswordReset } from '../lib/auth'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'

/**
 * Choosing a new password from a link.
 *
 * Using the link signs the person in, because the alternative is to hand
 * somebody a fresh password and then ask them to type it out again.
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSaving) return

    if (password !== confirmation) {
      setError('The two passwords are not the same')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await completePasswordReset(token, password)
      await refresh()
      navigate('/admin')
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'This link has expired or has already been used',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo size={34} className="mb-4" />
          <h1 className="text-2xl font-bold">Choose a new password</h1>
        </div>

        <div className="glass rounded-2xl p-6 border border-white/15">
          {!token ? (
            <div className="space-y-4 text-center">
              <p>This link is missing its code, so there is nothing to reset.</p>
              <Link
                to="/forgot-password"
                className="inline-block px-5 py-2.5 rounded-xl glass hover:bg-white/10 transition-all"
              >
                Ask for a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="text-sm text-gray-300">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-300">And again</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                />
              </label>

              {error && (
                <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save and sign in'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
