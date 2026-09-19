import { badRequest } from './http.js'

/**
 * The people at a club who are not players.
 *
 * A list with a role on each person rather than three fields on the club
 * record. Clubs have two assistants as often as one, and a role somebody asks
 * for next season — a goalkeeping coach, a kit manager — is then a value in
 * this array and not a change to the shape of every club.
 *
 * Nothing in the competition reads it: a member of staff is named in no
 * teamsheet, scores no goals and takes no place in a squad entry. That is the
 * whole of what "this does not count as a player" means, and it is why staff
 * may be deleted outright while a player can only be archived — a player's
 * record is the only place their name lives for every goal and card that
 * points at them by id, and a member of staff is pointed at by nothing.
 */
export const STAFF_ROLES = ['coach', 'assistant_coach', 'physio'] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

const ROLES = new Set<string>(STAFF_ROLES)

/**
 * How many people one club may list.
 *
 * A ceiling rather than a rule about football: the club record travels whole to
 * every public page that names the club, and it is counted in the write's own
 * condition rather than against the read.
 */
export const MAX_STAFF = 20

/** As long as a name may be. Longer than any real one, short enough to render. */
const MAX_NAME = 80

/** As long as the address of a photograph may be. The ones this API mints are 60-odd characters. */
const MAX_PHOTO_URL = 512

const STAFF_FIELDS = ['role', 'firstName', 'lastName', 'photo'] as const

export const isStaffRole = (value: unknown): value is StaffRole =>
  typeof value === 'string' && ROLES.has(value)

/**
 * What may be written about one member of staff.
 *
 * A whitelist for the reason every other one in this API is: these records are
 * schemaless, so a key nobody has invented yet would be persisted onto the club
 * by whoever asked for it.
 *
 * `null` clears, as everywhere here — a photograph taken off on screen arrives
 * as a null, and the repository deletes the key rather than storing one. The
 * role is the exception: somebody with no role has no heading to be listed
 * under, so it can be changed and never emptied.
 */
export function staffUpdates(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const field of STAFF_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field]
  }

  if ('role' in updates && !isStaffRole(updates.role)) {
    throw badRequest(`role must be one of: ${STAFF_ROLES.join(', ')}`)
  }

  for (const field of ['firstName', 'lastName'] as const) {
    if (!(field in updates)) continue
    const value = updates[field]
    // A name is the one thing a person on this list has to have, so it is
    // cleared by sending an empty string rather than by a null: the pair is
    // what the page prints, and a record with neither is a row of nothing.
    if (typeof value !== 'string') throw badRequest(`${field} must be text`)
    const trimmed = value.trim()
    if (trimmed.length > MAX_NAME) throw badRequest(`${field} is too long`)
    updates[field] = trimmed
  }

  if ('photo' in updates && updates.photo !== null) {
    const photo = updates.photo
    // Length as well as shape. This list sits on the club record, which
    // travels whole to every page that names the club and has an item size
    // limit behind it: twenty people carrying a data URL each would take the
    // record past it and leave every later write to the club failing.
    if (typeof photo !== 'string' || photo.length > MAX_PHOTO_URL || !/^https?:\/\//i.test(photo)) {
      throw badRequest('photo must be an http address, or null to take it off')
    }
  }

  return updates
}

/**
 * Somebody has to be left with a name.
 *
 * Asked of the record as it will be stored and never of the request, because
 * the halves are sent separately: emptying the first name in one request and
 * the surname in the next passes any check that only looks at what arrived,
 * and leaves a row with a photograph, a role and nobody's name on it — which
 * nothing on screen or in the audit log can then identify in order to repair.
 */
export function assertStaffName(firstName: unknown, lastName: unknown): void {
  const named = [firstName, lastName].some(
    (part) => typeof part === 'string' && part.trim() !== '',
  )
  if (!named) throw badRequest('A name is required')
}

/**
 * The same list for somebody being added, with the clearing nulls dropped: a
 * new record has nothing to clear. A role and a name are both required here,
 * because this is the one moment at which neither can be inherited.
 */
export function newStaff(body: Record<string, unknown>): Record<string, unknown> {
  const fields = staffUpdates(body)
  if (!isStaffRole(fields.role)) {
    throw badRequest(`role must be one of: ${STAFF_ROLES.join(', ')}`)
  }

  const firstName = typeof fields.firstName === 'string' ? fields.firstName : ''
  const lastName = typeof fields.lastName === 'string' ? fields.lastName : ''
  assertStaffName(firstName, lastName)

  return Object.fromEntries(
    Object.entries({ ...fields, firstName, lastName }).filter(([, value]) => value !== null),
  )
}

/** What to call somebody in an audit line, where the record has a name to use. */
export function staffName(member: Record<string, unknown> | undefined): string {
  const parts = [member?.firstName, member?.lastName].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== '',
  )
  return parts.length === 0 ? 'somebody' : parts.join(' ')
}

/**
 * One club's staff as anybody outside the club is told it.
 *
 * A named list for the reason every projection in this API is one: these
 * records are schemaless, so a field added to `STAFF_FIELDS` next year — a
 * physio's phone number, a coach's licence date — would otherwise reach every
 * visiting organiser and every anonymous visitor on the day it is written.
 * That is exactly what `VISITING_PLAYER_FIELDS` exists to have stopped
 * happening to players.
 *
 * Holes and members with no role are dropped: this list can only be written by
 * the routes above today, but the club record itself is not beyond a hand-made
 * write, and a page drawing a role it cannot name prints nothing useful.
 */
const PUBLIC_STAFF_FIELDS = ['id', 'role', 'firstName', 'lastName', 'photo', 'createdAtISO'] as const

export function toPublicStaff(stored: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(stored)) return undefined

  return stored
    .filter(
      (member): member is Record<string, unknown> =>
        Boolean(member) && typeof member === 'object' && isStaffRole((member as { role?: unknown }).role),
    )
    .map((member) => {
      const out: Record<string, unknown> = {}
      for (const field of PUBLIC_STAFF_FIELDS) {
        if (member[field] !== undefined) out[field] = member[field]
      }
      return out
    })
}
