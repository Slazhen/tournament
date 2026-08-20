import { describe, expect, it } from 'vitest'
import {
  assertCanAccessOrganizer,
  assertSuperAdmin,
  extractBearerToken,
  isSuperAdmin,
} from '../src/lib/auth.js'
import { toPublicUser, type AuthUser } from '../src/lib/types.js'
import { buildUpdate } from '../src/lib/ddb.js'
import { corsHeaders, parseJsonBody, HttpError } from '../src/lib/http.js'

const organizerUser: AuthUser = {
  id: 'u-1',
  email: 'org@example.com',
  role: 'organizer',
  organizerId: 'org-1',
  passwordHash: 'x'.repeat(128),
  salt: 'salt',
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
}

const superAdmin: AuthUser = { ...organizerUser, id: 'u-0', role: 'super_admin', organizerId: undefined }

describe('bearer tokens', () => {
  it('reads a token out of the header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123')
    expect(extractBearerToken('bearer abc123')).toBe('abc123')
  })

  it('ignores anything that is not a bearer header', () => {
    expect(extractBearerToken(undefined)).toBeNull()
    expect(extractBearerToken('')).toBeNull()
    expect(extractBearerToken('Basic abc123')).toBeNull()
    expect(extractBearerToken('abc123')).toBeNull()
  })
})

describe('organizer isolation', () => {
  it('lets an organizer reach their own data', () => {
    expect(() => assertCanAccessOrganizer(organizerUser, 'org-1')).not.toThrow()
  })

  it("refuses another organizer's data", () => {
    try {
      assertCanAccessOrganizer(organizerUser, 'org-2')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as HttpError).status).toBe(403)
    }
  })

  it('refuses when no organizer is named at all', () => {
    expect(() => assertCanAccessOrganizer(organizerUser, undefined)).toThrow(HttpError)
    expect(() => assertCanAccessOrganizer(organizerUser, '')).toThrow(HttpError)
  })

  it('lets the super admin reach everything', () => {
    expect(isSuperAdmin(superAdmin)).toBe(true)
    expect(() => assertCanAccessOrganizer(superAdmin, 'org-2')).not.toThrow()
    expect(() => assertSuperAdmin(superAdmin)).not.toThrow()
  })

  it('keeps an organizer out of super admin routes', () => {
    expect(() => assertSuperAdmin(organizerUser)).toThrow(HttpError)
  })
})

describe('user serialization', () => {
  it('never lets the hash or salt out', () => {
    const publicUser = toPublicUser(organizerUser) as Record<string, unknown>
    expect(publicUser.passwordHash).toBeUndefined()
    expect(publicUser.salt).toBeUndefined()
    expect(publicUser.id).toBe('u-1')
    expect(JSON.stringify(publicUser)).not.toContain('xxxx')
  })
})

describe('update expressions', () => {
  it('aliases every attribute name, including DynamoDB reserved words', () => {
    const update = buildUpdate({ name: 'Cup', location: { name: 'Field 1' }, status: 'live' })
    expect(update?.UpdateExpression).toBe('SET #u0 = :u0, #u1 = :u1, #u2 = :u2')
    expect(Object.values(update!.ExpressionAttributeNames)).toEqual(['name', 'location', 'status'])
  })

  it('refuses to overwrite immutable fields', () => {
    const update = buildUpdate({ id: 'hacked', organizerId: 'org-2', name: 'Cup' }, [
      'id',
      'organizerId',
    ])
    expect(Object.values(update!.ExpressionAttributeNames)).toEqual(['name'])
  })

  it('returns null when there is nothing to change', () => {
    expect(buildUpdate({ id: 'x' })).toBeNull()
    expect(buildUpdate({ name: undefined })).toBeNull()
  })
})

describe('CORS', () => {
  it('echoes an allowed origin', () => {
    expect(corsHeaders('https://myfootballtournament.com')['access-control-allow-origin']).toBe(
      'https://myfootballtournament.com',
    )
  })

  it('sends no CORS headers to an unknown origin', () => {
    expect(corsHeaders('https://evil.example')).toEqual({})
    expect(corsHeaders(undefined)).toEqual({})
  })
})

describe('request bodies', () => {
  it('parses a JSON object', () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonBody(undefined)).toEqual({})
  })

  it('rejects JSON that is not an object', () => {
    expect(() => parseJsonBody('[1,2]')).toThrow(HttpError)
    expect(() => parseJsonBody('"text"')).toThrow(HttpError)
    expect(() => parseJsonBody('not json')).toThrow(HttpError)
  })

  it('decodes a base64 body', () => {
    expect(parseJsonBody(Buffer.from('{"a":2}').toString('base64'), true)).toEqual({ a: 2 })
  })
})
