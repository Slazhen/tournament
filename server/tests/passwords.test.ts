import { describe, expect, it } from 'vitest'
import {
  assertPasswordStrength,
  hashPassword,
  verifyPassword,
  generateSalt,
} from '../src/lib/passwords.js'

describe('password hashing', () => {
  /**
   * This is the contract with every account that already exists. The old app
   * hashed passwords in the browser with WebCrypto PBKDF2-SHA512, 100k
   * iterations, 512 bits, using the salt's UTF-8 text. If this vector ever
   * changes, every stored password stops verifying and everyone is locked out.
   */
  it('matches the hash the old browser implementation produced', async () => {
    const hash = await hashPassword('correct horse battery staple', 'a1b2c3d4')
    expect(hash.slice(0, 64)).toBe(
      '381bd81bea2bc7f7a41d3ee410068870ebc26f655f92e606f9e2e785a444f1b2',
    )
    expect(hash).toHaveLength(128)
  })

  it('verifies a correct password and rejects a wrong one', async () => {
    const salt = generateSalt()
    const hash = await hashPassword('a-real-password-1', salt)

    await expect(verifyPassword('a-real-password-1', hash, salt)).resolves.toBe(true)
    await expect(verifyPassword('a-real-password-2', hash, salt)).resolves.toBe(false)
  })

  it('rejects a hash of the wrong length instead of throwing', async () => {
    await expect(verifyPassword('anything', 'deadbeef', 'salt')).resolves.toBe(false)
    await expect(verifyPassword('anything', '', 'salt')).resolves.toBe(false)
  })

  it('produces a different hash per salt', async () => {
    const first = await hashPassword('same-password-1', generateSalt())
    const second = await hashPassword('same-password-1', generateSalt())
    expect(first).not.toBe(second)
  })
})

describe('password strength', () => {
  it('rejects the defaults the old code shipped with', () => {
    expect(() => assertPasswordStrength('123')).toThrow()
    expect(() => assertPasswordStrength('')).toThrow()
    expect(() => assertPasswordStrength(undefined)).toThrow()
  })

  it('rejects long passwords with no digits and short ones with digits', () => {
    expect(() => assertPasswordStrength('allletterspassword')).toThrow()
    expect(() => assertPasswordStrength('sh0rt1')).toThrow()
  })

  // Seven, not twelve. The boundary earns a test of its own because the number
  // lives in two places at once — the check, and the message people read.
  it('draws the line at seven characters', () => {
    expect(() => assertPasswordStrength('futsal1')).not.toThrow()
    expect(() => assertPasswordStrength('futsa1')).toThrow(/7 characters/)
  })

  it('accepts a reasonable password', () => {
    expect(() => assertPasswordStrength('tournament2026Season')).not.toThrow()
  })
})
