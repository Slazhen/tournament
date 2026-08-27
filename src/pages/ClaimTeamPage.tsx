import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { clubService } from '../lib/data'
import type { TeamInvitePreview } from '../lib/data'
import { claimTeam } from '../lib/auth'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'
import { IconShield } from '../components/icons'

/**
 * Taking over a club from an invitation.
 *
 * The person arriving here is a coach with a phone and a link somebody sent
 * them on WhatsApp. So the first thing the page does is name the club they are
 * about to take on — claiming the wrong one is the mistake to design against —
 * and the account is created here rather than sending them off to register and
 * come back.
 */
export default function ClaimTeamPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { user, refresh, isLoading: authLoading } = useAuth()

  const [invite, setInvite] = useState<TeamInvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    let cancelled = false

    clubService
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
      await claimTeam(
        user
          ? { token }
          : { token, email: email.trim().toLowerCase(), password, displayName: displayName.trim() },
      )
      await refresh()
      navigate('/my-club')
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

  if (loading || authLoading) {
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
            An invitation works once and lasts a fortnight. Ask the organiser for a new one.
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
            <IconShield size={22} /> {invite.teamName}
          </h1>
          <p className="text-gray-400 mt-2">
            {invite.organizerName
              ? `${invite.organizerName} has invited you to run this club.`
              : 'You have been invited to run this club.'}
          </p>
        </div>

        <div className="glass rounded-2xl p-6 border border-white/15">
          <p className="text-sm text-gray-300 mb-5">
            You will be able to edit the squad, keep the crest up to date and enter{' '}
            {invite.teamName} into competitions. Results stay with the organiser.
          </p>

          {/* Taking this up also puts the club in a competition, and somebody
              agreeing to run a club should not find that out afterwards. */}
          {invite.tournamentName && (
            <p className="text-sm text-blue-200/90 mb-5">
              {invite.teamName} will be entered in {invite.tournamentName} as soon as you do.
            </p>
          )}

          <form onSubmit={submit} className="space-y-4">
            {!user && (
              <>
                <label className="block">
                  <span className="text-sm text-gray-300">Your name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="How you appear to the organiser"
                    className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                  />
                </label>

                <label className="block">
                  <span className="text-sm text-gray-300">Email address</span>
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
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
                </label>
              </>
            )}

            {user && (
              <p className="text-sm text-gray-300">
                Signed in as {user.displayName || user.email}. The club will be added to this
                account.
              </p>
            )}

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
              {isSaving ? 'Just a moment...' : `Take over ${invite.teamName}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
