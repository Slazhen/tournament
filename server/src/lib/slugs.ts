/**
 * Slug rules, kept identical to the client's src/utils/urls.ts.
 *
 * Public URLs look like /homebush_futsal/autumn_cup_2026. Resolving that used to
 * take a round trip of its own: the browser downloaded every tournament summary
 * just to map the slug back to an id, then fetched the tournament. The server
 * can do the same match against data it already has in memory.
 */

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function organizerSlug(organizer: { name: string }): string {
  return slugify(organizer.name)
}

/** A tournament's slug is its name plus the year it was created. */
export function tournamentSlug(tournament: { name: string; createdAtISO?: string }): string {
  const year = tournament.createdAtISO
    ? new Date(tournament.createdAtISO).getFullYear()
    : new Date().getFullYear()
  return `${slugify(tournament.name)}_${year}`
}

/** The competition a season belongs to: /homebush_futsal/homebush_futsal_premier_league */
export function seriesSlug(tournament: { name: string; seriesName?: unknown }): string {
  const series = typeof tournament.seriesName === 'string' ? tournament.seriesName : ''
  return slugify(series || tournament.name)
}

/** The season within it: .../2025 */
export function seasonSlug(tournament: { seasonLabel?: unknown; createdAtISO?: string }): string {
  const label = typeof tournament.seasonLabel === 'string' ? tournament.seasonLabel.trim() : ''
  if (label) return slugify(label)
  const year = tournament.createdAtISO
    ? new Date(tournament.createdAtISO).getFullYear()
    : new Date().getFullYear()
  return String(year)
}

/** Seasons of one competition, grouped by the id they share. */
export function seriesKey(tournament: { id: string; seriesId?: unknown }): string {
  return typeof tournament.seriesId === 'string' && tournament.seriesId
    ? tournament.seriesId
    : tournament.id
}
