/**
 * What a club's crest looks like, reduced to the two facts a page needs.
 *
 * The public club header is built from the crest rather than from the colours
 * an organiser typed into a form, because the two disagree more often than not:
 * a club whose crest is dark olive had a fluorescent green in `colors`, and one
 * whose crest is navy had orange. The colour is therefore read from the picture
 * itself.
 *
 * It is read *at upload time*, in the browser that already holds the file, and
 * stored on the club. Reading it later from the published image is not possible:
 * the image bucket answers without CORS headers, so a canvas that has drawn it
 * refuses to hand back its pixels. Moving the work to the API is no better —
 * crests are uploaded straight to S3 with a presigned POST, so no Lambda ever
 * sees the bytes.
 */

export type CrestAppearance = {
  /** The crest's own dominant colour, as `#rrggbb`. */
  crestColor: string
  /**
   * Whether the artwork is painted onto a solid rectangle rather than cut out.
   *
   * Plenty of clubs upload a JPEG, or a PNG with a white plate behind the
   * badge. Such a crest cannot be used as a watermark at full strength — it
   * reads as a grey box, not as a badge — so the header dims it instead.
   */
  crestOpaqueBackground: boolean
}

const HEX = /^#[0-9a-f]{6}$/i

const toHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

const rgbOf = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as [number, number, number]
}

/** Relative luminance, the WCAG one, for deciding what colour type goes on top. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const blend = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = rgbOf(a)
  const [r2, g2, b2] = rgbOf(b)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

/** Positive lightens towards white, negative darkens towards black. */
export const shade = (hex: string, amount: number): string =>
  amount >= 0 ? blend(hex, '#ffffff', amount) : blend(hex, '#000000', -amount)

/** Black or white, whichever can be read on top of `background`. */
export const inkOn = (background: string): string => (luminance(background) > 0.42 ? '#0d1013' : '#ffffff')

/**
 * The colour a club's header is painted in.
 *
 * The crest wins where it has been read, the club's first colour stands in for
 * every club whose crest predates this or has none, and a very light colour is
 * pushed down far enough for white type to sit on it — a header is a background,
 * and a pale one leaves the club's name unreadable whatever colour it is set in.
 */
export function headerColor(team: { crestColor?: string | null; colors?: string[] }): string {
  const chosen = [team.crestColor, team.colors?.[0]].find((value) => typeof value === 'string' && HEX.test(value))
  const base = chosen ?? '#3B82F6'
  return luminance(base) > 0.62 ? blend(base, '#0a0d10', 0.3) : base
}

/** Sample size. Large enough to keep the badge's own colours, small enough to be instant. */
const SAMPLE = 96
/** Colours are counted in buckets this wide, so near-identical pixels count together. */
const BUCKET = 24

async function bitmapOf(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file)
  // Safari before 15 has no createImageBitmap for files.
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('The crest could not be read.'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Read the dominant colour of a crest, and whether it sits on a solid plate.
 *
 * The dominant colour is the most common *saturated* one rather than simply the
 * most common one: on a typical badge the largest area by far is the white or
 * black it is drawn on, and a header painted in that says nothing about the
 * club. A crest with no saturated colour at all — a black-and-white badge —
 * falls back to its commonest colour, which is the honest answer for it.
 *
 * Returns `null` when the file cannot be read. The caller then saves the crest
 * without an appearance, and the header falls back to `team.colors`.
 */
export async function readCrestAppearance(file: File): Promise<CrestAppearance | null> {
  try {
    const source = await bitmapOf(file)
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE
    canvas.height = SAMPLE
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(source as CanvasImageSource, 0, 0, SAMPLE, SAMPLE)
    const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE)

    const at = (x: number, y: number) => {
      const offset = (y * SAMPLE + x) * 4
      return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]] as const
    }
    const corners = [at(0, 0), at(SAMPLE - 1, 0), at(0, SAMPLE - 1), at(SAMPLE - 1, SAMPLE - 1)]
    const opaqueCorners = corners.every((corner) => corner[3] > 200)
    // Four corners of the same colour mean a plate behind the badge; four
    // different ones mean the badge itself reaches the edge, which is not a
    // plate and must not have its colour discarded below.
    const spread = Math.max(
      ...[0, 1, 2].map((channel) => {
        const values = corners.map((corner) => corner[channel])
        return Math.max(...values) - Math.min(...values)
      }),
    )
    const plate = opaqueCorners && spread < 24
    const plateColor = plate
      ? ([0, 1, 2].map((channel) => corners.reduce((sum, corner) => sum + corner[channel], 0) / 4) as number[])
      : null

    const vivid = new Map<string, { count: number; r: number; g: number; b: number }>()
    const any = new Map<string, { count: number; r: number; g: number; b: number }>()
    let counted = 0

    for (let index = 0; index < SAMPLE * SAMPLE; index += 1) {
      const offset = index * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      if (data[offset + 3] < 128) continue
      if (plateColor) {
        const distance =
          Math.abs(r - plateColor[0]) + Math.abs(g - plateColor[1]) + Math.abs(b - plateColor[2])
        if (distance < 60) continue
      }
      counted += 1
      const key = `${Math.round(r / BUCKET)},${Math.round(g / BUCKET)},${Math.round(b / BUCKET)}`
      const push = (into: Map<string, { count: number; r: number; g: number; b: number }>) => {
        const bucket = into.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
        bucket.count += 1
        bucket.r += r
        bucket.g += g
        bucket.b += b
        into.set(key, bucket)
      }
      push(any)
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const saturation = max === 0 ? 0 : (max - min) / max
      if (saturation > 0.35 && max / 255 > 0.25) push(vivid)
    }

    if (counted === 0) return null

    const best = (from: Map<string, { count: number; r: number; g: number; b: number }>) =>
      [...from.values()].sort((a, b) => b.count - a.count)[0]
    // A handful of saturated pixels is an accent, not the crest's colour: a
    // black badge with a red dot on it should not produce a red header.
    const vividBest = best(vivid)
    const winner = vividBest && vividBest.count > counted * 0.08 ? vividBest : best(any)
    if (!winner) return null

    return {
      crestColor: toHex(winner.r / winner.count, winner.g / winner.count, winner.b / winner.count),
      crestOpaqueBackground: plate,
    }
  } catch {
    // A crest that cannot be measured is still a crest worth saving.
    return null
  }
}
