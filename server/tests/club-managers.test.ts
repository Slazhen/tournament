import { describe, expect, it } from 'vitest'
import {
  assertHeadManager,
  assertIsClubManager,
  headCondition,
  headManagerOf,
  headUnchanged,
  whyManagerMayNotRemove,
} from '../src/lib/club-managers.js'
import { clubInviteStillStands } from '../src/routes/clubs.js'
import { HttpError } from '../src/lib/http.js'
import type { AuthUser, Team } from '../src/lib/types.js'

const account = (id: string, extra: Partial<AuthUser> = {}): AuthUser => ({
  id,
  email: `${id}@example.com`,
  role: 'team_manager',
  passwordHash: 'x'.repeat(128),
  salt: 'salt',
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  ...extra,
})

const head = account('head')
const helper = account('helper')
const stranger = account('stranger')
const owner = account('owner', { role: 'organizer', organizerId: 'org-1' })
const superAdmin = account('root', { role: 'super_admin' })

const club = (managerUserIds: string[], headManagerId?: string): Team => ({
  id: 'team-1',
  name: 'Club',
  organizerId: 'org-1',
  managerUserIds,
  headManagerId,
})

describe('who is the head of a club', () => {
  it('is the first manager when nobody has been named — every club before this', () => {
    expect(headManagerOf(club(['head', 'helper']))).toBe('head')
  })

  it('is the named manager once there is one', () => {
    expect(headManagerOf(club(['head', 'helper'], 'helper'))).toBe('helper')
  })

  it('ignores a name that is no longer on the list', () => {
    expect(headManagerOf(club(['helper'], 'head'))).toBe('helper')
  })

  it('is nobody on a club nobody runs', () => {
    expect(headManagerOf(club([]))).toBeNull()
    expect(headManagerOf({ managerUserIds: undefined })).toBeNull()
  })
})

describe('the club-only checks', () => {
  it('admits a manager and refuses everybody else, the owner and the super admin included', () => {
    expect(() => assertIsClubManager(helper, club(['head', 'helper']))).not.toThrow()
    for (const user of [stranger, owner, superAdmin]) {
      expect(() => assertIsClubManager(user, club(['head', 'helper']))).toThrow(HttpError)
    }
    // The owner of a club nobody runs may edit it, but is not one of its people.
    expect(() => assertIsClubManager(owner, club([]))).toThrow(HttpError)
  })

  it('lets only the head invite', () => {
    expect(() => assertHeadManager(head, club(['head', 'helper']))).not.toThrow()
    expect(() => assertHeadManager(helper, club(['head', 'helper']))).toThrow(HttpError)
    expect(() => assertHeadManager(helper, club(['head', 'helper'], 'helper'))).not.toThrow()
    expect(() => assertHeadManager(superAdmin, club(['head']))).toThrow(HttpError)
  })
})

describe('taking a manager off a club', () => {
  const two = club(['head', 'helper'])

  it('lets the head remove a helper', () => {
    expect(whyManagerMayNotRemove(head, two, 'helper')).toBeNull()
  })

  it('does not let a helper remove the head or anybody else', () => {
    expect(whyManagerMayNotRemove(helper, two, 'head')).not.toBeNull()
    expect(whyManagerMayNotRemove(helper, club(['head', 'helper', 'third']), 'third')).not.toBeNull()
  })

  it('lets a helper leave', () => {
    expect(whyManagerMayNotRemove(helper, two, 'helper')).toBeNull()
  })

  it('keeps the head until they have named a successor', () => {
    expect(whyManagerMayNotRemove(head, two, 'head')).not.toBeNull()
    expect(whyManagerMayNotRemove(head, club(['head']), 'head')).toBeNull()
  })

  it('refuses anybody not on the club, as caller or as target', () => {
    expect(whyManagerMayNotRemove(stranger, two, 'helper')).not.toBeNull()
    expect(whyManagerMayNotRemove(head, two, 'stranger')).not.toBeNull()
  })
})

describe('the condition that the caller is still the head', () => {
  it('asserts the stored name when it is on the list', () => {
    const condition = headCondition(club(['head', 'helper'], 'head'), 'head')
    expect(condition.expression).toContain('#head = :headActor')
    expect(condition.expression).toContain('contains(#managers, :headActor)')
  })

  it('asserts first place and no name when nobody was named', () => {
    const condition = headCondition(club(['head', 'helper']), 'head')
    expect(condition.expression).toContain('#managers[0] = :headActor')
    expect(condition.expression).toContain('attribute_not_exists(#head)')
  })

  it('asserts first place and the same stale name when the stored one has left', () => {
    const condition = headCondition(club(['helper'], 'head'), 'helper')
    expect(condition.expression).toContain('#managers[0] = :headActor')
    expect(condition.expression).toContain('NOT contains(#managers, :staleHead)')
    expect(condition.values).toEqual({ ':headActor': 'helper', ':staleHead': 'head' })
  })

  it('names only the attributes it uses, which DynamoDB insists on', () => {
    for (const team of [club(['head'], 'head'), club(['head']), club(['head'], 'gone')]) {
      const condition = headCondition(team, 'head')
      for (const alias of Object.keys(condition.names)) {
        expect(condition.expression).toContain(alias)
      }
      for (const placeholder of Object.keys(condition.values)) {
        expect(condition.expression).toContain(placeholder)
      }
    }
  })
})

describe('the condition that the head has not moved', () => {
  it('pins a named head, a stale name, or no name, as read', () => {
    expect(headUnchanged(club(['head', 'helper'], 'head')).expression).toContain(
      'contains(#managers, :readHead)',
    )
    expect(headUnchanged(club(['helper'], 'head')).expression).toContain(
      'NOT contains(#managers, :readHead)',
    )
    const absent = headUnchanged(club(['head', 'helper']))
    expect(absent.expression).toBe('attribute_not_exists(#head)')
    expect(absent.names).toEqual({ '#head': 'headManagerId' })
    expect(absent.values).toEqual({})
  })
})

describe('whether a link the club wrote still stands', () => {
  const linked = (at: string) => ({ head: at, helper: '2026-01-01T00:00:00.000Z' })
  const invite = (createdBy: string, createdAt: string) => ({ createdBy, createdAt })

  it('stands while its author is the head and joined before writing it', () => {
    const team = { ...club(['head', 'helper']), managerLinkedAt: linked('2026-02-01T00:00:00.000Z') }
    expect(clubInviteStillStands(invite('head', '2026-03-01T00:00:00.000Z'), team)).toBe(true)
  })

  it('falls once the author hands the club on, though they stay a manager', () => {
    const team = club(['head', 'helper'], 'helper')
    expect(clubInviteStillStands(invite('head', '2026-03-01T00:00:00.000Z'), team)).toBe(false)
  })

  it('stays dead for a head removed and later invited back', () => {
    const team = { ...club(['head']), managerLinkedAt: linked('2026-04-01T00:00:00.000Z') }
    expect(clubInviteStillStands(invite('head', '2026-03-01T00:00:00.000Z'), team)).toBe(false)
  })

  it('never stood for a helper', () => {
    expect(clubInviteStillStands(invite('helper', '2026-03-01T00:00:00.000Z'), club(['head', 'helper']))).toBe(
      false,
    )
  })
})
