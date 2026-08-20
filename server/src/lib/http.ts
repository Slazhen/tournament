import { ALLOWED_ORIGINS } from './env.js'

export type ApiResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

/**
 * An error with an HTTP status attached. Anything thrown that is NOT an
 * HttpError is treated as a bug and reported to the client as a bare 500, so
 * internal details (table names, stack traces) never reach the browser.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const badRequest = (message: string) => new HttpError(400, message)
export const unauthorized = (message = 'Not authenticated') => new HttpError(401, message)
export const forbidden = (message = 'Not allowed') => new HttpError(403, message)
export const notFound = (message = 'Not found') => new HttpError(404, message)

/**
 * CORS headers for a single request.
 *
 * The allow-list is explicit: an origin that is not configured gets no CORS
 * header at all, which makes the browser refuse the response. Credentials are
 * never allowed because the API authenticates with a bearer token, not cookies.
 */
export function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-max-age': '600',
    vary: 'origin',
  }
}

export function json(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): ApiResponse {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      // Default for everything: never let a shared cache hold a response.
      // Public GET routes override this explicitly.
      'cache-control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body ?? null),
  }
}

export function noContent(extraHeaders: Record<string, string> = {}): ApiResponse {
  return { statusCode: 204, headers: extraHeaders, body: '' }
}

/** Parses a JSON request body, rejecting anything that is not a JSON object. */
export function parseJsonBody(raw: string | undefined, isBase64 = false): Record<string, unknown> {
  if (!raw) return {}
  const text = isBase64 ? Buffer.from(raw, 'base64').toString('utf8') : raw
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw badRequest('Request body is not valid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw badRequest('Request body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}
