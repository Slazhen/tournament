import { describe, expect, it } from 'vitest'
import type { Match } from '../types'
import { aggregateOf, isDecidingLeg, legsOfTie, tieOutcome } from './ties'

const match = (id: string, home: string, away: string, extra: Partial<Match> = {}): Match => ({
  id,
  homeTeamId: home,
  awayTeamId: away,
  isPlayoff: true,
  isElimination: true,
  ...extra,
})

const twoLegs = (
  first: [number, number],
  second: [number, number],
  shootout?: { home: number; away: number },
): Match[] => [
  match('t1', 'a', 'b', { homeGoals: first[0], awayGoals: first[1], tie: { id: 'tie', leg: 1 } }),
  match('t2', 'b', 'a', {
    homeGoals: second[0],
    awayGoals: second[1],
    tie: { id: 'tie', leg: 2 },
    shootout,
  }),
]

describe('a tie of one match', () => {
  it('is won on the score', () => {
    const outcome = tieOutcome([match('m', 'a', 'b', { homeGoals: 2, awayGoals: 1 })])
    expect(outcome).toEqual({ winnerId: 'a', loserId: 'b', decidedBy: 'score' })
  })

  it('is undecided while it is level and nobody has taken penalties', () => {
    expect(tieOutcome([match('m', 'a', 'b', { homeGoals: 1, awayGoals: 1 })])).toBeNull()
  })

  it('is won on penalties when it is level', () => {
    const outcome = tieOutcome([
      match('m', 'a', 'b', { homeGoals: 1, awayGoals: 1, shootout: { home: 3, away: 4 } }),
    ])
    expect(outcome).toEqual({ winnerId: 'b', loserId: 'a', decidedBy: 'shootout' })
  })

  it('ignores a shootout on a tie that was not level', () => {
    const outcome = tieOutcome([
      match('m', 'a', 'b', { homeGoals: 3, awayGoals: 1, shootout: { home: 0, away: 9 } }),
    ])
    expect(outcome).toEqual({ winnerId: 'a', loserId: 'b', decidedBy: 'score' })
  })

  it('is undecided while it has not been played', () => {
    expect(tieOutcome([match('m', 'a', 'b')])).toBeNull()
    expect(tieOutcome([match('m', 'a', 'b', { homeGoals: 1 })])).toBeNull()
  })

  it('is undecided while the pairing is empty', () => {
    expect(tieOutcome([match('m', '', '', { homeGoals: 1, awayGoals: 0 })])).toBeNull()
  })
})

describe('a tie of two legs', () => {
  it('is won on the two scores added together', () => {
    // a wins 1-0 away, b wins 2-1 at home: 2-2 on the night, and a loses 2-3.
    const outcome = tieOutcome(twoLegs([0, 1], [2, 1]))
    expect(outcome).toEqual({ winnerId: 'b', loserId: 'a', decidedBy: 'aggregate' })
  })

  it('counts each leg from the side that played at home in it', () => {
    // a 3-0 at home, then 0-1 away: 3-1 to a, whatever order the ids sit in.
    expect(tieOutcome(twoLegs([3, 0], [1, 0]))).toEqual({
      winnerId: 'a',
      loserId: 'b',
      decidedBy: 'aggregate',
    })
  })

  it('does not count away goals', () => {
    // 1-1 and 2-2: level on aggregate, and b scored more away from home. That
    // used to decide it in this competition's lifetime and does not now.
    expect(tieOutcome(twoLegs([1, 1], [2, 2]))).toBeNull()
  })

  it('goes to the shootout on the leg that has one', () => {
    const outcome = tieOutcome(twoLegs([1, 1], [2, 2], { home: 5, away: 4 }))
    // The shootout is on the second leg, where b is at home.
    expect(outcome).toEqual({ winnerId: 'b', loserId: 'a', decidedBy: 'shootout' })
  })

  it('is undecided while only one leg has been played', () => {
    const legs = twoLegs([1, 0], [0, 0])
    delete legs[1].homeGoals
    delete legs[1].awayGoals
    expect(tieOutcome(legs)).toBeNull()
  })

  it('is undecided when the shootout itself is level', () => {
    expect(tieOutcome(twoLegs([1, 1], [0, 0], { home: 3, away: 3 }))).toBeNull()
  })
})

describe('finding the legs', () => {
  it('returns the match itself when it belongs to no tie', () => {
    const one = match('m', 'a', 'b')
    expect(legsOfTie(one, [one])).toEqual([one])
  })

  it('returns both legs in order, whatever order they are stored in', () => {
    const legs = twoLegs([0, 0], [0, 0])
    const stored = [legs[1], legs[0]]
    expect(legsOfTie(legs[0], stored).map((leg) => leg.id)).toEqual(['t1', 't2'])
  })

  it('knows which leg settles it', () => {
    const legs = twoLegs([0, 0], [0, 0])
    expect(isDecidingLeg(legs[0], legs)).toBe(false)
    expect(isDecidingLeg(legs[1], legs)).toBe(true)
  })
})

describe('the aggregate', () => {
  it('is nothing for a single match', () => {
    expect(aggregateOf([match('m', 'a', 'b', { homeGoals: 1, awayGoals: 0 })])).toBeNull()
  })

  it('reads from the first leg’s home side', () => {
    expect(aggregateOf(twoLegs([2, 1], [1, 1]))).toEqual({
      homeTeamId: 'a',
      awayTeamId: 'b',
      home: 3,
      away: 2,
    })
  })
})
