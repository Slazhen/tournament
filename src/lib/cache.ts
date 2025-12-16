/**
 * Simple in-memory cache with TTL for reducing DynamoDB reads
 * This significantly reduces costs by avoiding redundant queries
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>()
  private defaultTTL = 60 * 60 * 1000 // 60 minutes default (increased for read-heavy operations to reduce costs)

  set<T>(key: string, data: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs || this.defaultTTL)
    this.cache.set(key, { data, expiresAt })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }

  clearPattern(pattern: string): void {
    const regex = new RegExp(pattern)
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
      }
    }
  }
}

export const cache = new SimpleCache()

// Cache key generators
export const cacheKeys = {
  organizers: {
    all: 'organizers:all',
    byId: (id: string) => `organizers:${id}`,
  },
  tournaments: {
    all: 'tournaments:all',
    byId: (id: string) => `tournaments:${id}`,
    byOrganizer: (organizerId: string) => `tournaments:organizer:${organizerId}`,
  },
  teams: {
    all: 'teams:all',
    byId: (id: string) => `teams:${id}`,
    byOrganizer: (organizerId: string) => `teams:organizer:${organizerId}`,
  },
}

