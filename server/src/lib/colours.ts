import { badRequest } from './http.js'

/**
 * Colours are checked by the API, not by the browser that computed them.
 *
 * Every colour these records hold is printed into a CSS declaration on a page
 * anybody can read, and the `background` shorthand accepts `url(...)` — an
 * unchecked colour is a way to make every visitor of a public page fetch an
 * address of the writer's choosing. `colors` on a club went unchecked for a
 * long time and was printed exactly like that.
 *
 * The check therefore has to run wherever a record is written, and for a while
 * it did not: it lived inside the club `PATCH` alone, so a club *created* with
 * `colors: ["url(…)"]` kept the value, since nothing re-checks a field a later
 * PATCH does not mention. They live here so that the create and the update
 * cannot drift apart again, and so that they can be tested without a route.
 *
 * `null` clears, as everywhere else: a crest or logo that could not be measured
 * must be able to take the previous one's colour off the record with it.
 */
export const isColour = (value: unknown): boolean =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/** The colours on a club record, wherever one is written. */
export function assertTeamColours(record: Record<string, unknown>): void {
  if ('crestColor' in record && record.crestColor !== null && !isColour(record.crestColor)) {
    throw badRequest('crestColor must be a #rrggbb colour')
  }
  if (
    'crestOpaqueBackground' in record &&
    record.crestOpaqueBackground !== null &&
    typeof record.crestOpaqueBackground !== 'boolean'
  ) {
    throw badRequest('crestOpaqueBackground must be true or false')
  }
  if ('colors' in record) {
    const colors = record.colors
    if (!Array.isArray(colors) || colors.length === 0 || colors.length > 2 || !colors.every(isColour)) {
      throw badRequest('colors must be one or two #rrggbb colours')
    }
  }
}

/**
 * The colours on a competition record, wherever one is written.
 *
 * `logoColor` is read from the logo by the browser that uploaded it, the way a
 * club's `crestColor` is; `themeColor` is the organiser overriding it, kept
 * separate so that uploading a new logo does not discard a deliberate choice.
 * The public season header is painted from whichever of the two applies.
 */
export function assertCompetitionColours(record: Record<string, unknown>): void {
  for (const field of ['logoColor', 'themeColor'] as const) {
    if (field in record && record[field] !== null && !isColour(record[field])) {
      throw badRequest(`${field} must be a #rrggbb colour`)
    }
  }
  if (
    'logoOpaqueBackground' in record &&
    record.logoOpaqueBackground !== null &&
    typeof record.logoOpaqueBackground !== 'boolean'
  ) {
    throw badRequest('logoOpaqueBackground must be true or false')
  }
}
