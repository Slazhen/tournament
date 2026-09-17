import { describe, expect, it } from 'vitest'
import {
  AUDIT_GROUPS,
  buildAuditQuery,
  decodeCursor,
  encodeCursor,
  parseAuditFilter,
} from '../src/lib/audit.js'
import { HttpError } from '../src/lib/http.js'

function refused(fn: () => unknown): number | undefined {
  try {
    fn()
  } catch (error) {
    return error instanceof HttpError ? error.status : -1
  }
  return undefined
}

describe('audit filter', () => {
  it('reads nothing as no filter at all', () => {
    expect(parseAuditFilter({})).toEqual({})
    expect(parseAuditFilter({ organizerId: '', role: '', limit: '100' })).toEqual({})
    expect(buildAuditQuery({}).FilterExpression).toBeUndefined()
  })

  it('lower-cases the address, because contains() is case-sensitive', () => {
    expect(parseAuditFilter({ email: ' Coach@Example.com ' }).email).toBe('coach@example.com')
  })

  it('normalises the range and refuses one that runs backwards', () => {
    expect(parseAuditFilter({ from: '2026-09-01' }).from).toBe('2026-09-01T00:00:00.000Z')
    expect(refused(() => parseAuditFilter({ from: 'yesterday' }))).toBe(400)
    expect(
      refused(() => parseAuditFilter({ from: '2026-09-02T00:00:00Z', to: '2026-09-01T00:00:00Z' })),
    ).toBe(400)
  })

  it('refuses what it does not recognise rather than matching nothing', () => {
    expect(refused(() => parseAuditFilter({ role: 'owner' }))).toBe(400)
    expect(refused(() => parseAuditFilter({ group: 'toString' }))).toBe(400)
    expect(refused(() => parseAuditFilter({ action: 'team.update) OR (x' }))).toBe(400)
    expect(refused(() => parseAuditFilter({ organizerId: 'a b' }))).toBe(400)
    expect(refused(() => parseAuditFilter({ organizerId: ['a'] }))).toBe(400)
    // A script is an author too, and the screen offers its id as a filter.
    expect(parseAuditFilter({ actorId: 'script:merge-teams' }).actorId).toBe('script:merge-teams')
    expect(refused(() => parseAuditFilter({ organizerId: 'script:merge-teams' }))).toBe(400)
  })

  it('never puts a value into the expression text', () => {
    const query = buildAuditQuery(
      parseAuditFilter({
        organizerId: 'org-1',
        tournamentId: 't-1',
        actorId: 'u-1',
        email: 'x@y.z',
        role: 'organizer',
        group: 'matches',
        action: 'goal.add',
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-02T00:00:00Z',
      }),
    )
    const text = `${query.KeyConditionExpression} ${query.FilterExpression}`
    for (const value of ['org-1', 't-1', 'u-1', 'x@y.z', 'goal.add', '2026']) {
      expect(text).not.toContain(value)
    }
    // Every #name used is defined, and every :value used is bound.
    for (const name of text.match(/#\w+/g) ?? []) {
      expect(query.ExpressionAttributeNames).toHaveProperty(name)
    }
    for (const value of text.match(/:\w+/g) ?? []) {
      expect(query.ExpressionAttributeValues).toHaveProperty(value)
    }
    expect(query.KeyConditionExpression).toContain('BETWEEN')
  })

  it('finds a competition in both shapes of entity id', () => {
    const query = buildAuditQuery({ tournamentId: 't-1' })
    expect(query.ExpressionAttributeValues[':tournamentId']).toBe('t-1')
    expect(query.ExpressionAttributeValues[':matchPrefix']).toBe('t-1/')
  })

  it('covers every action the routes write with some group', () => {
    const written = [
      'tournament.update', 'playoffRound.add', 'round.hide', 'match.update', 'goal.add',
      'lineup.update', 'team.claim', 'player.archive', 'club.shortlist', 'entry.apply',
      'squad.update', 'organizer.invite', 'account.create', 'merge',
    ]
    const prefixes = Object.values(AUDIT_GROUPS).flat()
    for (const action of written) {
      expect(prefixes.some((prefix) => action.startsWith(prefix))).toBe(true)
    }
  })
})

describe('audit cursor', () => {
  it('round-trips a sort key', () => {
    const at = '2026-09-17T01:02:03.456Z#abcd1234'
    expect(decodeCursor(encodeCursor(at))).toBe(at)
    expect(decodeCursor(undefined)).toBeUndefined()
  })

  it('refuses anything that is not a sort key', () => {
    expect(refused(() => decodeCursor(encodeCursor('log')))).toBe(400)
    expect(refused(() => decodeCursor('x'.repeat(500)))).toBe(400)
  })
})
