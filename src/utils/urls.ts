import type { Tournament } from '../types'
import type { Organizer } from '../types'

/**
 * Convert a string to a URL-friendly slug (lowercase)
 * Examples: "Homebush Futsal" -> "homebush_futsal", "Asian Cup 2026" -> "asian_cup_2026"
 */
export function slugify(text: string): string {
  return text
    .trim()
    // Convert to lowercase
    .toLowerCase()
    // Replace spaces and special characters with underscores
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    // Remove multiple underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
}

/**
 * The minimum a tournament-like object needs for slug and URL helpers.
 *
 * Listing pages only ever load summaries (no matches, no lineups), so these
 * helpers accept that lighter shape rather than forcing a full tournament to be
 * fetched just to build a link.
 */
export type SluggableTournament = Pick<Tournament, 'id' | 'name' | 'organizerId' | 'createdAtISO'>

/**
 * Get the year from a tournament's creation date
 */
export function getTournamentYear(tournament: SluggableTournament): string {
  if (!tournament.createdAtISO) {
    return new Date().getFullYear().toString()
  }
  return new Date(tournament.createdAtISO).getFullYear().toString()
}

/**
 * Generate a tournament slug from tournament name and year (lowercase)
 * Example: "Asian Cup 2026" + 2026 -> "asian_cup_2026_2026"
 */
export function generateTournamentSlug(tournament: SluggableTournament): string {
  const nameSlug = slugify(tournament.name)
  const year = getTournamentYear(tournament)
  return `${nameSlug}_${year}`
}

/**
 * Generate organizer slug from organizer name
 * Example: "Homebush Futsal" -> "homebush_futsal"
 */
export function generateOrganizerSlug(organizer: Organizer | { name: string }): string {
  return slugify(organizer.name)
}

/**
 * The organiser's readable address for one competition.
 * Format: /tournaments/:orgSlug/:tournamentSlug
 *
 * Under /tournaments rather than at the root, because /:orgSlug/:tournamentSlug
 * is the public page.
 */
export function getAdminTournamentUrl(tournament: SluggableTournament, organizer: Organizer | { name: string }): string {
  const orgSlug = generateOrganizerSlug(organizer)
  const tournamentSlug = generateTournamentSlug(tournament)
  return `/tournaments/${orgSlug}/${tournamentSlug}`
}

/**
 * Generate public tournament URL
 * Format: /:orgSlug/:tournamentSlug
 */
export function getPublicTournamentUrl(tournament: SluggableTournament, organizer: Organizer | { name: string }): string {
  const orgSlug = generateOrganizerSlug(organizer)
  const tournamentSlug = generateTournamentSlug(tournament)
  return `/${orgSlug}/${tournamentSlug}`
}

/**
 * Find tournament by slug and organizer slug (case-insensitive for backward compatibility)
 */
export function findTournamentBySlug<T extends SluggableTournament>(
  tournaments: T[],
  orgSlug: string,
  tournamentSlug: string,
  organizers: Organizer[]
): T | undefined {
  if (!tournaments?.length || !organizers?.length) return undefined
  // Normalize: decode, trim, lowercase
  const normalizedOrgSlug = decodeURIComponent(orgSlug).trim().toLowerCase()
  const normalizedTournamentSlug = decodeURIComponent(tournamentSlug).trim().toLowerCase()

  const organizer = organizers.find(org => {
    const orgSlugLower = generateOrganizerSlug(org).toLowerCase()
    return orgSlugLower === normalizedOrgSlug
  })
  if (!organizer) return undefined

  return tournaments.find(t => {
    if (t.organizerId !== organizer.id) return false
    const tSlug = generateTournamentSlug(t).toLowerCase()
    return tSlug === normalizedTournamentSlug
  })
}
