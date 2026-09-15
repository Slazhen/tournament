import { describe, expect, it } from 'vitest'
import type { Match, Tournament } from '../types'
import { leagueTable, pointsFor, tableRules } from './standings'

/**
 * The table's rules belong to the season, and the first thing these tests have
 * to hold down is that a season carrying none of them is untouched: every
 * competition in the database predates the setting, and a default changed here
 * must not move a table that has already been published.
 */

type Rules = NonNullable<Tournament['format']>

const season = (teamIds: string[], matches: Match[], format?: Partial<Rules>): Tournament =>
  ({
    id: 't1',
    name: 'Test',
    organizerId: 'o1',
    createdAtISO: '2026-01-01T00:00:00.000Z',
    teamIds,
    matches,
    format: { rounds: 1, mode: 'league', ...format } as Rules,
  }) as Tournament

const played = (
  id: string,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
  extra: Partial<Match> = {},
): Match => ({ id, homeTeamId: home, awayTeamId: away, homeGoals, awayGoals, ...extra })

/** The exact arithmetic and comparator this file replaced, kept to compare against. */
function legacyTable(teamIds: string[], matches: Match[]) {
  const stats = new Map<string, { id: string; gf: number; ga: number; pts: number }>()
  for (const id of teamIds) stats.set(id, { id, gf: 0, ga: 0, pts: 0 })

  for (const match of matches) {
    if (typeof match.homeGoals !== 'number' || typeof match.awayGoals !== 'number') continue
    if (match.homeGoals < 0 || match.awayGoals < 0) continue
    const home = stats.get(match.homeTeamId)
    const away = stats.get(match.awayTeamId)
    if (!home || !away) continue

    home.gf += match.homeGoals
    home.ga += match.awayGoals
    away.gf += match.awayGoals
    away.ga += match.homeGoals

    if (match.homeGoals > match.awayGoals) home.pts += 3
    else if (match.homeGoals < match.awayGoals) away.pts += 3
    else {
      home.pts++
      away.pts++
    }
  }

  return [...stats.values()]
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
    .map((row) => row.id)
}

/** Deterministic, so a failure is the same failure on the next run. */
function fixtures(teamIds: string[], seed: number): Match[] {
  let state = seed
  const next = (max: number) => {
    state = (state * 1103515245 + 12345) % 2147483648
    return Math.floor((state / 2147483648) * max)
  }

  const matches: Match[] = []
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      matches.push(played(`m${i}-${j}`, teamIds[i], teamIds[j], next(4), next(4), { round: i }))
    }
  }
  // A knockout on top of the league: legacy counted these towards the table.
  matches.push(
    played('po1', teamIds[0], teamIds[1], next(4), next(4), {
      isPlayoff: true,
      isElimination: true,
    }),
    played('po2', teamIds[2], teamIds[3], next(4), next(4), { isPlayoff: true }),
  )
  return matches
}

describe('a season with no rules of its own', () => {
  const teamIds = ['a', 'b', 'c', 'd', 'e', 'f']

  it('reads as three points for a win, every playoff match counted', () => {
    const rules = tableRules(season(teamIds, []))
    expect(rules.scoring).toEqual({ win: 3, draw: 1, loss: 0, playoffMatches: 'all' })
    expect(rules.tiebreakers).toEqual(['goalDifference', 'goalsFor'])
  })

  it('produces the order the old comparator produced', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const matches = fixtures(teamIds, seed)
      const now = leagueTable(season(teamIds, matches)).map((row) => row.id)
      expect(now, `seed ${seed}`).toEqual(legacyTable(teamIds, matches))
    }
  })

  it('counts a knockout result towards the table, as it always did', () => {
    const matches = [
      played('m1', 'a', 'b', 1, 0),
      played('po', 'a', 'b', 3, 0, { isPlayoff: true, isElimination: true }),
    ]
    const table = leagueTable(season(['a', 'b'], matches))
    expect(table[0]).toMatchObject({ id: 'a', p: 2, pts: 6 })
  })

  it('is not moved by a value nothing can read', () => {
    const broken = season(['a', 'b'], [], {
      scoring: { win: 'three', draw: null, loss: 0, playoffMatches: 'sometimes' },
      tiebreakers: ['byCoinToss', 42],
    } as unknown as Partial<Rules>)
    expect(tableRules(broken).scoring.win).toBe(3)
    expect(tableRules(broken).tiebreakers).toEqual(['goalDifference', 'goalsFor'])
  })
})

describe('a season that carries its own rules', () => {
  const newRules = (tiebreakers: string[] = ['headToHead', 'goalDifference', 'goalsFor']) =>
    ({
      scoring: { win: 3, draw: 1, loss: 0, playoffMatches: 'none' },
      tiebreakers,
    }) as unknown as Partial<Rules>

  it('keeps knockout results out of the table', () => {
    const matches = [
      played('m1', 'a', 'b', 1, 0),
      played('po', 'b', 'a', 5, 0, { isPlayoff: true, isElimination: true }),
    ]
    const table = leagueTable(season(['a', 'b'], matches, newRules()))
    expect(table.map((row) => row.id)).toEqual(['a', 'b'])
    expect(table[0]).toMatchObject({ p: 1, pts: 3 })
  })

  it('counts the custom scheme’s league rounds and not its knockouts', () => {
    const matches = [
      played('m1', 'a', 'b', 0, 0),
      played('po1', 'a', 'b', 4, 0, { isPlayoff: true }),
      played('po2', 'b', 'a', 9, 0, { isPlayoff: true, isElimination: true }),
    ]
    const custom = {
      scoring: { win: 3, draw: 1, loss: 0, playoffMatches: 'non_elimination' },
    } as unknown as Partial<Rules>
    const table = leagueTable(season(['a', 'b'], matches, custom))
    expect(table[0]).toMatchObject({ id: 'a', p: 2, pts: 4 })
    expect(table[1]).toMatchObject({ id: 'b', p: 2, pts: 1 })
  })

  it('awards the points the season says', () => {
    const matches = [played('m1', 'a', 'b', 2, 1), played('m2', 'a', 'b', 0, 0)]
    const twoForAWin = {
      scoring: { win: 2, draw: 1, loss: 0, playoffMatches: 'none' },
    } as unknown as Partial<Rules>
    expect(leagueTable(season(['a', 'b'], matches, twoForAWin))[0]).toMatchObject({ pts: 3 })
  })

  describe('head to head', () => {
    it('separates two clubs by the match between them', () => {
      // Level on points, goal difference and goals scored; b won the meeting.
      const matches = [
        played('m1', 'a', 'b', 0, 1),
        played('m2', 'a', 'c', 3, 1),
        played('m3', 'b', 'c', 2, 0),
        played('m4', 'c', 'a', 1, 1),
        played('m5', 'c', 'b', 1, 1),
      ]
      const table = leagueTable(season(['a', 'b', 'c'], matches, newRules()))
      expect(table[0].id).toBe('b')
    })

    it('ranks three level clubs by the table of the matches among them', () => {
      // a, b and c all beat d and take four points each from each other's
      // group, so only the mini-table separates them: c beat both, a beat b.
      const matches = [
        played('m1', 'a', 'd', 1, 0),
        played('m2', 'b', 'd', 1, 0),
        played('m3', 'c', 'd', 1, 0),
        played('m4', 'c', 'a', 1, 0),
        played('m5', 'c', 'b', 1, 0),
        played('m6', 'a', 'b', 1, 0),
      ]
      const table = leagueTable(season(['a', 'b', 'c', 'd'], matches, newRules()))
      expect(table.map((row) => row.id)).toEqual(['c', 'a', 'b', 'd'])
    })

    it('falls through to the next criterion for clubs that have not met', () => {
      // Five clubs level on points, none of them having played each other:
      // the mini-table separates nobody and goal difference decides.
      const matches = [
        played('m1', 'a', 'z', 5, 0),
        played('m2', 'b', 'z', 4, 0),
        played('m3', 'c', 'z', 3, 0),
        played('m4', 'd', 'z', 2, 0),
        played('m5', 'e', 'z', 1, 0),
      ]
      const table = leagueTable(season(['e', 'd', 'c', 'b', 'a', 'z'], matches, newRules()))
      expect(table.map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'z'])
    })

    it('leaves clubs nothing separates in the order they were entered', () => {
      const matches = [played('m1', 'a', 'b', 1, 1)]
      const table = leagueTable(season(['b', 'a'], matches, newRules()))
      expect(table.map((row) => row.id)).toEqual(['b', 'a'])
    })
  })
})

describe('points for one club', () => {
  it('follows the same rules as the table', () => {
    const matches = [
      played('m1', 'a', 'b', 1, 0),
      played('po', 'a', 'b', 1, 0, { isPlayoff: true, isElimination: true }),
    ]
    expect(pointsFor('a', matches, tableRules(season(['a', 'b'], matches)))).toBe(6)
    expect(
      pointsFor('a', matches, tableRules(season(['a', 'b'], matches, {
        scoring: { win: 3, draw: 1, loss: 0, playoffMatches: 'none' },
      } as unknown as Partial<Rules>))),
    ).toBe(3)
  })

  it('ignores a fixture that names the same club twice', () => {
    const matches = [played('bye', 'a', 'a', 0, 0)]
    expect(pointsFor('a', matches, tableRules(season(['a'], matches)))).toBe(0)
  })

  it('is what the table awards, for a bye too', () => {
    const matches = [played('bye', 'a', 'a', 3, 0), played('m1', 'a', 'b', 1, 0)]
    const table = leagueTable(season(['a', 'b'], matches))
    expect(table[0]).toMatchObject({ id: 'a', p: 1, w: 1, l: 0, pts: 3 })
  })
})
