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
import { shade, translucent } from './crest'

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

/**
 * What every poster carries whatever is drawn on it: whose competition this is,
 * which season, and the colour and logo it is painted in.
 */
export type PostChrome = {
  competition: string
  season: string
  /** The line above the name: "Group A", "Round 5", "Division 1 — Final". */
  group?: string
  /** "After Round 7 · 8 Sep 2026", or a kick-off and a ground. */
  note?: string
  logo?: string
  /** A logo uploaded with its own background on it, which cannot be a watermark at full strength. */
  logoDimmed?: boolean
  /** The season's colour — `competitionColor(tournament)`. */
  color: string
}

/** A club, reduced to what a poster draws of it. */
export type PostClub = {
  name: string
  logo?: string
  /** The club's own colour, for the disc its initial sits on when the crest will not load. */
  color: string
}

export type TablePost = PostChrome & { rows: PostRow[] }

/** One fixture on the poster of a round, played or still to be played. */
export type PostFixture = {
  home: PostClub
  away: PostClub
  homeGoals?: number
  awayGoals?: number
  /** What stands in the middle where there is no score yet: "Sat 18:30", or nothing. */
  when?: string
}

export type FixturesPost = PostChrome & { fixtures: PostFixture[] }

/** A goal or a booking, on the side it belongs to. */
export type PostEvent = {
  side: 'home' | 'away'
  minute?: number
  /** The player, or "Unknown" for a goal the result counts and nobody has named. */
  label: string
  kind: 'goal' | 'yellow' | 'second_yellow' | 'red'
}

export type MatchPost = PostChrome & {
  home: PostClub
  away: PostClub
  homeGoals?: number
  awayGoals?: number
  /** The kick-off, drawn in place of the score while there is none. */
  when?: string
  events: PostEvent[]
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

/** A club's crest, or its initial on its own colour where there is no crest to draw. */
function drawCrest(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  club: { name: string; color: string },
  x: number,
  y: number,
  size: number,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (image) {
    drawCover(ctx, image, x, y, size)
  } else {
    ctx.fillStyle = club.color
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = '#ffffff'
    ctx.font = font(size * 0.46, 700)
    ctx.textAlign = 'center'
    ctx.fillText((club.name.trim().charAt(0) || 'T').toUpperCase(), x + size / 2, y + size * 0.66)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.lineWidth = 2
  ctx.stroke()
}

/** The dark plate everything below the header is drawn on. */
function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = 'rgba(8, 10, 14, 0.55)'
  roundedRect(ctx, x, y, w, h, 28)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 2
  ctx.stroke()
}

/** A poster with its ground and header drawn, and the room left for the rest. */
type Sheet = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  mark: HTMLImageElement | null
  /** Where what this poster is about may start, and how much height it has. */
  top: number
  height: number
}

/**
 * The half of a poster that is the same on all of them.
 *
 * The ground, the coloured header, the competition's logo as a tile and as a
 * watermark behind its name, and the seam under it. Three kinds of poster are
 * drawn from here — the table, a round, a match — and a header written out
 * three times would be three headers within a month.
 */
async function drawChrome(post: PostChrome): Promise<Sheet> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw the post.')

  const [logo, mark] = await Promise.all([
    loadImage(cdnUrl(post.logo)),
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

  const top = HEADER + 24
  return { canvas, ctx, mark, top, height: HEIGHT - FOOTER - 16 - top }
}

/**
 * The footer, and the PNG.
 *
 * Throws only where the browser refuses to produce an image at all, which the
 * caller shows as a message: everything that can be missing — a logo, a crest,
 * the round — is drawn as its absence instead.
 */
async function finishPost({ canvas, ctx, mark }: Sheet): Promise<Blob> {
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

/** The league table, drawn as a poster. */
export async function renderTablePost(post: TablePost): Promise<Blob> {
  // Started before the header is drawn rather than after it, so the crests are
  // on their way while the chrome's own two images are being fetched.
  const crestsLoading = Promise.all(post.rows.map((row) => loadImage(cdnUrl(row.logo))))
  const sheet = await drawChrome(post)
  const crests = await crestsLoading
  const { ctx } = sheet

  /* ---------- The table ---------- */

  const panelX = MARGIN
  const panelW = WIDTH - MARGIN * 2
  const areaTop = sheet.top
  const area = sheet.height
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

  drawPanel(ctx, panelX, panelY, panelW, panelH)

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

    drawCrest(ctx, crests[index], row, left + 56, middle - crestSize / 2, crestSize)

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

  return finishPost(sheet)
}

/**
 * A round, drawn as a poster: one line per fixture, the score where it has been
 * played and the kick-off where it has not.
 *
 * One layout for both, because a round is one thing whether or not it has been
 * played. What changes between the announcement and the result is only what
 * stands in the middle of the line.
 */
export async function renderFixturesPost(post: FixturesPost): Promise<Blob> {
  const crestsLoading = Promise.all(
    post.fixtures.flatMap((fixture) => [
      loadImage(cdnUrl(fixture.home.logo)),
      loadImage(cdnUrl(fixture.away.logo)),
    ]),
  )
  const sheet = await drawChrome(post)
  const crests = await crestsLoading
  const { ctx } = sheet

  const panelX = MARGIN
  const panelW = WIDTH - MARGIN * 2
  const padding = 28
  const count = post.fixtures.length
  const rowH = count > 0 ? Math.min(176, (sheet.height - padding * 2) / count) : 0
  const panelH = Math.min(sheet.height, rowH * count + padding * 2)
  const panelY = sheet.top + (sheet.height - panelH) / 2

  drawPanel(ctx, panelX, panelY, panelW, panelH)

  const left = panelX + 30
  const right = panelX + panelW - 30
  const centre = WIDTH / 2
  const crestSize = Math.max(14, Math.min(84, rowH - 52))
  const nameSize = Math.max(13, Math.min(32, rowH * 0.21))
  const scoreSize = Math.max(18, Math.min(52, rowH * 0.32))
  const whenSize = Math.max(15, Math.min(34, rowH * 0.22))
  const nameX = left + crestSize + 18

  ctx.save()
  roundedRect(ctx, panelX, panelY, panelW, panelH, 28)
  ctx.clip()

  post.fixtures.forEach((fixture, index) => {
    const top = panelY + padding + rowH * index
    const middle = top + rowH / 2
    const home = fixture.homeGoals
    const away = fixture.awayGoals
    const played = typeof home === 'number' && typeof away === 'number'

    if (index > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
      ctx.fillRect(left, top, right - left, 1)
    }

    drawCrest(ctx, crests[index * 2], fixture.home, left, middle - crestSize / 2, crestSize)
    drawCrest(
      ctx,
      crests[index * 2 + 1],
      fixture.away,
      right - crestSize,
      middle - crestSize / 2,
      crestSize,
    )

    // The side that lost is dimmed rather than marked. A poster of a round is
    // read at a glance, and a glance takes in which name is brighter long
    // before it takes in which number is larger.
    const beaten = (side: 'home' | 'away') =>
      played && (side === 'home' ? (home as number) < (away as number) : (away as number) < (home as number))

    // The middle is measured before the names are drawn rather than reserved in
    // advance: "0 : 2" and "18:30" are not the same width, and a gutter wide
    // enough for the widest of them cuts a club's name short on every line that
    // does not need it.
    ctx.textAlign = 'center'
    let middleWidth: number
    if (played) {
      const score = `${home} : ${away}`
      ctx.font = font(scoreSize, 700)
      middleWidth = ctx.measureText(score).width
      ctx.fillStyle = '#ffffff'
      ctx.fillText(score, centre, middle + scoreSize * 0.35)
    } else {
      const when = fixture.when ?? 'vs'
      ctx.font = font(whenSize, 600)
      middleWidth = ctx.measureText(when).width
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
      ctx.fillText(when, centre, middle + whenSize * 0.34)
    }

    const nameWidth = centre - middleWidth / 2 - 26 - nameX

    ctx.font = font(nameSize, 600)
    ctx.textAlign = 'left'
    ctx.fillStyle = beaten('home') ? 'rgba(255, 255, 255, 0.6)' : '#ffffff'
    ctx.fillText(fit(ctx, fixture.home.name, nameWidth), nameX, middle + nameSize * 0.34)
    ctx.textAlign = 'right'
    ctx.fillStyle = beaten('away') ? 'rgba(255, 255, 255, 0.6)' : '#ffffff'
    ctx.fillText(
      fit(ctx, fixture.away.name, nameWidth),
      right - crestSize - 18,
      middle + nameSize * 0.34,
    )
  })

  ctx.restore()
  return finishPost(sheet)
}

/**
 * What an event is drawn as: a ball for a goal, a card for a booking, and two
 * overlapping cards for a second yellow.
 *
 * Drawn rather than set in type, because this application has no emoji in it
 * and a letter in a circle is not what anybody reads a scoresheet as.
 */
function drawEventIcon(
  ctx: CanvasRenderingContext2D,
  kind: PostEvent['kind'],
  x: number,
  y: number,
  size: number,
): void {
  if (kind === 'goal') {
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    // One dark panel in the middle. Enough for it to read as a ball at this
    // size rather than as a bullet point.
    const radius = size * 0.2
    ctx.beginPath()
    for (let corner = 0; corner < 5; corner += 1) {
      const angle = -Math.PI / 2 + (corner * 2 * Math.PI) / 5
      const px = x + Math.cos(angle) * radius
      const py = y + Math.sin(angle) * radius
      if (corner === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = '#141c33'
    ctx.fill()
    return
  }

  const width = size * 0.6
  const height = size * 0.88
  const card = (offset: number, color: string) => {
    ctx.fillStyle = color
    roundedRect(ctx, x - width / 2 + offset, y - height / 2, width, height, 3)
    ctx.fill()
  }
  if (kind === 'second_yellow') {
    card(-3, '#EAB308')
    card(3, '#EF4444')
    return
  }
  card(0, kind === 'red' ? '#EF4444' : '#EAB308')
}

/**
 * One match, drawn as a poster: the plate with the score on it, and under it
 * everything that happened, on the side it happened to.
 *
 * The same shape as the match page — two clubs washed in their own colours with
 * the score between them, and a timeline down the middle — because somebody who
 * has read the page recognises the poster as the same match.
 */
export async function renderMatchPost(post: MatchPost): Promise<Blob> {
  const crestsLoading = Promise.all([
    loadImage(cdnUrl(post.home.logo)),
    loadImage(cdnUrl(post.away.logo)),
  ])
  const sheet = await drawChrome(post)
  const [homeCrest, awayCrest] = await crestsLoading
  const { ctx } = sheet

  const home = post.homeGoals
  const away = post.awayGoals
  const played = typeof home === 'number' && typeof away === 'number'
  const centre = WIDTH / 2

  /* ---------- The plate ---------- */

  const boardX = MARGIN
  const boardW = WIDTH - MARGIN * 2
  // A match with nothing recorded against it has no second panel, and an empty
  // one below the plate reads as a match nobody knows anything about. The plate
  // then has the poster to itself: it sits in the middle and is drawn larger,
  // because a fixture announcement is a picture of two clubs and a time.
  const told = post.events.length > 0
  const boardH = told ? 292 : 356
  const boardY = told ? sheet.top : sheet.top + (sheet.height - boardH) / 2

  drawPanel(ctx, boardX, boardY, boardW, boardH)

  ctx.save()
  roundedRect(ctx, boardX, boardY, boardW, boardH, 28)
  ctx.clip()

  // Each half washed in from its own edge and gone by the middle, so the score
  // reads on the dark ground whatever the two clubs happen to wear.
  const wash = (color: string, side: 'home' | 'away') => {
    const from = side === 'home' ? boardX : boardX + boardW
    const to = boardX + boardW * 0.5
    const gradient = ctx.createLinearGradient(from, 0, to, 0)
    gradient.addColorStop(0, translucent(color, 0.5))
    gradient.addColorStop(1, translucent(color, 0))
    ctx.fillStyle = gradient
    ctx.fillRect(boardX, boardY, boardW, boardH)
  }
  wash(post.home.color, 'home')
  wash(post.away.color, 'away')

  const crestSize = told ? 148 : 190
  const crestTop = boardY + (told ? 52 : 58)
  ;(['home', 'away'] as const).forEach((side) => {
    const club = side === 'home' ? post.home : post.away
    const image = side === 'home' ? homeCrest : awayCrest
    const x = boardX + boardW * (side === 'home' ? 0.21 : 0.79)
    drawCrest(ctx, image, club, x - crestSize / 2, crestTop, crestSize)

    const width = boardW * 0.36
    const size = fitSize(ctx, club.name, width, 700, [34, 30, 26, 22])
    ctx.font = font(size, 700)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(fit(ctx, club.name, width), x, crestTop + crestSize + 52)
  })

  // Everything in the middle hangs off the crests beside it rather than off the
  // top of the plate, so the plate can be drawn at either size.
  ctx.textAlign = 'center'
  if (played) {
    ctx.font = font(told ? 94 : 110, 700)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`${home} : ${away}`, centre, crestTop + crestSize * 0.76)
    ctx.font = font(23, 600)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.fillText('FULL TIME', centre, crestTop + crestSize * 0.76 + 46)
  } else {
    ctx.font = font(56, 700)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.fillText('vs', centre, crestTop + crestSize * 0.64)
    if (post.when) {
      ctx.font = font(30, 600)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
      ctx.fillText(fit(ctx, post.when, boardW * 0.28), centre, crestTop + crestSize * 0.64 + 52)
    }
  }
  ctx.restore()

  /* ---------- What happened ---------- */

  if (!told) {
    // One line under the plate rather than a panel with one sentence in it, and
    // only where there is something to say: a match still to be played says so
    // in the header and on the plate already.
    if (played) {
      ctx.textAlign = 'center'
      ctx.font = font(26, 500)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.fillText('No goals or bookings recorded', centre, boardY + boardH + 52)
    }
  } else {
    const eventsY = boardY + boardH + 16
    const eventsH = sheet.top + sheet.height - eventsY

    drawPanel(ctx, boardX, eventsY, boardW, eventsH)

    ctx.save()
    roundedRect(ctx, boardX, eventsY, boardW, eventsH, 28)
    ctx.clip()
    const padding = 30
    // A row cannot be thinner than the pill the minute sits on. A match with
    // more events than the panel has room for shows what fits and counts the
    // rest: squeezing thirty rows in does not make them readable, it makes them
    // overlap, and a poster that overlaps is worse than one that says there was
    // more.
    const room = Math.max(4, Math.floor((eventsH - padding * 2) / 26))
    const over = post.events.length > room
    const shown = over ? post.events.slice(0, room - 1) : post.events
    const lines = shown.length + (over ? 1 : 0)
    const rowH = Math.min(68, (eventsH - padding * 2) / lines)
    // Centred in the panel rather than hung from its top: a match with six
    // events would otherwise leave a third of the panel blank under the last.
    const rowsTop = eventsY + (eventsH - rowH * lines) / 2
    const labelSize = Math.max(13, Math.min(28, rowH * 0.42))
    const iconSize = Math.max(12, Math.min(26, rowH * 0.4))
    const minuteWidth = 86

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.fillRect(centre - 1, eventsY + 20, 2, eventsH - 40)

    shown.forEach((event, index) => {
      const middle = rowsTop + rowH * index + rowH / 2

      // Only where there is one. Plenty of scoresheets here are filled in from
      // memory days later, with every scorer named and not a single minute
      // among them, and a column of pills each saying "-" is a column of
      // nothing that the eye still has to travel down.
      if (typeof event.minute === 'number') {
        const minute = `${event.minute}'`
        const minuteSize = Math.max(12, labelSize * 0.72)
        ctx.textAlign = 'center'
        ctx.font = font(minuteSize, 600)
        // On a pill, because the divider runs down the middle and a number with
        // a line through it is a number somebody has to look at twice.
        const pillW = Math.max(minuteWidth * 0.62, ctx.measureText(minute).width + 24)
        const pillH = minuteSize * 1.9
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
        roundedRect(ctx, centre - pillW / 2, middle - pillH / 2, pillW, pillH, pillH / 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
        ctx.fillText(minute, centre, middle + minuteSize * 0.34)
      }

      // Everything about a row is mirrored: the side it belongs to decides
      // which way out of the middle it is drawn.
      const outward = event.side === 'home' ? -1 : 1
      const iconX = centre + outward * (minuteWidth / 2 + 16 + iconSize * 0.5)
      drawEventIcon(ctx, event.kind, iconX, middle, iconSize)

      const textX = iconX + outward * (iconSize * 0.5 + 14)
      const space =
        event.side === 'home' ? textX - (boardX + 26) : boardX + boardW - 26 - textX
      ctx.textAlign = event.side === 'home' ? 'right' : 'left'
      ctx.font = font(labelSize, 600)
      ctx.fillStyle = event.kind === 'goal' ? '#ffffff' : 'rgba(255, 255, 255, 0.78)'
      ctx.fillText(fit(ctx, event.label, Math.max(40, space)), textX, middle + labelSize * 0.34)
    })

    if (over) {
      ctx.textAlign = 'center'
      ctx.font = font(Math.max(13, labelSize * 0.8), 600)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.fillText(
        `+ ${post.events.length - shown.length} more`,
        centre,
        rowsTop + rowH * shown.length + rowH / 2 + labelSize * 0.3,
      )
    }

    ctx.restore()
  }

  return finishPost(sheet)
}
