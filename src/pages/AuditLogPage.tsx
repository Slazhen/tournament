import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAuditLog } from '../lib/auth'
import type { AuditEntry } from '../lib/auth'
import { useAuth } from '../contexts/AuthContext'
import { IconArrowLeft, IconShield } from '../components/icons'

/**
 * Who changed what.
 *
 * A super admin can edit any organiser's tournament, and until this existed
 * that was indistinguishable from the organiser doing it themselves. When
 * somebody says "our result was changed", this is the answer.
 */
export default function AuditLogPage() {
  const { isSuperAdmin, isLoading } = useAuth()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSuperAdmin) return
    let cancelled = false

    fetchAuditLog(200)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch(() => {
        if (!cancelled) setError('The log could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isSuperAdmin])

  if (isLoading) return null

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-2">Not for this account</h1>
          <p className="opacity-70 mb-6">The record of changes is for super admins.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold inline-flex items-center gap-2">
            <IconShield size={24} /> Changes
          </h1>
          <p className="opacity-70 mt-1">
            Every edit that reached the database, newest first.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity"
        >
          <IconArrowLeft size={15} /> Back
        </Link>
      </div>

      <section className="glass rounded-xl p-4 sm:p-6">
        {loading ? (
          <p className="opacity-60 py-6 text-center">Loading…</p>
        ) : error ? (
          <p className="text-red-300 py-6 text-center">{error}</p>
        ) : entries.length === 0 ? (
          <p className="opacity-60 py-6 text-center">Nothing has been changed yet.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {entries.map((entry) => {
              const when = new Date(entry.at.split('#')[0])
              return (
                <li key={entry.at} className="py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs opacity-60 w-40 shrink-0">
                    {when.toLocaleString()}
                  </span>
                  <span className="text-sm font-medium">
                    {entry.actorEmail || entry.actorId}
                    {entry.actorRole === 'super_admin' && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-yellow-400">
                        super admin
                      </span>
                    )}
                  </span>
                  <span className="text-sm opacity-80 flex-1 min-w-0">
                    {entry.summary || entry.action}
                  </span>
                  <span className="text-[11px] opacity-40 font-mono">{entry.action}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
