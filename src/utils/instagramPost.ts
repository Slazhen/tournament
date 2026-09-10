/**
 * The standings as a picture, for Instagram.
 *
 * Instagram has no way of accepting a post from a web page, so what this
 * produces is a file: 1080x1350, the shape the feed gives a portrait post,
 * drawn in the season's own colour with the competition's logo, the clubs'
 * crests and this application's mark on it. The person downloads it, or hands
 * it to the phone's share sheet, and posts it themselves.
 *
 * It is drawn on a canvas rather than photographed off the page. The table on
 * screen is ten columns of small type built for a browser window, and it reads
 * as nothing at all on a phone in a feed; a poster is a different layout of the
 * same numbers, so the layout is here and the numbers still come from
 * `utils/standings.ts`.
 *
 * Every image drawn onto it is loaded with `crossOrigin`, and that is the whole
 * reason the image CDN answers with `Access-Control-Allow-Origin` (the response
 * headers policy in `server/template.yaml`). A canvas that has drawn a
 * cross-origin image without it is tainted and refuses `toBlob` — the same wall
 * `readCrestAppearance` hit, which is why a crest's colour is read while the
 * browser still holds the file. A crest that will not load is drawn as the
 * club's initial on the club's own colour instead: an image the browser refuses
 * has to cost one badge, not the whole poster.
 */
import { cdnUrl } from './images'
import { allMatches, isPlayed } from './matches'
import { logoMarkDataUrl } from './logoMark'
import type { Match, Tournament } from '../types'
import { shade } from './crest'

/** What a row is marked as, in the same vocabulary the page's table uses. */
export type PostMark = 'gold' | 'silver' | 'bronze' | 'advance' | 'second' | 'none'

export type PostRow = {
  name: string
  logo?: string
  /** The club's own colour, for the disc its initial sits on when the crest will not load. */
  color: string
  p: number
  gd: number
  pts: number
  mark: PostMark
  /** Out of the competition: drawn faint, as the page draws it. */
  eliminated?: boolean
}

export type TablePost = {
  competition: string
  season: string
  /** "Group A", where the season is drawn as more than one table. */
  group?: string
  /** "After Round 7 · 8 Sep 2026". */
  note?: string
  logo?: string
  /** A logo uploaded with its own background on it, which cannot be a watermark at full strength. */
  logoDimmed?: boolean
  /** The season's colour — `competitionColor(tournament)`. */
  color: string
  rows: PostRow[]
}

const WIDTH = 1080
const HEIGHT = 1350
const MARGIN = 56
const HEADER = 300
const FOOTER = 118

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`

const MARK_COLOR: Record<Exclude<PostMark, 'none'>, string> = {
  gold: '#EAB308',
  silver: '#9CA3AF',
  bronze: '#F97316',
  advance: '#22C55E',
  second: '#3B82F6',
}

const MARK_TINT: Record<Exclude<PostMark, 'none'>, string> = {
  gold: 'rgba(234, 179, 8, 0.10)',
  silver: 'rgba(156, 163, 175, 0.08)',
  bronze: 'rgba(249, 115, 22, 0.08)',
  advance: 'rgba(34, 197, 94, 0.10)',
  second: 'rgba(59, 130, 246, 0.10)',
}

/**
 * How far the season has got, as one line under its name.
 *
 * Counted up from the first round and stopped at the first one that is not
 * finished, rather than taken as the highest finished round there is: a
 * postponed fixture in round two does not turn a played round three into "After
 * Round 3", which is a table somebody corrects in the comments. League rounds
 * are stored from zero and printed from one, which is the trap `roundLabel`
 * exists for.
 */
export function standingsNote(tournament: Tournament, now: Date = new Date()): string {
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const rounds = new Map<number, Match[]>()
  for (const match of allMatches(tournament)) {
    if (match.isPlayoff || typeof match.round !== 'number') continue
    const played = rounds.get(match.round) ?? []
    played.push(match)
    rounds.set(match.round, played)
  }

  let complete = -1
  for (const round of [...rounds.keys()].sort((a, b) => a - b)) {
    if (!(rounds.get(round) ?? []).every(isPlayed)) break
    complete = round
  }

  return complete < 0 ? date : `After Round ${complete + 1} · ${date}`
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/**
 * The address a canvas has to fetch an image from.
 *
 * The page has already drawn every one of these crests with a plain `<img>`,
 * and the browser answers the canvas's `crossOrigin` request from that cached
 * copy — which carries no `Access-Control-Allow-Origin`, because the request
 * that fetched it asked for none — so the check fails and the image does not
 * load at all. It is the same object under both addresses; the query string
 * exists only to keep the two apart in the browser's own cache. The
 * distribution forwards no query string, so the edge sees the same key and
 * answers both from the same cached object, and S3 behind it ignores a
 * parameter it does not know.
 *
 * `data:` and `blob:` are left alone: nothing is cached under them and they
 * take no query string.
 */
const forCanvas = (src: string): string =>
  /^https?:/i.test(src) ? `${src}${src.includes('?') ? '&' : '?'}canvas=1` : src

/**
 * An image, or nothing.
 *
 * Nothing is a normal answer here and never an error: a club with no crest, an
 * address that 404s after the object was deleted, a CDN that has not been given
 * its CORS header yet. The caller draws a fallback and the poster is still
 * produced.
 */
function loadImage(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    let settled = false
    const done = (value: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    // A request that never answers must not hold the button in "Drawing…" for
    // ever; the badge it would have filled is drawn as an initial instead.
    const timer = window.setTimeout(() => done(null), 8000)
    const settle = (value: HTMLImageElement | null) => {
      window.clearTimeout(timer)
      done(value)
    }
    image.crossOrigin = 'anonymous'
    image.onload = () => settle(image)
    image.onerror = () => settle(null)
    image.src = forCanvas(src)
  })
}

/** The whole image inside the box, its own proportions kept. */
function drawContain(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.min(w / image.width, h / image.height)
  const width = image.width * scale
  const height = image.height * scale
  ctx.drawImage(image, x + (w - width) / 2, y + (h - height) / 2, width, height)
}

/** The box filled by the image, whatever that costs its edges — the crests' `object-cover`. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
): void {
  const scale = Math.max(size / image.width, size / image.height)
  const width = image.width * scale
  const height = image.height * scale
  ctx.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height)
}

/** The competition's logo as the ground of the header, faded into the colour. */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  opacity: number,
): void {
  const layer = document.createElement('canvas')
  layer.width = size
  layer.height = size
  const paint = layer.getContext('2d')
  if (!paint) return

  drawContain(paint, image, 0, 0, size, size)

  // The same radial mask the season header uses, applied by drawing the fade
  // over the logo and keeping only what is under it.
  const mask = paint.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2)
  mask.addColorStop(0, 'rgba(0, 0, 0, 1)')
  mask.addColorStop(0.52, 'rgba(0, 0, 0, 1)')
  mask.addColorStop(1, 'rgba(0, 0, 0, 0)')
  paint.globalCompositeOperation = 'destination-in'
  paint.fillStyle = mask
  paint.fillRect(0, 0, size, size)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.drawImage(layer, x, y)
  ctx.restore()
}

/** The text, cut with an ellipsis where the column ends. Assumes the font is already set. */
function fit(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value
  let text = value
  while (text.length > 1 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1)
  return `${text.trimEnd()}…`
}

/** The largest of the offered sizes this text fits on one line at. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  weight: number,
  sizes: number[],
): number {
  for (const size of sizes) {
    ctx.font = font(size, weight)
    if (ctx.measureText(value).width <= maxWidth) return size
  }
  return sizes[sizes.length - 1]
}

/**
 * Draw the poster and hand back the PNG.
 *
 * Throws only where the browser refuses to produce an image at all, which the
 * caller shows as a message: everything that can be missing — a logo, a crest,
 * the round — is drawn as its absence instead.
 */
export async function renderTablePost(post: TablePost): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw the post.')

  const [logo, crests, mark] = await Promise.all([
    loadImage(cdnUrl(post.logo)),
    Promise.all(post.rows.map((row) => loadImage(cdnUrl(row.logo)))),
    loadImage(logoMarkDataUrl(96)),
  ])

  const base = post.color
  ctx.textBaseline = 'alphabetic'

  /* ---------- The ground ---------- */

  const ground = ctx.createLinearGradient(0, 0, WIDTH * 0.6, HEIGHT)
  ground.addColorStop(0, shade(base, -0.5))
  ground.addColorStop(0.5, shade(base, -0.72))
  ground.addColorStop(1, shade(base, -0.82))
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  /* ---------- The header ---------- */

  const band = ctx.createLinearGradient(0, HEADER, WIDTH, 0)
  band.addColorStop(0, shade(base, -0.42))
  band.addColorStop(0.55, shade(base, -0.12))
  band.addColorStop(1, shade(base, 0.08))
  ctx.fillStyle = band
  ctx.fillRect(0, 0, WIDTH, HEADER)

  if (logo) drawWatermark(ctx, logo, WIDTH - 320, -20, 340, post.logoDimmed ? 0.1 : 0.16)

  // Enough shadow on the left for the name to sit on, whatever the logo behind
  // it turns out to be.
  const shadow = ctx.createLinearGradient(0, 0, WIDTH, HEADER)
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0.5)')
  shadow.addColorStop(0.52, 'rgba(0, 0, 0, 0.18)')
  shadow.addColorStop(1, 'rgba(255, 255, 255, 0.04)')
  ctx.fillStyle = shadow
  ctx.fillRect(0, 0, WIDTH, HEADER)

  // The seam, drawn rather than left to happen: the header and the ground under
  // it are two shades of the same colour, and an unmarked edge between them
  // reads as a printing fault.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.fillRect(0, HEADER - 1, WIDTH, 2)

  // The logo again, printed rather than washed, on the tile the page gives it.
  const tile = 132
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
  roundedRect(ctx, MARGIN, 80, tile, tile, 30)
  ctx.fill()
  if (logo) {
    ctx.save()
    roundedRect(ctx, MARGIN + 10, 90, tile - 20, tile - 20, 22)
    ctx.clip()
    drawContain(ctx, logo, MARGIN + 10, 90, tile - 20, tile - 20)
    ctx.restore()
  }

  const textX = MARGIN + tile + 30
  const textWidth = WIDTH - textX - MARGIN
  let y = 74

  ctx.textAlign = 'left'
  if (post.group) {
    y += 26
    ctx.font = font(26, 600)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.fillText(fit(ctx, post.group.toUpperCase(), textWidth), textX, y)
    y += 12
  }

  const titleSize = fitSize(ctx, post.competition, textWidth, 700, [54, 48, 42, 38, 34])
  y += titleSize
  ctx.font = font(titleSize, 700)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(fit(ctx, post.competition, textWidth), textX, y)

  y += 44
  ctx.font = font(30, 500)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
  ctx.fillText(fit(ctx, post.season, textWidth), textX, y)

  if (post.note) {
    y += 38
    ctx.font = font(26, 400)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.fillText(fit(ctx, post.note, textWidth), textX, y)
  }

  /* ---------- The table ---------- */

  const panelX = MARGIN
  const panelW = WIDTH - MARGIN * 2
  const areaTop = HEADER + 24
  const area = HEIGHT - FOOTER - 16 - areaTop
  // Room for the top padding, the column labels and the rule under them.
  const labels = 96
  const padding = 24
  // A row grows with the room it has — a group of four is the commonest table
  // in this application and a poster of four thin rows above half a page of
  // nothing is not one — and stops growing before a row becomes a banner.
  const rowH =
    post.rows.length > 0 ? Math.min(150, (area - labels - padding) / post.rows.length) : 0
  const panelH = Math.min(area, labels + rowH * post.rows.length + padding)
  // Centred in what is left rather than hung from the header, so a short table
  // sits in the middle of the poster instead of leaving a hole under itself.
  const panelY = areaTop + (area - panelH) / 2

  ctx.fillStyle = 'rgba(8, 10, 14, 0.55)'
  roundedRect(ctx, panelX, panelY, panelW, panelH, 28)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 2
  ctx.stroke()

  const left = panelX + 28
  const right = panelX + panelW - 28
  const ptsX = right
  const gdX = ptsX - 108
  const pX = gdX - 96

  // The column labels, and the rule under them.
  const labelsY = panelY + 62
  ctx.font = font(24, 600)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.textAlign = 'left'
  ctx.fillText('TEAM', left, labelsY)
  ctx.textAlign = 'right'
  ctx.fillText('P', pX, labelsY)
  ctx.fillText('GD', gdX, labelsY)
  ctx.fillText('PTS', ptsX, labelsY)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.fillRect(left, labelsY + 22, right - left, 2)

  const rowsTop = labelsY + 34
  // Every one of these is floored as well as capped. A league of fifty clubs
  // gives a row a dozen pixels, and a negative radius is not a small badge —
  // `arc` throws on it, and the whole poster is lost to a table that would
  // merely have been cramped.
  const crestSize = Math.max(14, Math.min(76, rowH - 16))
  const badgeR = Math.max(8, Math.min(28, rowH * 0.27))
  // The name stops growing well before the row does: a club is identified by
  // reading its name, and type large enough to be cut in half identifies less
  // than type that fits.
  const nameSize = Math.max(14, Math.min(34, rowH * 0.42))
  const valueSize = Math.max(13, Math.min(34, rowH * 0.37))
  const nameX = left + 56 + crestSize + 20
  const nameWidth = pX - 80 - nameX

  ctx.save()
  roundedRect(ctx, panelX, panelY, panelW, panelH, 28)
  ctx.clip()

  post.rows.forEach((row, index) => {
    const top = rowsTop + rowH * index
    const middle = top + rowH / 2

    ctx.save()
    if (row.eliminated) ctx.globalAlpha = 0.5

    if (row.mark !== 'none') {
      ctx.fillStyle = MARK_TINT[row.mark]
      ctx.fillRect(left - 12, top, right - left + 24, rowH)
    }

    if (index > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
      ctx.fillRect(left, top, right - left, 1)
    }

    // The position: in a filled disc where the row is marked, plain where it is
    // not — the same distinction the page's table draws.
    ctx.textAlign = 'center'
    if (row.mark === 'none') {
      ctx.font = font(Math.min(34, nameSize * 0.82), 600)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.fillText(String(index + 1), left + 22, middle + nameSize * 0.3)
    } else {
      ctx.beginPath()
      ctx.arc(left + 22, middle, badgeR, 0, Math.PI * 2)
      ctx.fillStyle = MARK_COLOR[row.mark]
      ctx.fill()
      ctx.font = font(Math.min(32, badgeR * 1.2), 700)
      ctx.fillStyle = '#0d1013'
      ctx.fillText(String(index + 1), left + 22, middle + badgeR * 0.36)
    }

    // The crest, or the club's initial on the club's own colour.
    const crestX = left + 56
    const crestY = middle - crestSize / 2
    const crest = crests[index]
    ctx.save()
    ctx.beginPath()
    ctx.arc(crestX + crestSize / 2, crestY + crestSize / 2, crestSize / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    if (crest) {
      drawCover(ctx, crest, crestX, crestY, crestSize)
    } else {
      ctx.fillStyle = row.color
      ctx.fillRect(crestX, crestY, crestSize, crestSize)
      ctx.fillStyle = '#ffffff'
      ctx.font = font(crestSize * 0.46, 700)
      ctx.textAlign = 'center'
      ctx.fillText(
        (row.name.trim().charAt(0) || 'T').toUpperCase(),
        crestX + crestSize / 2,
        crestY + crestSize * 0.66,
      )
    }
    ctx.restore()
    ctx.beginPath()
    ctx.arc(crestX + crestSize / 2, crestY + crestSize / 2, crestSize / 2, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.font = font(nameSize, 600)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(fit(ctx, row.name, nameWidth), nameX, middle + nameSize * 0.34)

    ctx.textAlign = 'right'
    ctx.font = font(valueSize, 500)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)'
    ctx.fillText(String(row.p), pX, middle + valueSize * 0.34)
    ctx.fillText(row.gd > 0 ? `+${row.gd}` : String(row.gd), gdX, middle + valueSize * 0.34)

    ctx.font = font(Math.min(44, valueSize * 1.2), 700)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(row.pts), ptsX, middle + valueSize * 0.38)

    ctx.restore()
  })

  ctx.restore()

  /* ---------- The footer ---------- */

  const markSize = 46
  const name = 'MFTournament'
  const site = 'myfootballtournament.com'
  ctx.font = font(30, 700)
  const nameW = ctx.measureText(name).width
  ctx.font = font(26, 400)
  const siteW = ctx.measureText(site).width
  const total = markSize + 16 + nameW + 18 + siteW
  const footerY = HEIGHT - FOOTER / 2
  let cursor = (WIDTH - total) / 2

  if (mark) {
    ctx.drawImage(mark, cursor, footerY - markSize / 2, markSize, markSize)
  }
  cursor += markSize + 16
  ctx.textAlign = 'left'
  ctx.font = font(30, 700)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.fillText(name, cursor, footerY + 10)
  cursor += nameW + 18
  ctx.font = font(26, 400)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.fillText(site, cursor, footerY + 9)

  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((value) => resolve(value), 'image/png')
    } catch {
      // A tainted canvas. Everything drawn here is either same-origin or loaded
      // with CORS, so this means the CDN answered without the header.
      resolve(null)
    }
  })
  if (!blob) throw new Error('The post could not be saved as an image in this browser.')
  return blob
}
