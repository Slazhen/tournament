import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { refereeService, REFEREE_POSITIONS } from '../lib/data'
import type { RefereePosition, RefereeRecord } from '../lib/data'
import type { Match, Tournament } from '../types'
import { IconWhistle } from './icons'

type Appointments = Partial<Record<RefereePosition, string>>

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:border-white/40 transition-colors text-sm'

/**
 * Who referees one match: the referee and two assistants, all optional.
 *
 * Picked from the organiser's list of referees and saved with a button, not on
 * change. An appointment is a permission - the person appointed may enter this
 * match's result - so it is a deliberate act and not a side effect of opening a
 * select, and all three positions go in one request so the screen cannot save
 * half of what it shows.
 */
export default function MatchReferees({ tournament, match }: { tournament: Tournament; match: Match }) {
  const setMatchReferees = useAppStore((state) => state.setMatchReferees)
  const [referees, setReferees] = useState<RefereeRecord[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Appointments>(match.referees ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    refereeService
      .list(tournament.organizerId)
      .then((list) => {
        if (!cancelled) setReferees(list)
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : 'The referees could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [tournament.organizerId])

  // What is stored moved under the draft - saved here, or by another tab - so
  // the draft starts again from it.
  const stored = match.referees ?? {}
  const storedKey = REFEREE_POSITIONS.map(({ value }) => stored[value] ?? '').join('|')
  useEffect(() => {
    setDraft(match.referees ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey])

  const changed = REFEREE_POSITIONS.some(({ value }) => (draft[value] ?? '') !== (stored[value] ?? ''))
  const chosen = REFEREE_POSITIONS.map(({ value }) => draft[value]).filter(Boolean)
  const twice = new Set(chosen).size !== chosen.length

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await setMatchReferees(tournament.id, match.id, draft)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The referees could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return <p className="text-sm text-red-300">{loadError}</p>
  }
  if (!referees) return null

  if (referees.length === 0) {
    return (
      <p className="text-sm opacity-70 inline-flex items-center gap-2">
        <IconWhistle size={14} />
        No referees yet.{' '}
        <Link to="/referees" className="underline hover:opacity-100">
          Add your referees
        </Link>{' '}
        to appoint them to matches.
      </p>
    )
  }

  // A referee who has been taken off the list but is still appointed here is
  // shown as such rather than as an empty select, so the organiser sees why the
  // position is not as it looks.
  const known = new Set(referees.map((referee) => referee.id))

  return (
    <div className="glass rounded-xl p-4 text-left max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium">
        <IconWhistle size={15} /> Referees
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {REFEREE_POSITIONS.map(({ value, label }) => (
          <label key={value} className="block">
            <span className="block text-xs opacity-70 mb-1">{label}</span>
            <select
              value={draft[value] ?? ''}
              onChange={(event) => setDraft({ ...draft, [value]: event.target.value || undefined })}
              className={FIELD}
            >
              <option value="">Nobody</option>
              {draft[value] && !known.has(draft[value]!) && (
                <option value={draft[value]}>Removed from your list</option>
              )}
              {referees.map((referee) => (
                <option key={referee.id} value={referee.id}>
                  {referee.name}
                  {referee.linked ? '' : ' (no account yet)'}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={busy || !changed || twice}
          className="px-4 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all text-sm disabled:opacity-40"
        >
          {busy ? 'Saving...' : 'Save referees'}
        </button>
        {twice && <span className="text-sm text-amber-300">One person cannot take two positions.</span>}
        {error && <span className="text-sm text-red-300">{error}</span>}
        {!twice && !error && (
          <span className="text-xs opacity-60">
            A referee with an account can record the score, goals and cards of this match.
          </span>
        )}
      </div>
    </div>
  )
}
