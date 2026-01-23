import type { Tournament } from '../types'
import type { Organizer } from '../types'

/**
 * Convert a string to a URL-friendly slug
 * Examples: "Homebush Futsal" -> "homebush_futsal", "Asian Cup 2026" -> "AsianCup2026"
 */
export function slugify(text: string): string {
  return text
    .trim()
    // Replace spaces and special characters with underscores
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    // Remove multiple underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
}

/**
 * Get the year from a tournament's creation date
 */
export function getTournamentYear(tournament: Tournament): string {
  if (!tournament.createdAtISO) {
    return new Date().getFullYear().toString()
  }
  return new Date(tournament.createdAtISO).getFullYear().toString()
}

/**
 * Generate a tournament slug from tournament name and year
 * Example: "Asian Cup 2026" + 2026 -> "AsianCup2026_2026"
 */
export function generateTournamentSlug(tournament: Tournament): string {
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
 * Generate admin tournament URL
 * Format: /admin/:orgSlug/:tournamentSlug
 */
export function getAdminTournamentUrl(tournament: Tournament, organizer: Organizer | { name: string }): string {
  const orgSlug = generateOrganizerSlug(organizer)
  const tournamentSlug = generateTournamentSlug(tournament)
  return `/admin/${orgSlug}/${tournamentSlug}`
}

/**
 * Generate public tournament URL
 * Format: /:orgSlug/:tournamentSlug
 */
export function getPublicTournamentUrl(tournament: Tournament, organizer: Organizer | { name: string }): string {
  const orgSlug = generateOrganizerSlug(organizer)
  const tournamentSlug = generateTournamentSlug(tournament)
  return `/${orgSlug}/${tournamentSlug}`
}

/**
 * Find tournament by slug and organizer slug
 */
export function findTournamentBySlug(
  tournaments: Tournament[],
  orgSlug: string,
  tournamentSlug: string,
  organizers: Organizer[]
): Tournament | undefined {
  // Find organizer by slug
  const organizer = organizers.find(org => generateOrganizerSlug(org) === orgSlug)
  if (!organizer) return undefined

  // Find tournament by slug and organizer
  return tournaments.find(t => {
    if (t.organizerId !== organizer.id) return false
    const tSlug = generateTournamentSlug(t)
    return tSlug === tournamentSlug
  })
}
