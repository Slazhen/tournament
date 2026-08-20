import type { Match } from '../types'
import { combineLocal, localTimePart } from './datetime'

export type ScheduleOptions = {
  /** First matchday, as YYYY-MM-DD in the organiser's own timezone. */
  startDate: string
  /** Kick-off time, HH:MM. */
  time: string
  /** Days between one round and the next — 7 for a weekly league. */
  intervalDays: number
}

/**
 * Puts the generated fixtures in the calendar.
 *
 * Every match in a round kicks off at the same time, and each round is a fixed
 * number of days after the one before. It is a rough draft on purpose: the point
 * is that a new season arrives with dates already on it instead of twenty-one
 * empty fields, and individual matches can be moved afterwards.
 */
export function applySchedule(matches: Match[], options: ScheduleOptions): Match[] {
  if (!options.startDate) return matches

  const rounds = [...new Set(matches.map((match) => match.round ?? 0))].sort((a, b) => a - b)
  const dayOfRound = new Map<number, string>()

  rounds.forEach((round, index) => {
    const day = new Date(`${options.startDate}T12:00`)
    if (Number.isNaN(day.getTime())) return
    day.setDate(day.getDate() + index * Math.max(0, options.intervalDays))
    dayOfRound.set(
      round,
      `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
    )
  })

  return matches.map((match) => {
    // Never move a match somebody has already scheduled by hand.
    if (match.dateISO) return match
    const day = dayOfRound.get(match.round ?? 0)
    if (!day) return match
    return { ...match, dateISO: combineLocal(day, options.time || '12:00') }
  })
}

/**
 * Copies one match's kick-off across the rest of its round, keeping each match's
 * own time if it already has one.
 */
export function applyDateToRound(matches: Match[], sourceMatchId: string): Match[] {
  const source = matches.find((match) => match.id === sourceMatchId)
  if (!source?.dateISO) return matches

  const day = source.dateISO.slice(0, 10)
  const sourceDay = new Date(source.dateISO)
  const localDay = `${sourceDay.getFullYear()}-${String(sourceDay.getMonth() + 1).padStart(2, '0')}-${String(sourceDay.getDate()).padStart(2, '0')}`

  return matches.map((match) => {
    if (match.id === sourceMatchId) return match
    if ((match.round ?? 0) !== (source.round ?? 0)) return match
    const time = localTimePart(match.dateISO, localTimePart(source.dateISO))
    return { ...match, dateISO: combineLocal(localDay || day, time) }
  })
}
