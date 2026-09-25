import { describe, expect, it } from 'vitest'
import { hasPlayedIn, isIn, roundRobin, withdrawClub } from '../src/lib/withdraw.js'
import type { Tournament } from '../src/lib/types.js'

const season = (extra: Record<string, unknown> = {}): Tournament =>
  ({
    id: 't-1',
    name: 'League',
    organizerId: 'org-1',
    createdAtISO: '2026-01-01T00:00:00.000Z',
    teamIds: ['a', 'b', 'c', 'd', 'x'],
    matches: [],
    format: { mode: 'league', rounds: 1 },
    ...extra,
  }) as unknown as Tournament

type Row = { id: string; homeTeamId: string; awayTeamId: string; round: number } & Record<string, unknown>

describe('the round-robin draw', () => {
  it('gives six clubs five rounds in which every club plays once and every pair meets once', () => {
    const matches = roundRobin(['a', 'b', 'c', 'd', 'e', 'f']) as Row[]
    expect(matches).toHaveLength(15)
    const pairs = new Set(matches.map((m) => [m.homeTeamId, m.awayTeamId].sort().join('|')))
    expect(pairs.size).toBe(15)
    for (let round = 0; round < 5; round++) {
      const sides = matches.filter((m) => m.round === round).flatMap((m) => [m.homeTeamId, m.awayTeamId])
      expect(new Set(sides).size).toBe(6)
    }
  })

  it('never names the bye', () => {
    const matches = roundRobin(['a', 'b', 'c']) as Row[]
    expect(matches).toHaveLength(3)
    expect(matches.some((m) => m.homeTeamId === 'BYE' || m.awayTeamId === 'BYE')).toBe(false)
  })
})

describe('taking a deleted club out of a season', () => {
  it('leaves a season the club is not in alone', () => {
    expect(withdrawClub(season({ teamIds: ['a', 'b'] }), 'x')).toBeNull()
  })

  it('finds the club by a fixture even when the team list has lost it', () => {
    const stored = season({ teamIds: ['a'], matches: [{ id: 'm', homeTeamId: 'a', awayTeamId: 'x', round: 0 }] })
    expect(isIn(stored, 'x')).toBe(true)
  })

  it('draws an untouched league again without the club', () => {
    const stored = season({ matches: roundRobin(['a', 'b', 'c', 'd', 'x']) })
    const withdrawal = withdrawClub(stored, 'x')!
    expect(withdrawal.redrawn).toBe(true)
    expect(withdrawal.updates.teamIds).toEqual(['a', 'b', 'c', 'd'])
    const matches = withdrawal.updates.matches as Row[]
    expect(matches).toHaveLength(6)
    expect(new Set(matches.map((m) => m.round))).toEqual(new Set([0, 1, 2]))
  })

  it('keeps a schedule the organiser has dated, and only drops the club from it', () => {
    const drawn = roundRobin(['a', 'b', 'c', 'd', 'x']) as Row[]
    const kept = drawn.find((m) => m.homeTeamId !== 'x' && m.awayTeamId !== 'x')!
    const dated = drawn.map((m) => (m === kept ? { ...m, dateISO: '2026-10-01T09:00:00.000Z' } : m))
    const withdrawal = withdrawClub(season({ matches: dated }), 'x')!
    expect(withdrawal.redrawn).toBe(false)
    const matches = withdrawal.updates.matches as Row[]
    expect(matches).toHaveLength(drawn.length - 4)
    expect(matches.some((m) => m.homeTeamId === 'x' || m.awayTeamId === 'x')).toBe(false)
    expect(matches.find((m) => m.id === kept.id)?.dateISO).toBe('2026-10-01T09:00:00.000Z')
  })

  it('does not redraw a draw somebody has edited by hand', () => {
    const drawn = roundRobin(['a', 'b', 'c', 'd', 'x']) as Row[]
    const swapped = drawn.map((m, i) =>
      i === 0 ? { ...m, homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId } : m,
    )
    expect(withdrawClub(season({ matches: swapped }), 'x')!.redrawn).toBe(false)
    const moved = drawn.map((m, i) => (i === 0 ? { ...m, round: 9 } : m))
    expect(withdrawClub(season({ matches: moved }), 'x')!.redrawn).toBe(false)
    const added = [...drawn, { id: 'extra', homeTeamId: 'a', awayTeamId: 'b', round: 9 }]
    expect(withdrawClub(season({ matches: added }), 'x')!.redrawn).toBe(false)
  })

  it('does not draw a season the organiser has not drawn', () => {
    const withdrawal = withdrawClub(season({ matches: [] }), 'x')!
    expect(withdrawal.redrawn).toBe(false)
    expect(withdrawal.updates.matches).toBeUndefined()
  })

  it('does not redraw a season that is keeping a round back', () => {
    const stored = season({ matches: roundRobin(['a', 'b', 'c', 'd', 'x']), hiddenRounds: [2] })
    expect(withdrawClub(stored, 'x')!.redrawn).toBe(false)
  })

  it('keeps every result of a season under way and drops only the club\'s unplayed fixtures', () => {
    const matches = [
      { id: 'm1', homeTeamId: 'a', awayTeamId: 'b', round: 0, homeGoals: 2, awayGoals: 1 },
      { id: 'm2', homeTeamId: 'c', awayTeamId: 'x', round: 0 },
      { id: 'm3', homeTeamId: 'a', awayTeamId: 'c', round: 1 },
    ]
    const withdrawal = withdrawClub(season({ matches }), 'x')!
    expect(withdrawal.redrawn).toBe(false)
    expect(withdrawal.dropped).toBe(1)
    expect(withdrawal.updates.matches).toEqual([matches[0], matches[2]])
  })

  it('takes the club out of its registered squad and out of its group', () => {
    const stored = season({
      squads: { a: ['p1'], x: ['p9'] },
      format: {
        mode: 'groups_with_divisions',
        groupsWithDivisionsConfig: { numberOfGroups: 2, teamsPerGroup: 3, groupRounds: 1, groups: [['a', 'b', 'x'], ['c', 'd']] },
      },
    })
    const withdrawal = withdrawClub(stored, 'x')!
    expect(withdrawal.updates.squads).toEqual({ a: ['p1'] })
    const format = withdrawal.updates.format as { groupsWithDivisionsConfig: { groups: string[][] } }
    expect(format.groupsWithDivisionsConfig.groups).toEqual([['a', 'b'], ['c', 'd']])
    expect(withdrawal.redrawn).toBe(false)
  })

  it('takes the club out of a hand-built playoff round and does not redraw the league', () => {
    const stored = season({
      format: {
        mode: 'league_custom_playoff',
        customPlayoffConfig: {
          playoffTeams: 4,
          enableBye: true,
          playoffRounds: [{ roundNumber: 1, matches: [{ id: 'p1', homeTeamId: 'a', awayTeamId: 'x' }] }],
        },
      },
    })
    const withdrawal = withdrawClub(stored, 'x')!
    expect(withdrawal.redrawn).toBe(false)
    const format = withdrawal.updates.format as { customPlayoffConfig: { playoffRounds: { matches: unknown[] }[] } }
    expect(format.customPlayoffConfig.playoffRounds[0].matches).toEqual([])
  })
})

describe('whether a club has played in a season', () => {
  it('counts a score entered in a playoff round', () => {
    const stored = season({
      format: {
        mode: 'league_custom_playoff',
        customPlayoffConfig: {
          playoffRounds: [{ matches: [{ id: 'p1', homeTeamId: 'x', awayTeamId: 'a', homeGoals: 0, awayGoals: 0 }] }],
        },
      },
    })
    expect(hasPlayedIn(stored, 'x')).toBe(true)
  })

  it('counts a card, a goal or a teamsheet entered before the score', () => {
    const base = { id: 'm', homeTeamId: 'a', awayTeamId: 'x', round: 0 }
    const card = { id: 'c', team: 'home', playerId: 'p', minute: 10, type: 'red' }
    expect(hasPlayedIn(season({ matches: [{ ...base, cards: [card] }] }), 'x')).toBe(true)
    expect(hasPlayedIn(season({ matches: [{ ...base, goals: [{ id: 'g' }] }] }), 'x')).toBe(true)
    expect(hasPlayedIn(season({ matches: [{ ...base, lineups: { away: { starters: [] } } }] }), 'x')).toBe(true)
    expect(hasPlayedIn(season({ matches: [{ ...base, cards: [], lineups: {} }] }), 'x')).toBe(false)
  })

  it('does not count a fixture without a score', () => {
    const stored = season({ matches: [{ id: 'm', homeTeamId: 'x', awayTeamId: 'a', round: 0, dateISO: '2026-10-01' }] })
    expect(hasPlayedIn(stored, 'x')).toBe(false)
  })
})
