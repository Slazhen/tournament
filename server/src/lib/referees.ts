import { badRequest } from './http.js'
import type { Organizer } from './types.js'

/**
 * Referees, and what being one of them lets an account do.
 *
 * A referee is a record the *organiser* owns, not one a competition owns: the
 * same people referee next season, and a list kept per season would be typed
 * in again every year and leave one account linked to several copies of the
 * same person. It lives on the organiser record as `referees`, a short list
 * written one element at a time like every other list here.
 *
 * Who referees a fixture is written on the fixture, as ids into that list:
 * `match.referees = { main?, assistant1?, assistant2? }`. Appointing nobody is
 * the ordinary case - most matches in this application are played without
 * anybody recording who refereed them - so every position is optional and the
 * field is absent on every match ever played before this existed.
 *
 * An account is linked to a referee record by `userId`, set when the person
 * takes up their invitation. One account may be linked to referee records of
 * several organisers, because the person refereeing in two leagues is one
 * person with one password; what they may touch is decided per record.
 */

export const REFEREE_POSITIONS = ['main', 'assistant1', 'assistant2'] as const
export type RefereePosition = (typeof REFEREE_POSITIONS)[number]

export const POSITION_LABELS: Record<RefereePosition, string> = {
  main: 'Referee',
  assistant1: 'Assistant referee 1',
  assistant2: 'Assistant referee 2',
}

export type Referee = {
  id: string
  name: string
  /** The address the invitation went to. Shown to the organiser, never public. */
  email?: string
  /** The account that took the invitation up. Absent until somebody has. */
  userId?: string
  createdAtISO: string
  linkedAtISO?: string
}

export type MatchReferees = Partial<Record<RefereePosition, string>>

/** It is a ceiling on one record, not a rule about football. */
export const MAX_REFEREES = 100

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** The organiser's referees, with anything that is not one dropped. */
export function refereesOf(organizer: Organizer | null | undefined): Referee[] {
  const stored = (organizer as { referees?: unknown } | null | undefined)?.referees
  if (!Array.isArray(stored)) return []
  return stored.filter(
    (entry): entry is Referee =>
      isRecord(entry) && typeof entry.id === 'string' && typeof entry.name === 'string',
  )
}

/** Who is appointed to a fixture, as stored, with anything malformed dropped. */
export function appointmentsOf(match: unknown): MatchReferees {
  const stored = isRecord(match) ? match.referees : undefined
  if (!isRecord(stored)) return {}
  const out: MatchReferees = {}
  for (const position of REFEREE_POSITIONS) {
    const id = stored[position]
    if (typeof id === 'string' && id) out[position] = id
  }
  return out
}

/**
 * Where on a fixture a referee record is appointed, or null.
 *
 * Main before the assistants, which only matters if one record were ever
 * written into two positions - the route refuses that, but a `matches` array
 * written whole by the tournament routes could still carry it.
 */
export function positionOf(match: unknown, refereeId: string): RefereePosition | null {
  const appointed = appointmentsOf(match)
  for (const position of REFEREE_POSITIONS) {
    if (appointed[position] === refereeId) return position
  }
  return null
}

/**
 * Which of an account's referee records is appointed to this fixture.
 *
 * An account can be linked to more than one record of the same organiser - an
 * organiser who added the same person twice and invited both - so every one of
 * them is asked, and the first that is appointed answers.
 */
export function appointmentOf(
  organizer: Organizer | null | undefined,
  match: unknown,
  userId: string,
): { referee: Referee; position: RefereePosition } | null {
  for (const referee of refereesOf(organizer)) {
    if (referee.userId !== userId) continue
    const position = positionOf(match, referee.id)
    if (position) return { referee, position }
  }
  return null
}

/**
 * The appointments as the request describes them, checked against the
 * organiser's list.
 *
 * Every position is sent every time - the screen shows all three and saves all
 * three - so a missing key, an empty string and null all mean nobody. One
 * person in two positions of one match is refused: it is a mistake on the form,
 * and stored it would make the second position an unrecorded vacancy.
 */
export function readAppointments(body: Record<string, unknown>, known: Referee[]): MatchReferees {
  const ids = new Set(known.map((referee) => referee.id))
  const out: MatchReferees = {}
  const seen = new Set<string>()

  for (const position of REFEREE_POSITIONS) {
    const value = body[position]
    if (value === undefined || value === null || value === '') continue
    if (typeof value !== 'string' || !ids.has(value)) {
      throw badRequest('That referee is not on your list. Reload the page and try again.')
    }
    if (seen.has(value)) throw badRequest('One referee cannot take two positions in the same match')
    seen.add(value)
    out[position] = value
  }

  return out
}

/** A referee's name as typed, checked. */
export function readRefereeName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name) throw badRequest('A referee needs a name')
  if (name.length > 80) throw badRequest('That name is too long')
  return name
}

/** An address as typed, checked, or undefined when none was given. */
export function readRefereeEmail(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw badRequest('A valid email address is required')
  }
  return email
}

/**
 * The names of the people appointed to a fixture, as the public sees them.
 *
 * Names and nothing else. The ids stay behind with the addresses: a visitor
 * reading who refereed has no use for a key into somebody's list, and the
 * record it keys into holds an email address and an account id.
 */
export function publicRefereeNames(
  match: unknown,
  byId: Map<string, string>,
): Partial<Record<RefereePosition, string>> | undefined {
  const appointed = appointmentsOf(match)
  const out: Partial<Record<RefereePosition, string>> = {}
  for (const position of REFEREE_POSITIONS) {
    const id = appointed[position]
    const name = id ? byId.get(id) : undefined
    if (name) out[position] = name
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * A season with every fixture's appointments turned into names, for the public.
 *
 * Applied after `toPublicTournament`, so a fixture that projection has redacted
 * carries no appointments to name. Both homes of a fixture are walked, because a
 * hand-built playoff round is refereed like any other match.
 */
export function withRefereeNames<T extends Record<string, unknown>>(
  tournament: T,
  byId: Map<string, string>,
): T {
  const name = (match: unknown): unknown => {
    if (!isRecord(match) || match.referees === undefined) return match
    const { referees: _ids, ...rest } = match
    const names = publicRefereeNames(match, byId)
    return names ? { ...rest, refereeNames: names } : rest
  }

  const out: Record<string, unknown> = { ...tournament }
  if (Array.isArray(tournament.matches)) out.matches = tournament.matches.map(name)

  const format = tournament.format
  if (isRecord(format) && isRecord(format.customPlayoffConfig)) {
    const config = format.customPlayoffConfig
    if (Array.isArray(config.playoffRounds)) {
      out.format = {
        ...format,
        customPlayoffConfig: {
          ...config,
          playoffRounds: config.playoffRounds.map((round) =>
            isRecord(round) && Array.isArray(round.matches)
              ? { ...round, matches: round.matches.map(name) }
              : round,
          ),
        },
      }
    }
  }
  return out as T
}

/** Each organiser's referees by id, as `withRefereeNames` reads them. */
export function refereeNameIndex(all: Organizer[]): Map<string, Map<string, string>> {
  const index = new Map<string, Map<string, string>>()
  for (const organizer of all) {
    index.set(organizer.id, new Map(refereesOf(organizer).map((referee) => [referee.id, referee.name])))
  }
  return index
}

/**
 * A tournament body written whole, with every fixture's appointments and score
 * mark put back as they are stored.
 *
 * `PATCH /admin/tournaments/:id` still writes `matches` and `format` whole from
 * the browser's copy - the debt CLAUDE.md names - and the draw generators and
 * the repair tools use it. An appointment is a permission, so a tab loaded
 * before the organiser replaced one referee with another must not put the first
 * back by generating the playoffs; the appointment route is the only way an
 * appointment is written, and the score mark is the record of who owns the
 * result, which nothing on that road decides.
 *
 * Matched by fixture id across both homes. A fixture the body carries that is
 * not stored is new, and arrives with neither. The mark survives only where the
 * score the body carries is the score that is stored: a whole-season write that
 * changes a result is the organiser changing it.
 */
export function keepAppointments(
  body: Record<string, unknown>,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const byId = new Map<string, Record<string, unknown>>()
  for (const match of fixturesOf(stored)) byId.set(match.id as string, match)

  const restore = (match: unknown): unknown => {
    if (!isRecord(match)) return match
    const { referees: _sentReferees, scoreEnteredBy: _sentMark, ...rest } = match
    const was = typeof match.id === 'string' ? byId.get(match.id) : undefined
    if (!was) return rest
    const out: Record<string, unknown> = { ...rest }
    if (was.referees !== undefined) out.referees = was.referees
    const sameScore = match.homeGoals === was.homeGoals && match.awayGoals === was.awayGoals
    if (was.scoreEnteredBy !== undefined && sameScore) out.scoreEnteredBy = was.scoreEnteredBy
    return out
  }

  const out: Record<string, unknown> = { ...body }
  if (Array.isArray(body.matches)) out.matches = body.matches.map(restore)

  const format = body.format
  if (isRecord(format) && isRecord(format.customPlayoffConfig)) {
    const config = format.customPlayoffConfig
    if (Array.isArray(config.playoffRounds)) {
      out.format = {
        ...format,
        customPlayoffConfig: {
          ...config,
          playoffRounds: config.playoffRounds.map((round) =>
            isRecord(round) && Array.isArray(round.matches)
              ? { ...round, matches: round.matches.map(restore) }
              : round,
          ),
        },
      }
    }
  }
  return out
}

/** Every fixture record in both homes of a stored tournament. */
function fixturesOf(tournament: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const take = (list: unknown) => {
    for (const match of Array.isArray(list) ? list : []) {
      if (isRecord(match) && typeof match.id === 'string') out.push(match)
    }
  }
  take(tournament.matches)
  const format = tournament.format
  if (isRecord(format) && isRecord(format.customPlayoffConfig)) {
    const rounds = format.customPlayoffConfig.playoffRounds
    for (const round of Array.isArray(rounds) ? rounds : []) {
      if (isRecord(round)) take(round.matches)
    }
  }
  return out
}
