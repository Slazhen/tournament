import { describe, expect, it } from 'vitest'
import { assertShootout, assertShootoutsInBody, readShootout } from '../src/lib/shootout.js'

describe('readShootout', () => {
  it('accepts two whole counts of kicks', () => {
    expect(readShootout({ home: 5, away: 4 })).toEqual({ home: 5, away: 4 })
    expect(readShootout({ home: 0, away: 3 })).toEqual({ home: 0, away: 3 })
  })

  it('reads null and undefined as no shootout', () => {
    expect(readShootout(null)).toBeNull()
    expect(readShootout(undefined)).toBeNull()
  })

  it('keeps only the two counts, so nothing else is stored beside them', () => {
    expect(readShootout({ home: 1, away: 0, note: 'on the night', winner: 'a' })).toEqual({
      home: 1,
      away: 0,
    })
  })

  it('refuses anything that is not a pair of counts', () => {
    for (const value of [
      { home: 5 },
      { away: 5 },
      { home: 5, away: '4' },
      { home: -1, away: 3 },
      { home: 1.5, away: 3 },
      { home: 100, away: 3 },
      { home: Number.NaN, away: 1 },
      [5, 4],
      'penalties',
      5,
      true,
    ]) {
      expect(() => readShootout(value), JSON.stringify(value)).toThrow()
    }
  })
})

describe('assertShootout', () => {
  it('lets a fixture with no shootout through untouched', () => {
    const fixture: Record<string, unknown> = { homeGoals: 1 }
    assertShootout(fixture)
    expect(fixture).toEqual({ homeGoals: 1 })
  })

  it('replaces the stored value with the one it read', () => {
    const fixture: Record<string, unknown> = { shootout: { home: 3, away: 2, extra: 1 } }
    assertShootout(fixture)
    expect(fixture.shootout).toEqual({ home: 3, away: 2 })
  })
})

describe('assertShootoutsInBody', () => {
  it('reaches the fixtures in `matches`', () => {
    const body: Record<string, unknown> = {
      matches: [{ id: 'm', shootout: { home: 4, away: 2, note: 'x' } }],
    }
    assertShootoutsInBody(body)
    expect((body.matches as Array<Record<string, unknown>>)[0].shootout).toEqual({
      home: 4,
      away: 2,
    })
  })

  it('reaches the fixtures of a hand-built playoff round, the other home', () => {
    const body: Record<string, unknown> = {
      format: {
        customPlayoffConfig: {
          playoffRounds: [{ matches: [{ id: 'p', shootout: { home: 'a', away: 'b' } }] }],
        },
      },
    }
    expect(() => assertShootoutsInBody(body)).toThrow()
  })

  it('steps over holes and bodies that carry no fixtures at all', () => {
    expect(() => assertShootoutsInBody({})).not.toThrow()
    expect(() => assertShootoutsInBody({ matches: [null, 'nonsense', 7] })).not.toThrow()
    expect(() => assertShootoutsInBody({ format: { customPlayoffConfig: {} } })).not.toThrow()
    expect(() =>
      assertShootoutsInBody({ format: { customPlayoffConfig: { playoffRounds: [null] } } }),
    ).not.toThrow()
  })
})
