import { describe, expect, it } from 'vitest'
import {
  composeGoal,
  expectationOf,
  readGoal,
  recordedFor,
  scoreAfterAdding,
  scoreAfterMoving,
  unattributed,
  withoutGoal,
} from '../src/lib/goals.js'
import { HttpError } from '../src/lib/http.js'

const match = (over: Record<string, unknown> = {}) => ({
  id: 'm-1',
  homeTeamId: 'team-a',
  awayTeamId: 'team-b',
  ...over,
})

describe('the goals a result counts and nobody has named', () => {
  it('is the whole score where no events were entered', () => {
    // The ordinary case in this app: an organiser types a result on the season
    // page and never opens the match screen.
    const played = match({ homeGoals: 3, awayGoals: 1 })
    expect(unattributed(played, 'home')).toBe(3)
    expect(unattributed(played, 'away')).toBe(1)
  })

  it('shrinks as goals are named', () => {
    const played = match({
      homeGoals: 2,
      awayGoals: 0,
      goals: [{ id: 'g1', team: 'home', playerId: 'p1', type: 'goal' }],
    })
    expect(recordedFor(played, 'home')).toBe(1)
    expect(unattributed(played, 'home')).toBe(1)
  })

  it('counts an own goal for the side it counts for, not the side that scored it', () => {
    // `goal.team` is the side the score credits. The scorer plays for the other
    // one, which is why nothing here reads the player at all.
    const played = match({
      homeGoals: 1,
      awayGoals: 0,
      goals: [{ id: 'g1', team: 'home', playerId: '', type: 'own_goal' }],
    })
    expect(unattributed(played, 'home')).toBe(0)
    expect(unattributed(played, 'away')).toBe(0)
  })

  it('never goes negative when more goals are recorded than the score counts', () => {
    const played = match({
      homeGoals: 1,
      awayGoals: 0,
      goals: [
        { id: 'g1', team: 'home', playerId: 'p1', type: 'goal' },
        { id: 'g2', team: 'home', playerId: 'p2', type: 'goal' },
      ],
    })
    expect(unattributed(played, 'home')).toBe(0)
  })

  it('is nothing at all for a fixture with no result', () => {
    expect(unattributed(match(), 'home')).toBe(0)
  })
})

describe('what a goal does to the score', () => {
  it('leaves it alone when the result already counts the goal', () => {
    expect(scoreAfterAdding(match({ homeGoals: 2, awayGoals: 1 }), 'home')).toBeNull()
  })

  it('raises it by one when the result has no room', () => {
    // Entering a match from an empty scoresheet, which is what the organiser's
    // screen has always done.
    expect(scoreAfterAdding(match({ homeGoals: 0, awayGoals: 0 }), 'home')).toEqual({
      homeGoals: 1,
      awayGoals: 0,
    })
  })

  it('starts a scoreless fixture from zero rather than from nothing', () => {
    expect(scoreAfterAdding(match(), 'away')).toEqual({ homeGoals: 0, awayGoals: 1 })
  })

  it('moves the score only for the side the goal counts for', () => {
    const played = match({
      homeGoals: 1,
      awayGoals: 0,
      goals: [{ id: 'g1', team: 'home', playerId: 'p1', type: 'goal' }],
    })
    expect(scoreAfterAdding(played, 'home')).toEqual({ homeGoals: 2, awayGoals: 0 })
    expect(scoreAfterAdding(played, 'away')).toEqual({ homeGoals: 1, awayGoals: 1 })
  })

  it('takes the goal out of the match before asking about a correction', () => {
    const played = match({
      homeGoals: 1,
      awayGoals: 0,
      goals: [{ id: 'g1', team: 'home', playerId: 'p1', type: 'goal' }],
    })
    expect(withoutGoal(played, 'g1').goals).toEqual([])
  })
})

describe('correcting a goal that is already in the match', () => {
  const played = (goals: unknown[]) => match({ homeGoals: 1, awayGoals: 0, goals })

  it('never moves the score while the goal stays on its own side', () => {
    const one = played([{ id: 'g1', team: 'home', playerId: 'p1', type: 'goal' }])
    expect(scoreAfterMoving(one, 'g1', 'home', 'home')).toBeNull()
  })

  it('still does not move it when the fixture holds more goals than the score', () => {
    // What an organiser leaves behind by lowering a score whose scorers were
    // already named. The first version of this asked `scoreAfterAdding` about
    // the match without the goal, found no room, and read a spelling fix as a
    // new goal — so correcting one put the result back up, and a club manager
    // could raise their own side's score one edit at a time.
    const two = played([
      { id: 'g1', team: 'home', playerId: 'p1', type: 'goal' },
      { id: 'g2', team: 'home', playerId: 'p2', type: 'goal' },
    ])
    expect(scoreAfterMoving(two, 'g1', 'home', 'home')).toBeNull()
    expect(scoreAfterMoving(two, 'g2', 'home', 'home')).toBeNull()
  })

  it('raises the other side when the goal moves across', () => {
    const one = played([{ id: 'g1', team: 'home', playerId: 'p1', type: 'goal' }])
    expect(scoreAfterMoving(one, 'g1', 'home', 'away')).toEqual({ homeGoals: 1, awayGoals: 1 })
  })

  it('leaves the side it moved away from alone: what that side lost is a name', () => {
    const one = played([{ id: 'g1', team: 'home', playerId: 'p1', type: 'goal' }])
    expect(scoreAfterMoving(one, 'g1', 'home', 'away')?.homeGoals).toBe(1)
  })
})

describe('what the write asserts', () => {
  it('carries both the number of goals and the score the caller read', () => {
    const played = match({
      homeGoals: 2,
      awayGoals: 1,
      goals: [{ id: 'g1', team: 'home', playerId: 'p1', type: 'goal' }],
    })
    expect(expectationOf(played)).toEqual({ goals: 1, homeGoals: 2, awayGoals: 1 })
  })

  it('says a fixture with no result has none, rather than calling it nil-nil', () => {
    // Asserted as absent in the condition: a score of zero and no score at all
    // are different records, and a fixture that acquired a 0-0 in the meantime
    // is one this caller has not read.
    expect(expectationOf(match())).toEqual({
      goals: 0,
      homeGoals: undefined,
      awayGoals: undefined,
    })
  })
})

describe('reading a goal off a request', () => {
  it('refuses a side that is not a side', () => {
    expect(() => readGoal({ team: 'both' })).toThrow(HttpError)
    expect(() => readGoal({})).toThrow(HttpError)
  })

  it('refuses a type nobody has heard of', () => {
    expect(() => readGoal({ team: 'home', type: 'header' })).toThrow(HttpError)
  })

  it('takes a goal with no minute, and refuses one with a minute that is not one', () => {
    expect(readGoal({ team: 'home', playerId: 'p1' }).minute).toBeUndefined()
    expect(readGoal({ team: 'home', playerId: 'p1', minute: '' }).minute).toBeUndefined()
    expect(readGoal({ team: 'home', playerId: 'p1', minute: null }).minute).toBeUndefined()
    expect(readGoal({ team: 'home', playerId: 'p1', minute: 61 }).minute).toBe(61)
    expect(() => readGoal({ team: 'home', playerId: 'p1', minute: 0 })).toThrow(HttpError)
    expect(() => readGoal({ team: 'home', playerId: 'p1', minute: 'late' })).toThrow(HttpError)
  })

  it('drops the assist on an own goal rather than crediting it', () => {
    const goal = readGoal({
      team: 'home',
      type: 'own_goal',
      playerId: '',
      assistPlayerId: 'p9',
    })
    expect(goal.assistPlayerId).toBeUndefined()
  })

  it('records who entered it, which is what decides who may correct it', () => {
    expect(composeGoal('g1', readGoal({ team: 'home', playerId: 'p1' }), 'club').enteredBy).toBe(
      'club',
    )
  })
})
