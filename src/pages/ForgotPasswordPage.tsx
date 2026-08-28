import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../lib/auth'
import Logo from '../components/Logo'
import { IconArrowLeft } from '../components/icons'

/**
 * Asking for a way back in.
 *
 * The answer never says whether the address has an account. Telling a stranger
 * which emails are registered is a list worth having, and it costs the person
 * who genuinely forgot their password nothing to be told to check their inbox.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim() || isSending) return

    setIsSending(true)
    try {
      await requestPasswordReset(email)
    } catch {
      // Deliberately silent: the reply is the same either way.
    } finally {
      setIsSending(false)
      setSent(true)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo size={34} className="mb-4" />
          <h1 className="text-2xl font-bold">Forgotten your password?</h1>
          <p className="text-gray-400 mt-2">
            Put in the address you sign in with and we will send a link to choose a new one.
          </p>
        </div>

        <div className="glass rounded-2xl p-6 border border-white/15">
          {sent ? (
            <div className="space-y-4 text-center">
              <p>
                If <span className="font-medium">{email.trim()}</span> has an account, a link is on
                its way. It works once and expires in an hour.
              </p>
              <p className="text-sm text-gray-400">
                Nothing arrived? Check the spam folder, or ask the organiser who set your account up
                — they can hand you a link directly.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl glass hover:bg-white/10 transition-all"
              >
                <IconArrowLeft size={15} /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="text-sm text-gray-300">Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  className="mt-1 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                />
              </label>

              <button
                type="submit"
                disabled={isSending}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 transition-colors disabled:opacity-50"
              >
                {isSending ? 'Sending...' : 'Send the link'}
              </button>

              <p className="text-center text-sm">
                <Link to="/login" className="text-gray-400 hover:text-white transition-colors">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
