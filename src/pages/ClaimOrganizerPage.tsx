import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { organizerService } from '../lib/data'
import type { OrganizerInvitePreview } from '../lib/data'
import { claimOrganizer } from '../lib/auth'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'
import { IconTrophy } from '../components/icons'

/**
 * Taking over an organizer from an invitation.
 *
 * The counterpart of the club claim page, and deliberately narrower. The
 * account is opened on the address the invitation was sent to and no other, so
 * the address is shown rather than typed: there is nothing here for somebody to
 * get wrong except the password.
 */
export default function ClaimOrganizerPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [invite, setInvite] = useState<OrganizerInvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    let cancelled = false

    organizerService
      .previewInvite(token)
      .then((preview) => {
        if (!cancelled) setInvite(preview)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSaving) return

    setIsSaving(true)
    setError(null)
    try {
      await claimOrganizer({ token, password, displayName: displayName.trim() || undefined })
      await refresh()
      navigate('/dashboard')
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'This invitation could not be used.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    )
  }

  if (!invite) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center border border-white/15">
          <h1 className="text-xl font-semibold mb-3">This invitation is no longer good</h1>
          <p className="opacity-70 mb-6">
            An invitation works once and lasts a fortnight. Ask for a new one.
          </p>
          <Link to="/" className="px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all">
            Go to the home page
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo size={34} className="mb-4" />
          <h1 className="text-2xl font-bold inline-flex items-center gap-2">
            <IconTrophy size={22} /> {invite.organizerName}
          </h1>
          <p className="text-gray-400 mt-2">You have been invited to run this organiser.</p>
        </div>

        <div className="glass rounded-2xl p-6 border border-white/15">
          <p className="text-sm text-gray-300 mb-5">
            You will be able to create competitions, enter clubs into them and publish fixtures,
            tables and results.
          </p>

          <form onSubmit={submit} className="space-y-4">
            {/* Shown rather than typed: the invitation decides the address, and
                a field somebody can change would be a field they can get wrong. */}
            <div>
              <span className="text-sm text-gray-300">Email address</span>
              <p className="mt-1 px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white">
                {invite.email}
              </p>
              <p className="text-xs text-gray-500 mt-1">This is what you will sign in with.</p>
            </div>

            <label className="block">
              <span className="text-sm text-gray-300">Your name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How you appear on screen"
                className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
            </label>

            <label className="block">
              <span className="text-sm text-gray-300">Choose a password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
              />
              <span className="text-xs text-gray-500 mt-1 block">
                At least seven characters, with a digit in it.
              </span>
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
              {isSaving ? 'Just a moment...' : `Take over ${invite.organizerName}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
