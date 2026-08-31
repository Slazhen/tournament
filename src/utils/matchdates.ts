import type { Match } from '../types'
import { combineLocal, localDatePart, localTimePart } from './datetime'

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

/** One round as the fixtures screen lays it out: the matches in the order shown. */
export type RoundSlots = { round: number; matchIds: string[] }

export type TimePatternOptions = {
  /**
   * When given, every round is also moved: the first one to this local day
   * (YYYY-MM-DD) and each following one `intervalDays` later. Left out, a round
   * keeps the day it already has and one with no day at all is not touched,
   * because a time cannot be stored without a date.
   */
  startDate?: string
  intervalDays?: number
}

const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * Repeats the first round's kick-off times in every other round.
 *
 * A tournament played on one pitch runs its rounds to the same clock: the first
 * match at 19:00, the second at 19:45, and so on. Typing that out once per round
 * is the same four times over, so the first round is the template and the rest
 * follow it.
 *
 * The template is read by position, not by team: the nth fixture of the first
 * round gives the nth kick-off of every round. Position is what the organiser
 * sees on screen, and the rounds are edited as ordered lists — a round longer
 * than the first has no slot to copy for its extra fixtures and they are left
 * alone.
 */
export function applyTimePatternToRounds(
  matches: Match[],
  rounds: RoundSlots[],
  options: TimePatternOptions = {},
): Match[] {
  const template = rounds[0]
  if (!template) return matches

  const byId = new Map(matches.map((match) => [match.id, match]))
  const pattern = template.matchIds.map((id) => {
    const iso = byId.get(id)?.dateISO
    return iso ? localTimePart(iso) : undefined
  })
  if (pattern.every((time) => time === undefined)) return matches

  const dayOfRound = new Map<number, string>()
  rounds.forEach((round, index) => {
    if (options.startDate) {
      const day = new Date(`${options.startDate}T12:00`)
      if (Number.isNaN(day.getTime())) return
      day.setDate(day.getDate() + index * Math.max(0, options.intervalDays ?? 7))
      dayOfRound.set(round.round, localDay(day))
      return
    }
    const scheduled = round.matchIds.map((id) => byId.get(id)?.dateISO).find(Boolean)
    if (scheduled) dayOfRound.set(round.round, localDatePart(scheduled))
  })

  const slotOfMatch = new Map<string, { round: number; slot: number }>()
  rounds.forEach((round) => {
    round.matchIds.forEach((id, slot) => slotOfMatch.set(id, { round: round.round, slot }))
  })

  return matches.map((match) => {
    const place = slotOfMatch.get(match.id)
    if (!place) return match
    const time = pattern[place.slot]
    const day = dayOfRound.get(place.round)
    if (!time || !day) return match
    const dateISO = combineLocal(day, time)
    return dateISO ? { ...match, dateISO } : match
  })
}
