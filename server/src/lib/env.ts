/**
 * Every value the API needs from its environment, read once at cold start.
 *
 * Nothing here is a secret: the Lambda gets its AWS credentials from its
 * execution role, so there is no access key to configure, rotate, or leak.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const TABLES = {
  ORGANIZERS: required('TABLE_ORGANIZERS'),
  TEAMS: required('TABLE_TEAMS'),
  TOURNAMENTS: required('TABLE_TOURNAMENTS'),
  MATCHES: process.env.TABLE_MATCHES ?? '',
  AUTH_USERS: required('TABLE_AUTH_USERS'),
  AUTH_SESSIONS: required('TABLE_AUTH_SESSIONS'),
  PASSWORD_RESETS: required('TABLE_PASSWORD_RESETS'),
  AUDIT: required('TABLE_AUDIT'),
  INVITES: required('TABLE_INVITES'),
  ENTRIES: required('TABLE_ENTRIES'),
} as const

/** An invitation to run a club is passed hand to hand, so it lives for a fortnight. */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000

/** Where password-reset links point. */
export const SITE_URL = (process.env.SITE_URL ?? 'https://myfootballtournament.com').replace(
  /\/$/,
  '',
)

/**
 * The address reset emails come from.
 *
 * Empty means email is not configured yet, and the API says so instead of
 * pretending a message was sent — the reset link can still be handed out by a
 * super admin in the meantime.
 */
export const MAIL_FROM = process.env.MAIL_FROM ?? ''

/** A reset link is short-lived on purpose: it is a password in an email. */
export const RESET_TTL_MS = 60 * 60 * 1000

export const S3_BUCKET = required('S3_BUCKET')

export const S3_PUBLIC_BASE_URL =
  process.env.S3_PUBLIC_BASE_URL ??
  `https://${S3_BUCKET}.s3.${process.env.AWS_REGION ?? 'us-east-1'}.amazonaws.com`

/** Origins allowed to call this API, comma separated. No wildcard on purpose. */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

/** How long a public GET may be cached by the browser and any CDN in front. */
export const PUBLIC_CACHE_SECONDS = Number(process.env.PUBLIC_CACHE_SECONDS ?? 60)

/** How long the API keeps a table read in Lambda memory between requests. */
export const SERVER_CACHE_SECONDS = Number(process.env.SERVER_CACHE_SECONDS ?? 60)

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Largest image a client may upload, enforced by S3 itself via the POST policy. */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024)
