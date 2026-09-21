import { describe, expect, it } from 'vitest'
import type { Match, Tournament } from '../types'
import { DEFAULT_DISCIPLINE, disciplineOf, disciplineRules, type DisciplineRules } from './discipline'

/**
 * What a card costs is derived from the cards and the season's rules, and the
 * thing these tests hold down is the order: a card never costs the match it was
 * shown in. That is what makes a blue card a blue card, and it is the first
 * thing a refactor of the walk below would break.
 */

type Format = NonNullable<Tournament['format']>

const season = (matches: Match[], discipline?: Partial<DisciplineRules>): Tournament =>
  ({
    id: 't1',
    name: 'Test',
    organizerId: 'o1',
    createdAtISO: '2026-01-01T00:00:00.000Z',
    teamIds: ['a', 'b'],
    matches,
    format: {
      rounds: 1,
      mode: 'league',
      ...(discipline ? { discipline: { ...DEFAULT_DISCIPLINE, ...discipline } } : {}),
    } as Format,
  }) as Tournament

const match = (
  id: string,
  round: number,
  cards: NonNullable<Match['cards']> = [],
  played = true,
): Match => ({
  id,
  homeTeamId: 'a',
  awayTeamId: 'b',
  round,
  dateISO: `2026-03-0${round + 1}T10:00:00.000Z`,
  ...(played ? { homeGoals: 0, awayGoals: 0 } : {}),
  cards,
})

const booking = (playerId: string, type: 'yellow' | 'second_yellow' | 'red' | 'blue') => ({
  id: `${playerId}-${type}-${Math.random()}`,
  team: 'home' as const,
  playerId,
  minute: 10,
  type,
})

const out = (tournament: Tournament, matchId: string) =>
  (disciplineOf(tournament).suspensions.get(matchId) ?? []).map((one) => one.playerId)

describe('the rules a season is played by', () => {
  it('reads a season carrying nothing at the defaults', () => {
    expect(disciplineRules(season([]))).toEqual(DEFAULT_DISCIPLINE)
  })

  it('falls back field by field on nonsense stored in format', () => {
    const broken = season([])
    ;(broken.format as Record<string, unknown>).discipline = {
      red: 'two',
      blue: Number.POSITIVE_INFINITY,
      yellowEvery: -4,
    }
    const rules = disciplineRules(broken)
    expect(rules.red).toBe(DEFAULT_DISCIPLINE.red)
    expect(rules.blue).toBe(0)
    expect(rules.yellowEvery).toBe(0)
  })
})

describe('what a card costs', () => {
  it('leaves the match the card was shown in alone and takes the next one', () => {
    const tournament = season([
      match('m1', 0, [booking('p1', 'red')]),
      match('m2', 1),
      match('m3', 2),
    ])
    expect(out(tournament, 'm1')).toEqual([])
    expect(out(tournament, 'm2')).toEqual(['p1'])
    expect(out(tournament, 'm3')).toEqual([])
  })

  it('costs a blue card nothing beyond the match it was shown in', () => {
    const tournament = season([match('m1', 0, [booking('p1', 'blue')]), match('m2', 1)])
    expect(out(tournament, 'm2')).toEqual([])
    const record = disciplineOf(tournament).records.find((one) => one.playerId === 'p1')
    expect(record?.blues).toBe(1)
    expect(record?.missing).toEqual([])
  })

  it('suspends for a blue where the season says it does', () => {
    const tournament = season([match('m1', 0, [booking('p1', 'blue')]), match('m2', 1)], {
      blue: 1,
    })
    expect(out(tournament, 'm2')).toEqual(['p1'])
  })

  it('serves a two-match ban over two matches', () => {
    const tournament = season(
      [match('m1', 0, [booking('p1', 'red')]), match('m2', 1), match('m3', 2), match('m4', 3)],
      { red: 2 },
    )
    expect(out(tournament, 'm2')).toEqual(['p1'])
    expect(out(tournament, 'm3')).toEqual(['p1'])
    expect(out(tournament, 'm4')).toEqual([])
  })

  it('counts a ban it has no fixture left to serve as outstanding', () => {
    const tournament = season([match('m1', 0, [booking('p1', 'red')])], { red: 2 })
    const record = disciplineOf(tournament).records.find((one) => one.playerId === 'p1')
    expect(record?.outstanding).toBe(2)
  })
})

describe('cards that add up', () => {
  it('does nothing with yellows until a threshold is set', () => {
    const tournament = season([
      match('m1', 0, [booking('p1', 'yellow')]),
      match('m2', 1, [booking('p1', 'yellow')]),
      match('m3', 2),
    ])
    expect(out(tournament, 'm3')).toEqual([])
    expect(disciplineOf(tournament).records[0]?.yellows).toBe(2)
  })

  it('repeats the threshold rather than firing once', () => {
    const tournament = season(
      [
        match('m1', 0, [booking('p1', 'yellow')]),
        match('m2', 1, [booking('p1', 'yellow')]),
        match('m3', 2, [booking('p1', 'yellow')]),
        match('m4', 3, [booking('p1', 'yellow')]),
        match('m5', 4),
      ],
      { yellowEvery: 2 },
    )
    // Booked in m1 and m2, so the second yellow costs m3; booked again in m3
    // and m4, so the fourth costs m5.
    expect(out(tournament, 'm3')).toEqual(['p1'])
    expect(out(tournament, 'm4')).toEqual([])
    expect(out(tournament, 'm5')).toEqual(['p1'])
  })

  it('leaves the count alone for a second yellow unless the season says otherwise', () => {
    const cards = [
      match('m1', 0, [booking('p1', 'yellow')]),
      match('m2', 1, [booking('p1', 'second_yellow')]),
      match('m3', 2),
      match('m4', 3),
    ]
    const plain = season(cards, { yellowEvery: 2, secondYellow: 1 })
    // m3 is the dismissal being served, and the count is still on one.
    expect(out(plain, 'm3')).toEqual(['p1'])
    expect(out(plain, 'm4')).toEqual([])

    const counting = season(cards, { yellowEvery: 2, secondYellow: 1, secondYellowCounts: 1 })
    // The dismissal in m3, and the second booking of the season in m4.
    expect(out(counting, 'm3')).toEqual(['p1'])
    expect(out(counting, 'm4')).toEqual(['p1'])
  })
})

describe('the order a club plays its matches', () => {
  it('orders by the date and not by the round number', () => {
    const tournament = season([
      { ...match('m1', 0, [booking('p1', 'red')]), dateISO: '2026-03-10T10:00:00.000Z' },
      { ...match('m2', 1), dateISO: '2026-03-20T10:00:00.000Z' },
      // Played out of order: a round behind, a week later.
      { ...match('m3', 2), dateISO: '2026-03-15T10:00:00.000Z' },
    ])
    expect(out(tournament, 'm3')).toEqual(['p1'])
    expect(out(tournament, 'm2')).toEqual([])
  })

  it('falls back to the round where there is no date', () => {
    const tournament = season([
      { ...match('m1', 0, [booking('p1', 'red')]), dateISO: undefined },
      { ...match('m2', 1), dateISO: undefined },
    ])
    expect(out(tournament, 'm2')).toEqual(['p1'])
  })

  it('serves nothing in a bye or a cancelled fixture', () => {
    const bye: Match = { ...match('m2', 1), awayTeamId: 'a' }
    const tournament = season([
      match('m1', 0, [booking('p1', 'red')]),
      bye,
      { ...match('m3', 2), status: 'cancelled' },
      match('m4', 3),
    ])
    expect(out(tournament, 'm2')).toEqual([])
    expect(out(tournament, 'm3')).toEqual([])
    expect(out(tournament, 'm4')).toEqual(['p1'])
  })

  it('keeps a booking on the side it was shown to', () => {
    const tournament = season([
      { ...match('m1', 0), cards: [{ ...booking('p1', 'red'), team: 'away' as const }] },
      match('m2', 1),
    ])
    const record = disciplineOf(tournament).records.find((one) => one.playerId === 'p1')
    expect(record?.teamId).toBe('b')
    expect(out(tournament, 'm2')).toEqual(['p1'])
  })
})
