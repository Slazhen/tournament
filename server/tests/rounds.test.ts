import { describe, expect, it } from 'vitest'
import { hiddenLeagueRounds, playoffsWithheld, toPublicTournament } from '../src/lib/rounds.js'
import type { Tournament } from '../src/lib/types.js'

const season = (extra: Record<string, unknown> = {}): Tournament =>
  ({
    id: 't-1',
    name: 'League',
    organizerId: 'org-1',
    createdAtISO: '2026-01-01T00:00:00.000Z',
    teamIds: ['a', 'b', 'c', 'd'],
    matches: [],
    ...extra,
  }) as unknown as Tournament

const fixture = (extra: Record<string, unknown> = {}) => ({
  id: 'm-1',
  homeTeamId: 'a',
  awayTeamId: 'b',
  dateISO: '2026-03-01T09:00:00.000Z',
  venue: 'Pitch 2',
  round: 1,
  ...extra,
})

describe('which league rounds a season is keeping back', () => {
  it('is empty for every season that predates the field', () => {
    expect(hiddenLeagueRounds(season())).toEqual(new Set())
  })

  it('ignores anything stored there that is not a round number', () => {
    const rounds = hiddenLeagueRounds(season({ hiddenRounds: [0, '2', null, 3.5, 4] }))
    expect(rounds).toEqual(new Set([0, 4]))
  })
})

describe('a season as the public reads it', () => {
  it('leaves a season with nothing hidden exactly as it was', () => {
    const stored = season({ matches: [fixture(), fixture({ id: 'm-2', round: 2 })] })
    expect(toPublicTournament(stored).matches).toEqual(stored.matches)
  })

  // The whole point: the clubs, the day and the kick-off all go, and so does
  // the id — ids of hand-built rounds have been assembled out of a club id, and
  // a fixture nobody may read has no page to be opened at.
  it('takes the clubs, the date and the id off a fixture in a hidden round', () => {
    const projected = toPublicTournament(
      season({ hiddenRounds: [1], matches: [fixture()] }),
    )

    expect(projected.matches).toEqual([{ hidden: true, round: 1 }])
  })

  it('keeps the count, so the round can be drawn as that many TBA rows', () => {
    const projected = toPublicTournament(
      season({
        hiddenRounds: [1],
        matches: [fixture(), fixture({ id: 'm-2', homeTeamId: 'c', awayTeamId: 'd' })],
      }),
    )

    expect(projected.matches).toHaveLength(2)
  })

  it('leaves the rounds that are not hidden alone', () => {
    const open = fixture({ id: 'm-2', round: 2 })
    const projected = toPublicTournament(
      season({ hiddenRounds: [1], matches: [fixture(), open] }),
    )

    expect(projected.matches[1]).toEqual(open)
  })

  // A result held back would not read as "not announced"; it would read as a
  // league table that is quietly wrong, since the table is counted from these.
  it('publishes a played fixture whatever the round says', () => {
    const played = fixture({ homeGoals: 2, awayGoals: 1 })
    const projected = toPublicTournament(season({ hiddenRounds: [1], matches: [played] }))

    expect(projected.matches).toEqual([played])
  })

  it('treats a half-entered score as still to come', () => {
    const projected = toPublicTournament(
      season({ hiddenRounds: [1], matches: [fixture({ homeGoals: 2 })] }),
    )

    expect(projected.matches).toEqual([{ hidden: true, round: 1 }])
  })

  it('counts a fixture with no round at all as round zero', () => {
    const projected = toPublicTournament(
      season({ hiddenRounds: [0], matches: [fixture({ round: undefined })] }),
    )

    expect(projected.matches).toEqual([{ hidden: true }])
  })

  it('says which rounds are held back, or the page has no round to draw', () => {
    const projected = toPublicTournament(season({ hiddenRounds: [1], matches: [fixture()] }))
    expect((projected as { hiddenRounds?: number[] }).hiddenRounds).toEqual([1])
  })

  // These records are schemaless and a tournament POST passes its body through,
  // so both of these are writable today — and a 500 here is a 500 for every
  // visitor of every page that names this competition.
  it('survives a matches array that is not an array, and holes in one', () => {
    expect(() => toPublicTournament(season({ matches: 'nonsense' }))).not.toThrow()
    expect(toPublicTournament(season({ hiddenRounds: [1], matches: [null] })).matches).toEqual([
      null,
    ])
  })
})

describe('a `hidden` nobody put there through the projection', () => {
  // `POST /admin/tournaments` passes its body through, so one is writable today
  // — and the pages read this field as the server's word that a fixture was
  // withheld. Left in place it would draw TBA over a match sent in full.
  it('is taken off a fixture that is being published', () => {
    const projected = toPublicTournament(season({ matches: [fixture({ hidden: true })] }))
    expect(projected.matches[0]).toEqual(fixture())
  })

  it('is taken off a played fixture inside a hidden round', () => {
    const projected = toPublicTournament(
      season({
        hiddenRounds: [1],
        matches: [fixture({ hidden: true, homeGoals: 1, awayGoals: 0 })],
      }),
    )
    expect(projected.matches[0]).toEqual(fixture({ homeGoals: 1, awayGoals: 0 }))
  })
})

describe('what a redacted fixture still says about where it belongs', () => {
  // Without these the page files a hidden Division 2 tie under Division 1 and
  // draws a game in a bracket it is not part of.
  it('keeps the division and the group', () => {
    const projected = toPublicTournament(
      season({
        hiddenRounds: [1],
        matches: [fixture({ isPlayoff: true, playoffRound: 0, division: 2, groupIndex: 3 })],
      }),
    )

    expect(projected.matches[0]).toEqual({
      hidden: true,
      round: 1,
      isPlayoff: true,
      playoffRound: 0,
      division: 2,
      groupIndex: 3,
    })
  })
})

describe('the legacy playoff bracket', () => {
  // Nothing writes it and no screen reads it, and on the records that still
  // carry one it names the pairings by club and date — the fixtures this
  // projection has just redacted.
  it('does not leave the API at all', () => {
    const projected = toPublicTournament(
      season({
        hiddenRounds: [1],
        matches: [fixture()],
        playoffBrackets: [
          { round: 1, matches: [{ matchId: 'm-1', homeTeamId: 'a', awayTeamId: 'b' }] },
        ],
      }),
    )

    expect((projected as { playoffBrackets?: unknown }).playoffBrackets).toBeUndefined()
  })
})

describe('a hand-built playoff round the organiser has not announced', () => {
  const withRounds = (rounds: unknown[]) =>
    season({
      format: {
        mode: 'league_custom_playoff',
        rounds: 1,
        customPlayoffConfig: { playoffTeams: 4, enableBye: true, preset: 'progressive_elimination', playoffRounds: rounds },
      },
    })

  const roundsOf = (tournament: Tournament) =>
    ((tournament.format as Record<string, any>).customPlayoffConfig.playoffRounds) as any[]

  it('redacts its fixtures and leaves the round itself readable', () => {
    const projected = toPublicTournament(
      withRounds([
        { roundNumber: 1, name: 'Week 1', hidden: true, matches: [fixture({ round: undefined })] },
      ]),
    )

    const round = roundsOf(projected)[0]
    expect(round.name).toBe('Week 1')
    expect(round.hidden).toBe(true)
    expect(round.matches).toEqual([{ hidden: true }])
  })

  it('leaves a round nobody hid exactly as it was', () => {
    const stored = withRounds([{ roundNumber: 1, name: 'Week 1', matches: [fixture()] }])
    expect(roundsOf(toPublicTournament(stored))).toEqual(roundsOf(stored))
  })

  // The trap CLAUDE.md names: rebuilding this object without `preset` turns a
  // progressive-elimination season into a generic one.
  it('carries the preset through', () => {
    const projected = toPublicTournament(
      withRounds([{ roundNumber: 1, name: 'Week 1', hidden: true, matches: [] }]),
    )
    const config = (projected.format as Record<string, any>).customPlayoffConfig
    expect(config.preset).toBe('progressive_elimination')
    expect(config.playoffTeams).toBe(4)
  })

  it('publishes a played fixture inside a hidden round', () => {
    const played = fixture({ homeGoals: 0, awayGoals: 0 })
    const projected = toPublicTournament(
      withRounds([{ roundNumber: 1, name: 'Week 1', hidden: true, matches: [played] }]),
    )
    expect(roundsOf(projected)[0].matches).toEqual([played])
  })
})

describe('playoffs on the public page', () => {
  const played = (extra: Record<string, unknown> = {}) =>
    fixture({ homeGoals: 1, awayGoals: 0, ...extra })
  const tie = (extra: Record<string, unknown> = {}) =>
    fixture({ id: 'p-1', homeTeamId: 'a', awayTeamId: 'c', isPlayoff: true, playoffRound: 0, round: 5, ...extra })

  it('leaves them out while a league fixture has no score', () => {
    const stored = season({ matches: [played(), fixture({ id: 'm-2' }), tie()] })
    expect(playoffsWithheld(stored)).toBe(true)
    expect(toPublicTournament(stored).matches).toEqual(stored.matches.slice(0, 2))
  })

  it('publishes them once every league fixture has a score', () => {
    const stored = season({ matches: [played(), played({ id: 'm-2' }), tie()] })
    expect(playoffsWithheld(stored)).toBe(false)
    expect(toPublicTournament(stored).matches).toEqual(stored.matches)
  })

  // A bye and a cancelled fixture will never have a score; waiting for them
  // would keep the playoffs back for ever.
  it('does not wait for a bye or a cancelled fixture', () => {
    const stored = season({
      matches: [
        played(),
        fixture({ id: 'bye', homeTeamId: 'c', awayTeamId: 'c' }),
        fixture({ id: 'off', status: 'cancelled' }),
        tie(),
      ],
    })
    expect(playoffsWithheld(stored)).toBe(false)
  })

  it('waits for a postponed fixture', () => {
    expect(playoffsWithheld(season({ matches: [fixture({ status: 'postponed' }), tie()] }))).toBe(true)
  })

  it('has nothing to wait for in a straight knockout', () => {
    const stored = season({ matches: [tie()] })
    expect(playoffsWithheld(stored)).toBe(false)
    expect(toPublicTournament(stored).matches).toEqual(stored.matches)
  })

  // No match without its two clubs on the public page: an unfilled slot, or a
  // later round still waiting on the one before it, is left out.
  it('leaves out a slot that does not name two clubs, even after the league', () => {
    const stored = season({
      matches: [
        played(),
        tie({ id: 'p-1', homeTeamId: 'seed-1', awayTeamId: 'seed-4' }),
        tie({ id: 'p-2', homeTeamId: 'a', awayTeamId: 'winner_0_1' }),
        tie({ id: 'p-3', homeTeamId: 'BYE', awayTeamId: 'b' }),
      ],
    })
    expect(toPublicTournament(stored).matches).toEqual([stored.matches[0]])
  })

  // The other leg names the same clubs the other way round; without it the page
  // decides a two-legged tie on the first leg.
  it('publishes the second leg of a tie whose first leg is played', () => {
    const first = tie({ id: 'p-1', tie: { id: 't-1', leg: 1 }, homeGoals: 1, awayGoals: 0 })
    const second = tie({ id: 'p-2', homeTeamId: 'c', awayTeamId: 'a', tie: { id: 't-1', leg: 2 } })
    const other = tie({ id: 'p-3', homeTeamId: 'b', awayTeamId: 'd', tie: { id: 't-2', leg: 1 } })
    const projected = toPublicTournament(season({ matches: [fixture(), first, second, other] }))
    expect(projected.matches.map((match: any) => match.id)).toEqual(['m-1', 'p-1', 'p-2'])
  })

  // The page decides whether the season is over from the matches it is given.
  it('says there is more to come when it has left a fixture out', () => {
    const pending = toPublicTournament(season({ matches: [played(), tie({ homeTeamId: 'seed-1' })] }))
    expect((pending as any).playoffsPending).toBe(true)
    const done = toPublicTournament(season({ matches: [played(), tie()], playoffsPending: true }))
    expect((done as any).playoffsPending).toBeUndefined()
  })

  it('still publishes a playoff result', () => {
    const result = tie({ homeGoals: 2, awayGoals: 1 })
    const projected = toPublicTournament(season({ matches: [fixture(), result] }))
    expect(projected.matches[1]).toEqual(result)
  })

  const handBuilt = (matches: unknown[], rounds: unknown[] = [{ roundNumber: 1, name: 'Semi-finals', matches: [tie({ round: undefined })] }]) =>
    season({
      matches,
      format: {
        mode: 'league_custom_playoff',
        customPlayoffConfig: { preset: 'progressive_elimination', playoffRounds: rounds },
      },
    })
  const roundsOf = (t: Tournament) =>
    (t.format as Record<string, any>).customPlayoffConfig.playoffRounds as any[]

  it('leaves out a hand-built round with nothing left to show', () => {
    expect(roundsOf(toPublicTournament(handBuilt([fixture()])))).toEqual([])
  })

  it('keeps a hand-built round once its pairings are known', () => {
    const stored = handBuilt([played()])
    expect(roundsOf(toPublicTournament(stored))).toEqual(roundsOf(stored))
  })

  it('keeps a played fixture of a hand-built round and drops the rest', () => {
    const result = tie({ id: 'p-9', homeGoals: 1, awayGoals: 1, round: undefined })
    const projected = toPublicTournament(
      handBuilt([fixture()], [{ roundNumber: 1, name: 'Week 1', matches: [result, tie({ round: undefined })] }]),
    )
    expect(roundsOf(projected)[0].matches).toEqual([result])
    // The clubs of the fixture left out are not resting.
    expect(roundsOf(projected)[0].partial).toBe(true)
  })
})
