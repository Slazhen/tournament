import type { StaffMember, StaffRole, Team } from '../types'
import { STAFF_ROLES } from '../types'

/**
 * What each role is called on screen.
 *
 * The stored value is a key and never printed raw: it is what a later role
 * would be added to, and `assistant_coach` is not a label.
 */
const LABELS: Record<StaffRole, string> = {
  coach: 'Coach',
  assistant_coach: 'Assistant coach',
  physio: 'Team physio',
}

export const staffRoleLabel = (role: StaffRole | string): string =>
  LABELS[role as StaffRole] ?? role

/** The order the roles are listed in, which is the order of the touchline. */
const ORDER = new Map<string, number>(STAFF_ROLES.map((role, index) => [role, index]))

/**
 * A club's staff, in a settled order.
 *
 * Every club from before the field has none, and `staff` arrives from a
 * schemaless record, so a hole or a member with no role is stepped over here
 * rather than in each of the three screens that draw this list. Sorted by role
 * and then by when they were added, so the list does not reorder itself between
 * two readers of the same club.
 */
export function clubStaff(team: Team | null | undefined): StaffMember[] {
  const stored = team?.staff
  if (!Array.isArray(stored)) return []

  return stored
    .filter(
      (member): member is StaffMember =>
        Boolean(member) && typeof member === 'object' && ORDER.has((member as StaffMember).role),
    )
    .slice()
    .sort((a, b) => {
      const byRole = (ORDER.get(a.role) ?? 0) - (ORDER.get(b.role) ?? 0)
      if (byRole !== 0) return byRole
      return (a.createdAtISO ?? '').localeCompare(b.createdAtISO ?? '')
    })
}

/** Somebody's name as a page prints it, whichever half the club filled in. */
export const staffFullName = (member: StaffMember): string =>
  [member.firstName, member.lastName].filter((part) => part && part.trim() !== '').join(' ')
