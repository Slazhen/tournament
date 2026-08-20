import { authenticate } from './lib/auth.js'
import type { AuthUser } from './lib/types.js'

/** Everything a route handler is allowed to know about the incoming request. */
export type RequestContext = {
  method: string
  path: string
  query: Record<string, string>
  body: Record<string, unknown>
  headers: Record<string, string>
  sourceIp?: string
  userAgent?: string
  /** Resolves the authenticated caller, or throws 401. Memoized per request. */
  user: () => Promise<AuthUser>
}

export function createContext(input: Omit<RequestContext, 'user'>): RequestContext {
  let cachedUser: Promise<AuthUser> | null = null

  return {
    ...input,
    user: () => {
      cachedUser ??= authenticate(input.headers['authorization'])
      return cachedUser
    },
  }
}
