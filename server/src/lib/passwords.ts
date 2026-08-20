import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const pbkdf2Async = promisify(pbkdf2)

/**
 * Password hashing, kept byte-for-byte compatible with the old browser-side
 * implementation (WebCrypto PBKDF2, SHA-512, 100k iterations, 512 derived bits,
 * salt used as its UTF-8 text). That compatibility is deliberate: every existing
 * account keeps working after the move to the server, with no password reset.
 */
const ITERATIONS = 100_000
const KEY_LENGTH_BYTES = 64
const DIGEST = 'sha512'

export function generateSalt(): string {
  return randomBytes(32).toString('hex')
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function generateId(): string {
  return randomBytes(16).toString('hex')
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH_BYTES, DIGEST)
  return derived.toString('hex')
}

/**
 * Compares a candidate password against a stored hash in constant time, so the
 * duration of a failed login says nothing about how much of the hash matched.
 */
export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
): Promise<boolean> {
  const actual = Buffer.from(await hashPassword(password, salt), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  if (actual.length !== expected.length || actual.length === 0) return false
  return timingSafeEqual(actual, expected)
}

/**
 * The minimum a password must clear to be accepted.
 *
 * The old code created both the super admin and every new organizer with the
 * password "123", hard-coded, on a site anyone can reach. Any password set
 * through this API has to be a real one.
 */
export function assertPasswordStrength(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Password must be at least 12 characters long')
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password must contain both letters and digits')
  }
}
