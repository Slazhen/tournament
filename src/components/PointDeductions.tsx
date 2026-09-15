import { useState } from 'react'
import type { PointDeduction, Team, Tournament } from '../types'
import { useAppStore } from '../store'
import { deductionsOf } from '../utils/standings'
import { IconPlus, IconTrash, IconWarning } from './icons'

/**
 * Points an organiser has taken off a club, on the three screens that show a
 * table and the one that writes them.
 *
 * A punishment is a fact about the competition and not about a match, so it is
 * said next to the table rather than inside it: a mark on the row, which is
 * what makes a total that does not add up readable at all, and a line under the
 * table saying how many points and why. The reason is not optional — a table
 * that takes three points off a club without saying why is a table its readers
 * correct in the comments.
 */

/** The deductions that belong to one table: the clubs actually in it. */
export function deductionsInTable(
  tournament: Tournament | null | undefined,
  teamIds: Iterable<string>,
): PointDeduction[] {
  const inTable = new Set(teamIds)
  return deductionsOf(tournament).filter((deduction) => inTable.has(deduction.teamId))
}

/** The mark on the row itself. Drawn only where there is something to explain. */
export function DeductionMark({ points, className = '' }: { points: number; className?: string }) {
  if (!points) return null
  return (
    <span
      className={`text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full whitespace-nowrap ${className}`}
      title={`${points} ${points === 1 ? 'point' : 'points'} deducted`}
    >
      −{points}
    </span>
  )
}

/**
 * The line under the table, one per punishment.
 *
 * Several against one club are listed separately rather than added up: they are
 * separate decisions with separate reasons, and a single "−6" would hide the
 * second one.
 */
export function DeductionNote({
  deductions,
  nameOf,
  className = '',
}: {
  deductions: PointDeduction[]
  nameOf: (teamId: string) => string
  className?: string
}) {
  if (deductions.length === 0) return null
  return (
    <div className={`mt-3 text-xs sm:text-sm text-gray-300 space-y-1 ${className}`}>
      {deductions.map((deduction) => (
        <p key={deduction.id}>
          <span className="font-medium">{nameOf(deduction.teamId)}</span>
          {' — '}
          {deduction.points} {deduction.points === 1 ? 'point' : 'points'} deducted:{' '}
          {deduction.reason}
        </p>
      ))}
    </div>
  )
}

/**
 * The organiser's half: hand down a punishment, or lift one.
 *
 * Each is one request against a route of its own. The list is never sent whole
 * — it is what a published table subtracts from, and a save from a stale copy
 * of this screen would restore a punishment that had been lifted or drop one
 * entered from another screen.
 */
export default function PointDeductionsEditor({
  tournament,
  teams,
}: {
  tournament: Tournament
  teams: Team[]
}) {
  const { addPointDeduction, removePointDeduction } = useAppStore()
  const deductions = deductionsOf(tournament)

  const [teamId, setTeamId] = useState('')
  const [points, setPoints] = useState('1')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const entered = (tournament.teamIds ?? []).filter((id) => id)
  const nameOf = (id: string) => teams.find((team) => team.id === id)?.name ?? id

  const submit = async () => {
    const amount = Number(points)
    if (!teamId) return setError('Choose the club')
    if (!Number.isInteger(amount) || amount < 1) return setError('Points must be a whole number')
    if (!reason.trim()) return setError('Say why — the reason is shown under the table')

    setSaving(true)
    setError('')
    try {
      await addPointDeduction(tournament.id, { teamId, points: amount, reason: reason.trim() })
      setTeamId('')
      setPoints('1')
      setReason('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That could not be saved')
    } finally {
      setSaving(false)
    }
  }

  const lift = async (deduction: PointDeduction) => {
    setError('')
    try {
      await removePointDeduction(tournament.id, deduction.id)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That could not be removed')
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-white/10">
      <div className="flex items-center gap-2 mb-3">
        <IconWarning size={15} />
        <h3 className="text-sm font-semibold tracking-wide">Points deductions</h3>
      </div>

      {deductions.length > 0 ? (
        <ul className="space-y-2 mb-4">
          {deductions.map((deduction) => (
            <li
              key={deduction.id}
              className="flex items-center gap-3 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm"
            >
              <DeductionMark points={deduction.points} />
              <span className="font-medium">{nameOf(deduction.teamId)}</span>
              <span className="opacity-70 truncate">{deduction.reason}</span>
              <button
                onClick={() => lift(deduction)}
                className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/10 transition-all text-red-300"
                title="Give these points back"
              >
                <IconTrash size={14} /> Lift
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm opacity-60 mb-4">
          Nobody has been docked any points in this competition.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,2fr)_auto]">
        <select
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm"
        >
          <option value="">Club</option>
          {entered.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={99}
          value={points}
          onChange={(event) => setPoints(event.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm"
          title="How many points come off"
        />
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          placeholder="Reason, as the public will read it"
          className="px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm"
        />
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all text-sm disabled:opacity-50"
        >
          <IconPlus size={15} /> Deduct
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </div>
  )
}
