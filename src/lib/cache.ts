/**
 * Simple cache with TTL for reducing DynamoDB reads.
 * Backed by localStorage so a page refresh or return visit (same browser) reuses
 * previously fetched data instead of re-scanning DynamoDB, which lowers read costs.
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const STORAGE_PREFIX = 'ft_cache:'

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>()
  private defaultTTL = 60 * 60 * 1000 // 60 minutes default (increased for read-heavy operations to reduce costs)

  private get storage(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
      return null
    }
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs || this.defaultTTL)
    this.cache.set(key, { data, expiresAt })

    // Write-through to localStorage so the value survives full page reloads.
    const storage = this.storage
    if (storage) {
      try {
        storage.setItem(STORAGE_PREFIX + key, JSON.stringify({ data, expiresAt }))
      } catch {
        // Quota exceeded or serialization issue: in-memory cache still works.
      }
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) ?? this.readFromStorage<T>(key)
    if (!entry) {
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.delete(key)
      return null
    }

    // Re-populate in-memory map if it came from storage.
    this.cache.set(key, entry)
    return entry.data as T
  }

  private readFromStorage<T>(key: string): CacheEntry<T> | null {
    const storage = this.storage
    if (!storage) return null
    try {
      const raw = storage.getItem(STORAGE_PREFIX + key)
      if (!raw) return null
      return JSON.parse(raw) as CacheEntry<T>
    } catch {
      return null
    }
  }

  private delete(key: string): void {
    this.cache.delete(key)
    const storage = this.storage
    if (storage) {
      try {
        storage.removeItem(STORAGE_PREFIX + key)
      } catch {
        // ignore
      }
    }
  }

  clear(key?: string): void {
    if (key) {
      this.delete(key)
      return
    }
    this.cache.clear()
    const storage = this.storage
    if (storage) {
      try {
        const toRemove: string[] = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k)
        }
        toRemove.forEach(k => storage.removeItem(k))
      } catch {
        // ignore
      }
    }
  }

  clearPattern(pattern: string): void {
    const regex = new RegExp(pattern)
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.delete(key)
      }
    }
    const storage = this.storage
    if (storage) {
      try {
        const toRemove: string[] = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k && k.startsWith(STORAGE_PREFIX) && regex.test(k.slice(STORAGE_PREFIX.length))) {
            toRemove.push(k)
          }
        }
        toRemove.forEach(k => storage.removeItem(k))
      } catch {
        // ignore
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
    summaries: 'tournaments:summaries',
    byId: (id: string) => `tournaments:${id}`,
    byOrganizer: (organizerId: string) => `tournaments:organizer:${organizerId}`,
  },
  teams: {
    all: 'teams:all',
    byId: (id: string) => `teams:${id}`,
    byOrganizer: (organizerId: string) => `teams:organizer:${organizerId}`,
  },
}

