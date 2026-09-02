import { describe, expect, it } from 'vitest'
import { locateMatch } from '../src/lib/matches.js'
import type { Tournament } from '../src/lib/types.js'

/**
 * `locateMatch` assembles a DynamoDB document path, and a path assembled in
 * code is the one kind `expressions.test.ts` cannot read: an interpolation is a
 * value as far as that check is concerned. So the aliasing is asserted here
 * instead — `format` and `matches` are both reserved words, and a bare one in
 * the path is a ValidationException on every save of a playoff result.
 */
const season = (): Tournament =>
  ({
    id: 't1',
    name: 'Season',
    organizerId: 'o1',
    createdAtISO: '2026-01-01T00:00:00.000Z',
    teamIds: ['a', 'b'],
    matches: [
      { id: 'league-0', homeTeamId: 'a', awayTeamId: 'b' },
      { id: 'league-1', homeTeamId: 'b', awayTeamId: 'a' },
    ],
    format: {
      mode: 'league_custom_playoff',
      rounds: 1,
      customPlayoffConfig: {
        playoffTeams: 4,
        enableBye: true,
        preset: 'progressive_elimination',
        playoffRounds: [
          { roundNumber: 1, name: 'Round 10', matches: [{ id: 'progressive_1_0_a' }] },
          { roundNumber: 2, name: 'Final', matches: [{ id: 'final-0', homeTeamId: 'a' }] },
        ],
      },
    },
  }) as unknown as Tournament

describe('locateMatch', () => {
  it('finds a fixture in the matches array', () => {
    const found = locateMatch(season(), 'league-1')
    expect(found?.path).toBe('#matches[1]')
    expect(found?.names).toEqual({ '#matches': 'matches' })
    expect(found?.match).toMatchObject({ id: 'league-1' })
  })

  it('finds a fixture inside a hand-built playoff round', () => {
    const found = locateMatch(season(), 'final-0')
    expect(found?.path).toBe('#format.#playoffConfig.#playoffRounds[1].#matches[0]')
    expect(found?.match).toMatchObject({ id: 'final-0', homeTeamId: 'a' })
  })

  it('aliases every segment of the path it returns', () => {
    for (const id of ['league-0', 'progressive_1_0_a', 'final-0']) {
      const found = locateMatch(season(), id)
      expect(found, id).not.toBeNull()

      // Every dotted segment is an alias, and every alias is declared.
      for (const segment of found!.path.split('.')) {
        const name = segment.replace(/\[\d+\]$/, '')
        expect(name.startsWith('#'), `${id}: ${segment}`).toBe(true)
        expect(found!.names[name], `${id}: ${name}`).toBeTypeOf('string')
      }
    }
  })

  it('is null for a match this competition does not hold', () => {
    expect(locateMatch(season(), 'nope')).toBeNull()
  })

  it('survives a season with no playoff rounds and a null in the draw', () => {
    const plain = {
      id: 't2',
      matches: [null, { id: 'x' }],
      format: { mode: 'league', rounds: 1 },
    } as unknown as Tournament
    expect(locateMatch(plain, 'x')?.path).toBe('#matches[1]')
    expect(locateMatch(plain, 'y')).toBeNull()
  })
})

describe('locateMatch with a duplicated id', () => {
  it('refuses rather than picking the first of two', () => {
    const clash = {
      id: 't3',
      matches: [],
      format: {
        mode: 'league_custom_playoff',
        customPlayoffConfig: {
          playoffRounds: [
            { roundNumber: 1, matches: [{ id: 'progressive_1_0_a' }] },
            { roundNumber: 1, matches: [{ id: 'progressive_1_0_a' }] },
          ],
        },
      },
    } as unknown as Tournament
    expect(locateMatch(clash, 'progressive_1_0_a')).toBeNull()
  })
})
