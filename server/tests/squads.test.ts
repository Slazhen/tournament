import { describe, expect, it } from 'vitest'
import { chooseSquad, isStrict, squadPlayerIds } from '../src/lib/squads.js'
import {
  nameableInMatch,
  pickLineup,
  refusedByRegistration,
  registeredPlayerIds,
} from '../src/lib/lineups.js'
import type { Team, Tournament } from '../src/lib/types.js'

const team = {
  id: 'team-mine',
  name: 'Mine',
  organizerId: 'org-1',
  players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
} as unknown as Team

const tournament = (extra: Record<string, unknown> = {}) =>
  ({
    id: 't-1',
    name: 'League',
    organizerId: 'org-1',
    createdAtISO: '2026-01-01T00:00:00.000Z',
    teamIds: ['team-mine', 'team-theirs'],
    matches: [],
    ...extra,
  }) as unknown as Tournament

describe('what an entry is stored as', () => {
  const known = squadPlayerIds(team)

  it('drops ids the club does not have, and repeats', () => {
    const { playerIds } = chooseSquad(['p1', 'p1', 'gone', 'p3'], known, false)
    expect(playerIds).toEqual(['p1', 'p3'])
  })

  // Two ways of saying the same thing in an ordinary competition, and storing
  // the weaker one is what lets next week's signing play without anybody
  // having to remember to tick them.
  it('stores "everyone" as no entry when the competition is open', () => {
    expect(chooseSquad(['p1', 'p2', 'p3'], known, false).store).toBeNull()
  })

  // Under a registration list they are different statements, and the whole
  // point of the rule is that a later signing stays out until entered.
  it('stores "everyone" as the list itself when the competition is strict', () => {
    expect(chooseSquad(['p1', 'p2', 'p3'], known, true).store).toEqual(['p1', 'p2', 'p3'])
  })

  it('stores an empty entry rather than nothing under a strict competition', () => {
    expect(chooseSquad([], known, true).store).toEqual([])
    expect(chooseSquad([], known, false).store).toEqual([])
  })

  it('reads the rule off the competition', () => {
    expect(isStrict(tournament())).toBe(false)
    expect(isStrict(tournament({ squadsStrict: true }))).toBe(true)
    // Not a truthiness test: a stray string in a schemaless record must not
    // silently turn a friendly league into one where nobody may play.
    expect(isStrict(tournament({ squadsStrict: 'yes' }))).toBe(false)
  })
})

describe('who may be named when nobody has been entered', () => {
  it('is everybody in an ordinary competition', () => {
    expect([...registeredPlayerIds(tournament(), team)]).toEqual(['p1', 'p2', 'p3'])
  })

  it('is nobody in a strict one, because the entry is what lets a player play', () => {
    expect([...registeredPlayerIds(tournament({ squadsStrict: true }), team)]).toEqual([])
  })

  it('is the entry itself once there is one, strict or not', () => {
    const entry = { squads: { 'team-mine': ['p2'] } }
    expect([...registeredPlayerIds(tournament(entry), team)]).toEqual(['p2'])
    expect([...registeredPlayerIds(tournament({ ...entry, squadsStrict: true }), team)]).toEqual([
      'p2',
    ])
  })
})

describe('naming players once a registration exists', () => {
  const match = {
    id: 'm-1',
    homeTeamId: 'team-mine',
    awayTeamId: 'team-theirs',
    lineups: { home: { starting: ['p3'] }, away: { starting: [] } },
  }
  const strictWithEntry = tournament({ squadsStrict: true, squads: { 'team-mine': ['p1'] } })

  // p3 played and was recorded; the club has since been cut back to p1. The
  // appearance exists nowhere but this teamsheet, so p3 stays nameable here.
  it('keeps anyone already on the teamsheet nameable', () => {
    const allowed = nameableInMatch(strictWithEntry, team, match, 'home')
    expect([...allowed].sort()).toEqual(['p1', 'p3'])
  })

  it('does not carry one side of a match over to the other', () => {
    const allowed = nameableInMatch(strictWithEntry, team, match, 'away')
    expect([...allowed]).toEqual(['p1'])
  })

  it('survives a match with no teamsheet on either side', () => {
    const allowed = nameableInMatch(strictWithEntry, team, { id: 'm-2' }, 'home')
    expect([...allowed]).toEqual(['p1'])
  })

  // The difference that matters: a player of this club who is not registered is
  // somebody looking at a stale screen and must be told, while an id belonging
  // to no club is a stale or hand-made value and is quietly dropped.
  it('refuses an unregistered player of this club', () => {
    const allowed = nameableInMatch(strictWithEntry, team, match, 'home')
    expect(refusedByRegistration(['p1', 'p2'], allowed, squadPlayerIds(team))).toEqual(['p2'])
  })

  it('says nothing about an id that belongs to no club', () => {
    const allowed = nameableInMatch(strictWithEntry, team, match, 'home')
    expect(refusedByRegistration(['p1', 'nobody'], allowed, squadPlayerIds(team))).toEqual([])
    expect(pickLineup(['p1', 'nobody'], allowed)).toEqual(['p1'])
  })

  it('refuses everyone in a strict competition that has entered nobody', () => {
    const allowed = nameableInMatch(tournament({ squadsStrict: true }), team, { id: 'm-2' }, 'home')
    expect(refusedByRegistration(['p1'], allowed, squadPlayerIds(team))).toEqual(['p1'])
  })
})
