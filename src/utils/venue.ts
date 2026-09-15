/**
 * A ground, and the map it can be opened on.
 *
 * The name is free text and organisers paste map links straight into it, so the
 * season header used to read the raw `https://maps.app.goo.gl/...` as its own
 * text. A pasted link becomes the destination of the line, never its text —
 * which is what every venue entered before `link` existed looks like, and is
 * why none of them had to be migrated for this to read correctly.
 *
 * One place answers it for the season header and the match page alike: two
 * copies of "is this a name or an address" would disagree the first time either
 * was changed.
 */
export type VenueSource = { name?: string; link?: string }

/** Only http(s), because the answer is printed into an `href`. */
export const isUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value.trim()))

/**
 * What to show for a venue: the text of the line, and where it leads.
 *
 * Null when there is nothing to show at all. A link with no name is drawn as
 * "View on map" rather than as the address itself, which is unreadable —
 * `named` is false for exactly that case, because a poster or anything else
 * that cannot be clicked has nothing to say with it.
 */
export function describeVenue(
  location?: VenueSource | null,
): { label: string; href?: string; named: boolean } | null {
  if (!location) return null

  const name = location.name?.trim()
  const link = location.link?.trim()
  const href = (isUrl(link) ? link : undefined) || (isUrl(name) ? name : undefined)
  const named = Boolean(name && !isUrl(name))

  if (named) return { label: name as string, href, named: true }
  if (href) return { label: 'View on map', href, named: false }
  return null
}
