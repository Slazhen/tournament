/**
 * Video links on a match.
 *
 * The field takes any address and most of them are YouTube, so a match with one
 * plays it on the page rather than sending the visitor somewhere else. Anything
 * this cannot recognise is still worth a link: an unrecognised address answers
 * with nothing instead of a guessed embed, because an iframe pointed at a page
 * that refuses framing shows the visitor a blank box and no way out of it.
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

/** A video id as YouTube writes them: eleven characters of its own alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * Where a link starts, in seconds.
 *
 * YouTube writes this three ways — `90`, `90s` and `1m30s` — and a link copied
 * with "start at current time" ticked carries one of them.
 */
function startSeconds(raw: string | null): number | undefined {
  if (!raw) return undefined
  if (/^\d+$/.test(raw)) return Number(raw)

  const parts = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!parts) return undefined
  if (!parts[1] && !parts[2] && !parts[3]) return undefined

  return Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0)
}

/** The id of the single video an address names, whichever form it is written in. */
function videoIdOf(url: URL): string | undefined {
  const path = url.pathname.split('/').filter(Boolean)
  const host = url.hostname.toLowerCase()

  if (host === 'youtu.be' || host === 'www.youtu.be') return path[0]
  if (path[0] === 'watch') return url.searchParams.get('v') ?? undefined
  if (['embed', 'shorts', 'live', 'v'].includes(path[0] ?? '')) return path[1]

  return undefined
}

/** The address that plays `link` in an iframe, or nothing if it is not YouTube. */
export function youtubeEmbedUrl(link: string | undefined | null): string | undefined {
  const trimmed = link?.trim()
  if (!trimmed) return undefined

  let url: URL
  try {
    // An address typed by hand often has no scheme, and `new URL` throws on it.
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return undefined
  }

  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return undefined

  const id = videoIdOf(url)
  if (!id || !VIDEO_ID.test(id)) return undefined

  // The nocookie host, because a public match page should not hand every
  // visitor to YouTube's advertising cookies for a video the organiser embedded.
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`)
  const start = startSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'))
  if (start !== undefined && start > 0) embed.searchParams.set('start', String(start))

  return embed.toString()
}
