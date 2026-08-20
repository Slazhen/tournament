/**
 * Match times are stored as UTC ISO strings but every organiser thinks in local
 * time, so the two have to be converted deliberately.
 *
 * The pages used to mix the two: the date came from `iso.split('T')[0]`, which is
 * the UTC calendar day, while the time came from `toTimeString()`, which is
 * local. In Sydney that means a 8:00 kick-off is stored as 22:00 UTC the day
 * before — and the date field showed the wrong day while the time field showed
 * the right hour. These helpers keep both on local time.
 */

const pad = (value: number) => String(value).padStart(2, '0')

/** The local calendar day of an ISO timestamp, as YYYY-MM-DD. */
export function localDatePart(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The local time of an ISO timestamp, as HH:MM. */
export function localTimePart(iso?: string, fallback = '12:00'): string {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallback
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Builds a UTC ISO string from a local date and time.
 *
 * `new Date('2026-08-20T19:30')` — no timezone suffix — is parsed as local time
 * by every current browser, which is exactly what is wanted here.
 */
export function combineLocal(date: string, time: string): string | undefined {
  if (!date) return undefined
  const combined = new Date(`${date}T${time || '12:00'}`)
  if (Number.isNaN(combined.getTime())) return undefined
  return combined.toISOString()
}

/** Formats a stored timestamp for display, in the reader's own timezone. */
export function formatMatchDateTime(iso?: string): string {
  if (!iso) return 'TBC'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'TBC'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
