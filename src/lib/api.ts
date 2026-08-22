/**
 * The only way this app talks to a server.
 *
 * There is deliberately no AWS SDK and no credential anywhere in the browser
 * bundle: every read and write goes through the API, which holds the database
 * permissions under its own execution role.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')

if (!BASE_URL && import.meta.env.PROD) {
  // Failing loudly at startup beats a site that silently shows no data.
  throw new Error('VITE_API_BASE_URL is not configured')
}

const TOKEN_KEY = 'auth_token'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }

  get isAuthError(): boolean {
    return this.status === 401
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* private browsing mode; the session simply will not survive a reload */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nothing to clear */
  }
}

export const isSignedIn = (): boolean => getToken() !== null

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return null as T

  const text = await response.text()
  const payload = text ? safeParse(text) : null

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? `Request failed (${response.status})`

    // A rejected token is dead: drop it so the app stops presenting it and the
    // user is sent back to the login screen.
    if (response.status === 401) clearToken()

    throw new ApiError(response.status, message)
  }

  return payload as T
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  /** Replaces a whole list, so sending it twice means the same as sending it once. */
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
