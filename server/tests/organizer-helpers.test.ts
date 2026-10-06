import { describe, expect, it } from 'vitest'
import {
  assertOrganizerOwner,
  grantedByOrganizer,
  helperClaimMode,
  membersOf,
  ownerOf,
  readHelperEmail,
  revocationOf,
} from '../src/lib/organizer-helpers.js'
import { HttpError } from '../src/lib/http.js'
import type { AuthUser } from '../src/lib/types.js'

const account = (id: string, extra: Partial<AuthUser> = {}): AuthUser => ({
  id,
  email: `${id}@example.com`,
  role: 'organizer',
  organizerId: 'org-1',
  passwordHash: 'x'.repeat(128),
  salt: 'salt',
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  ...extra,
})

const first = account('first', { createdAt: '2025-01-01T00:00:00.000Z' })
const second = account('second', { createdAt: '2026-03-01T00:00:00.000Z' })
const removed = account('removed', { createdAt: '2024-01-01T00:00:00.000Z', isActive: false })
const elsewhere = account('elsewhere', { organizerId: 'org-2', createdAt: '2020-01-01T00:00:00.000Z' })
const root = account('root', { role: 'super_admin', organizerId: 'org-1', createdAt: '2019-01-01T00:00:00.000Z' })
const accounts = [second, removed, elsewhere, root, first]
const organizer = { id: 'org-1' }

const status = (fn: () => void): number | null => {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof HttpError ? error.status : -1
  }
}

describe('who runs an organiser', () => {
  it('is its live organiser accounts, oldest first, never a switched-off one or a super admin', () => {
    expect(membersOf('org-1', accounts).map((member) => member.id)).toEqual(['first', 'second'])
  })

  it('is owned by the oldest when nobody is named, which is every organiser before helpers', () => {
    expect(ownerOf(organizer, accounts)?.id).toBe('first')
  })

  it('is owned by the named member once there is one', () => {
    expect(ownerOf({ id: 'org-1', ownerUserId: 'second' }, accounts)?.id).toBe('second')
  })

  it('falls back to the oldest when the named owner is gone or switched off', () => {
    expect(ownerOf({ id: 'org-1', ownerUserId: 'deleted' }, accounts)?.id).toBe('first')
    expect(ownerOf({ id: 'org-1', ownerUserId: 'removed' }, accounts)?.id).toBe('first')
  })

  it('counts a coach who joined later as later, however old their account is', () => {
    const coach = account('coach', {
      createdAt: '2020-01-01T00:00:00.000Z',
      organizerSince: '2026-10-01T00:00:00.000Z',
    })
    expect(ownerOf(organizer, [first, coach])?.id).toBe('first')
    expect(membersOf('org-1', [coach, first]).map((member) => member.id)).toEqual(['first', 'coach'])
  })

  it('is owned by nobody with no live account', () => {
    expect(ownerOf(organizer, [removed])).toBeNull()
  })
})

describe('what only the owner may do', () => {
  it('admits the owner and the super admin', () => {
    expect(status(() => assertOrganizerOwner(first, organizer, accounts))).toBeNull()
    expect(status(() => assertOrganizerOwner(account('admin', { role: 'super_admin', organizerId: undefined }), organizer, accounts))).toBeNull()
  })

  it('refuses a helper, and another organiser', () => {
    expect(status(() => assertOrganizerOwner(second, organizer, accounts))).toBe(403)
    expect(status(() => assertOrganizerOwner(elsewhere, organizer, accounts))).toBe(403)
  })

  it('moves with the owner', () => {
    const handedOver = { id: 'org-1', ownerUserId: 'second' }
    expect(status(() => assertOrganizerOwner(second, handedOver, accounts))).toBeNull()
    expect(status(() => assertOrganizerOwner(first, handedOver, accounts))).toBe(403)
  })
})

describe('what a helper invitation does to the address', () => {
  it('opens an account where there is none', () => {
    expect(helperClaimMode(null, 'org-1')).toEqual({ mode: 'new' })
  })

  it('takes a live club manager after they sign in, and refuses a switched-off one', () => {
    expect(helperClaimMode(account('coach', { role: 'team_manager', organizerId: undefined }), 'org-1')).toEqual({ mode: 'signin' })
    expect(helperClaimMode(account('coach', { role: 'team_manager', organizerId: undefined, isActive: false }), 'org-1')).toHaveProperty('refused')
  })

  it("brings back this organiser's removed helper, and nobody else's", () => {
    expect(helperClaimMode(removed, 'org-1')).toEqual({ mode: 'reactivate' })
    expect(helperClaimMode(removed, 'org-2')).toHaveProperty('refused')
  })

  it('refuses a live member, another organiser, a referee and a super admin', () => {
    expect(helperClaimMode(second, 'org-1')).toHaveProperty('refused')
    expect(helperClaimMode(elsewhere, 'org-1')).toHaveProperty('refused')
    expect(helperClaimMode(account('ref', { role: 'referee', organizerId: undefined }), 'org-1')).toHaveProperty('refused')
    expect(helperClaimMode(root, 'org-1')).toHaveProperty('refused')
  })
})

describe('removing a helper', () => {
  it('leaves a club manager behind when they run clubs, and switches the account off when not', () => {
    expect(revocationOf({ teamIds: ['team-1'] })).toBe('demote')
    expect(revocationOf({ teamIds: [] })).toBe('deactivate')
    expect(revocationOf({})).toBe('deactivate')
  })
})

describe('the invited address', () => {
  it('is trimmed and lower-cased, and refused when it is not one', () => {
    expect(readHelperEmail('  Coach@Example.COM ')).toBe('coach@example.com')
    expect(() => readHelperEmail('nobody')).toThrow()
    expect(() => readHelperEmail('two words@example.com')).toThrow()
    expect(() => readHelperEmail(undefined)).toThrow()
  })
})

describe('which club links an organiser account holds by owning the club', () => {
  const helper = account('helper', { organizerSince: '2026-10-01T00:00:00.000Z' })
  const club = (linkedAt?: string, organizerId = 'org-1') => ({
    organizerId,
    managerLinkedAt: (linkedAt ? { helper: linkedAt } : {}) as Record<string, string>,
  })

  it('is one linked after they joined the organiser', () => {
    expect(grantedByOrganizer(club('2026-10-02T00:00:00.000Z'), helper, 'org-1')).toBe(true)
  })

  it('is not the club a coach ran before joining', () => {
    expect(grantedByOrganizer(club('2025-05-01T00:00:00.000Z'), helper, 'org-1')).toBe(false)
  })

  it("is every undated link of the organiser's first login, as before", () => {
    expect(grantedByOrganizer(club(), first, 'org-1')).toBe(true)
  })

  it("is never a helper's undated link, which predates their joining", () => {
    expect(grantedByOrganizer(club(), helper, 'org-1')).toBe(false)
  })

  it("is never another organiser's club, nor a club manager's link", () => {
    expect(grantedByOrganizer(club('2026-10-02T00:00:00.000Z', 'org-2'), helper, 'org-1')).toBe(false)
    expect(grantedByOrganizer(club(), account('coach', { role: 'team_manager', organizerId: undefined }), 'org-1')).toBe(false)
  })
})
