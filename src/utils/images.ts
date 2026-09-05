/**
 * Where a stored image is fetched from.
 *
 * The image bucket sits in us-east-1 with nothing in front of it and the
 * audience is in Australia: one crest measured between 250 and 1100 ms from
 * Sydney, and a public organiser page draws thirty of them. That is most of
 * what a first visit — an incognito window, or anybody arriving for the first
 * time — spends its time on, because the crests carry a year of `immutable`
 * and so cost nothing on every visit after it. CloudFront in front of the same
 * bucket serves them from an edge in Sydney instead.
 *
 * The swap happens here, where a URL is drawn, and not in the records. Every
 * URL in DynamoDB still names the bucket, so `S3_PUBLIC_BASE_URL` on the API is
 * unchanged, the presigned upload is unchanged, and the delete route still
 * recognises what the browser hands it. It also covers the keys from the
 * browser-side era — `<32 hex>.png` rather than `logo-<timestamp>.png`, which
 * are the seven heaviest images on that page — without anything having to
 * migrate them.
 *
 * With no CDN configured this returns the URL untouched, which is exactly what
 * the site did before, so the code ships before the distribution exists and
 * falls back to the bucket if the distribution is ever taken away.
 *
 * Anything drawn from a record goes through this. A raw `src={team.logo}` is
 * not wrong, it just quietly pays the old price.
 */

const CDN_BASE = (import.meta.env.VITE_IMAGE_CDN_URL as string | undefined)?.replace(/\/$/, '')

/**
 * The one bucket this application stores images in, named rather than matched
 * loosely: a pattern for "any S3 host" would rewrite an address that has
 * nothing to do with us onto our own distribution.
 */
const BUCKET_URL = /^https:\/\/football-tournaments-images\.s3\.[a-z0-9-]+\.amazonaws\.com\//

export function cdnUrl(url: string): string
export function cdnUrl(url: string | undefined): string | undefined
export function cdnUrl(url: string | undefined): string | undefined {
  if (!url || !CDN_BASE) return url
  const key = url.replace(BUCKET_URL, '')
  // A data: URL from an upload still being previewed, or an address on some
  // other host, is returned as it came in.
  return key === url ? url : `${CDN_BASE}/${key}`
}
