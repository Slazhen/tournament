import { SERVER_CACHE_SECONDS } from './env.js'

type Entry = { value: unknown; expiresAt: number }

const store = new Map<string, Entry>()

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
): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T
  }

  const value = await load()
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
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
