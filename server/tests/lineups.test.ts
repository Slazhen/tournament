import { describe, expect, it } from 'vitest'
import { pickLineup, pickNumbers, registeredPlayerIds, sideOfTeam } from '../src/lib/lineups.js'
import type { Team, Tournament } from '../src/lib/types.js'

const team = {
  id: 'team-mine',
  name: 'Mine',
  organizerId: 'org-1',
  players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
} as unknown as Team

const tournament = (squads?: Record<string, string[]>) =>
  ({
    id: 't-1',
    name: 'League',
    organizerId: 'org-1',
    createdAtISO: '2026-01-01T00:00:00.000Z',
    teamIds: ['team-mine', 'team-theirs'],
    matches: [],
    ...(squads ? { squads } : {}),
  }) as unknown as Tournament

describe('which side of a match a club is on', () => {
  const match = { id: 'm-1', homeTeamId: 'team-mine', awayTeamId: 'team-theirs' }

  it('reads the side out of the fixture', () => {
    expect(sideOfTeam(match, 'team-mine')).toBe('home')
    expect(sideOfTeam(match, 'team-theirs')).toBe('away')
  })

  it('refuses a club that is not playing in it', () => {
    expect(sideOfTeam(match, 'team-elsewhere')).toBeNull()
  })

  // A fixture with no sides yet is an ordinary state in a bracket, and it must
  // not answer 'away' by accident: undefined === undefined would.
  it('refuses a fixture whose sides are not decided', () => {
    expect(sideOfTeam({ id: 'm-2' }, 'team-mine')).toBeNull()
    expect(sideOfTeam(null, 'team-mine')).toBeNull()
    expect(sideOfTeam('not a match', 'team-mine')).toBeNull()
  })
})

describe('who a club may name in a competition', () => {
  it('is the whole squad when nothing is registered', () => {
    expect([...registeredPlayerIds(tournament(), team)]).toEqual(['p1', 'p2', 'p3'])
  })

  it('is the registration when there is one', () => {
    const ids = registeredPlayerIds(tournament({ 'team-mine': ['p1', 'p3'] }), team)
    expect([...ids]).toEqual(['p1', 'p3'])
  })

  // A registration is a list of ids saved once and rarely revisited. A player
  // released since then is no longer in the club's squad, and must not be
  // nameable because an old list still mentions them.
  it('drops a registered player who has left the club', () => {
    const ids = registeredPlayerIds(tournament({ 'team-mine': ['p1', 'gone'] }), team)
    expect([...ids]).toEqual(['p1'])
  })

  it("ignores another club's registration", () => {
    const ids = registeredPlayerIds(tournament({ 'team-theirs': ['p1'] }), team)
    expect([...ids]).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('the teamsheet that gets stored', () => {
  const allowed = new Set(['p1', 'p2', 'p3'])

  it('keeps the order it was sent in', () => {
    expect(pickLineup(['p3', 'p1'], allowed)).toEqual(['p3', 'p1'])
  })

  it('drops anyone not allowed, and repeats', () => {
    expect(pickLineup(['p1', 'p1', 'intruder', 7, null], allowed)).toEqual(['p1'])
  })

  it('treats anything that is not a list as an empty teamsheet', () => {
    expect(pickLineup(undefined, allowed)).toEqual([])
    expect(pickLineup('p1', allowed)).toEqual([])
  })
})

describe('the shirt numbers a teamsheet overrides', () => {
  it('keeps a number for a player who is on the sheet', () => {
    expect(pickNumbers({ p1: 7, p2: 10 }, ['p1', 'p2'])).toEqual({ p1: 7, p2: 10 })
  })

  // A number belongs to somebody on the sheet. Left behind, it would sit in the
  // record for a player nobody named and reappear the next time they were.
  it('drops a number for a player who is not', () => {
    expect(pickNumbers({ p1: 7, p3: 9 }, ['p1'])).toEqual({ p1: 7 })
  })

  it('drops anything that is not a shirt number', () => {
    expect(
      pickNumbers({ p1: '7', p2: 7.5, p3: -1 }, ['p1', 'p2', 'p3']),
    ).toEqual({})
    expect(pickNumbers({ p1: 100 }, ['p1'])).toEqual({})
    expect(pickNumbers({ p1: 0, p2: 99 }, ['p1', 'p2'])).toEqual({ p1: 0, p2: 99 })
  })

  // A sheet that overrides nothing is stored exactly as every sheet written
  // before this field was invented.
  it('treats anything that is not a map as no overrides at all', () => {
    expect(pickNumbers(undefined, ['p1'])).toEqual({})
    expect(pickNumbers([7, 9], ['p1'])).toEqual({})
    expect(pickNumbers('7', ['p1'])).toEqual({})
  })

  // Two players in one shirt is allowed on purpose: a teamsheet filled in after
  // the whistle is a record of what happened, and refusing it would refuse the
  // record. The screens mark it.
  it('allows two players to wear the same number', () => {
    expect(pickNumbers({ p1: 7, p2: 7 }, ['p1', 'p2'])).toEqual({ p1: 7, p2: 7 })
  })
})
