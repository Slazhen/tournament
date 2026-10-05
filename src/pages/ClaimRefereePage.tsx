import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { refereeService } from '../lib/data'
import type { RefereeInvitePreview } from '../lib/data'
import { claimReferee } from '../lib/auth'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'
import { IconWhistle } from '../components/icons'

/**
 * Taking up an invitation to referee.
 *
 * The invitation is bound to an address, so the address is shown rather than
 * typed. Three ways in, decided by who is here and what exists on that address:
 * signed in on it already - one press links this organiser's matches to the
 * account; an account exists there but nobody is signed in - sign in first;
 * nothing exists there - choose a password and the account is opened.
 */
export default function ClaimRefereePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { user, refresh } = useAuth()

  const [invite, setInvite] = useState<RefereeInvitePreview | null>(null)
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
    refereeService
      .previewInvite(token)
      .then((preview) => {
        if (!cancelled) {
          setInvite(preview)
          setDisplayName(preview.refereeName)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const take = async (input: { password?: string; displayName?: string }) => {
    if (isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      await claimReferee({ token, ...input })
      await refresh()
      navigate('/referee')
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'This invitation could not be used.')
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
          <p className="opacity-70 mb-6">An invitation works once and lasts a fortnight. Ask for a new one.</p>
          <Link to="/" className="px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all">
            Go to the home page
          </Link>
        </div>
      </div>
    )
  }

  const signedInHere = user && (user.email ?? '').toLowerCase() === invite.email
  const signedInElsewhere = user && !signedInHere
  const loginPath = `/login?next=${encodeURIComponent(`/join-referee?token=${token}`)}`

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo size={34} className="mb-4" />
          <h1 className="text-2xl font-bold inline-flex items-center gap-2">
            <IconWhistle size={22} /> {invite.organizerName}
          </h1>
          <p className="text-gray-400 mt-2">
            You have been added as a referee: {invite.refereeName}.
          </p>
        </div>

        <div className="glass rounded-2xl p-6 border border-white/15 space-y-4">
          <p className="text-sm text-gray-300">
            You will be able to record the score, the goals and the cards of the matches you are
            appointed to.
          </p>

          <div>
            <span className="text-sm text-gray-300">Email address</span>
            <p className="mt-1 px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white">
              {invite.email}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {signedInElsewhere ? (
            <p className="text-sm text-amber-300">
              You are signed in as {user?.email}. This invitation is for {invite.email}: sign out,
              then open the link again.
            </p>
          ) : signedInHere ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => take({})}
              className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Just a moment...' : `Referee for ${invite.organizerName}`}
            </button>
          ) : invite.hasAccount ? (
            <>
              <p className="text-sm text-gray-300">
                There is already an account on this address. Sign in with it, then come back to this
                link.
              </p>
              <Link
                to={loginPath}
                className="block text-center w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-colors"
              >
                Sign in
              </Link>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void take({ password, displayName: displayName.trim() || undefined })
              }}
              className="space-y-4"
            >
              <label className="block">
                <span className="text-sm text-gray-300">Your name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
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
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Just a moment...' : 'Set up my account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
