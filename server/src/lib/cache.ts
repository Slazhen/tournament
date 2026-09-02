import { ADMIN_CACHE_SECONDS, SERVER_CACHE_SECONDS } from './env.js'

type Entry = { value: unknown; storedAt: number; expiresAt: number }

const store = new Map<string, Entry>()

/**
 * How fresh a particular read needs its answer to be.
 *
 * `invalidate` below only clears the container it runs in, and there are
 * several: a write lands in one warm Lambda, and every other one keeps its copy
 * of the list until the TTL runs out. That is harmless for a visitor reading a
 * table a minute after it changed, and wrong for the organiser who has just
 * created something and is looking at the screen that should show it — which is
 * how "the tournaments are not linked to my organiser" was reported, a minute
 * before they were.
 *
 * So a signed-in read passes `adminRead` and gets an answer no older than
 * ADMIN_CACHE_SECONDS — zero by default, which means straight to DynamoDB. The
 * value it loads is still stored under the same key with the full TTL, so an
 * organiser refreshing their screen also warms the copy the public reads: the
 * traffic this cache exists for is unaffected.
 */
export type ReadOptions = { maxAgeSeconds?: number }

export const adminRead: ReadOptions = { maxAgeSeconds: ADMIN_CACHE_SECONDS }

/**
 * A read that must come from DynamoDB whatever the configuration says.
 *
 * For the two places where a stale list is not a slow screen but a wrong
 * decision: what deleting an organiser would take with it, and the deletion
 * itself. A competition created a minute ago and missing from a cached copy
 * would survive as an orphan owned by nobody.
 */
export const liveRead: ReadOptions = { maxAgeSeconds: 0 }

/**
 * A cache that lives in the Lambda's memory and is shared by every visitor
 * that hits a warm container.
 *
 * This is the piece that fixes the DynamoDB bill. The old design cached in each
 * visitor's localStorage, so every new browser (and every crawler, which keeps
 * no storage at all) re-read the tables from scratch. Here one read serves
 * everyone until it expires.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  options?: ReadOptions,
): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  const maxAge = options?.maxAgeSeconds

  // Strictly younger than maxAge, so that zero means zero: `<=` would serve an
  // entry stored in the same millisecond, and `liveRead` promises the database.
  const usable =
    hit !== undefined &&
    hit.expiresAt > now &&
    (maxAge === undefined || now - hit.storedAt < maxAge * 1000)

  if (usable) {
    return hit.value as T
  }

  const value = await load()
  const loadedAt = Date.now()
  store.set(key, { value, storedAt: loadedAt, expiresAt: loadedAt + ttlSeconds * 1000 })
  return value
}

export const defaultTtl = SERVER_CACHE_SECONDS

/** Drops cached entries after a write so the next read reflects the change. */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

export function invalidateAll(): void {
  store.clear()
}

/** Test seam: lets a test start from a known-empty cache. */
export function __resetCacheForTests(): void {
  store.clear()
}
