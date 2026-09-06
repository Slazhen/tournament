import { badRequest } from './http.js'
import type { Side } from './lineups.js'

export type GoalType = 'goal' | 'penalty' | 'own_goal'

/**
 * Who put the event in.
 *
 * Not an account id, on purpose. A goal travels whole to every visitor of the
 * public match page and to the opposing club's manager, and an account id on
 * it would be an identifier leaving the API for nothing: the only question
 * anything asks of this field is whether the club may correct its own entry,
 * and the club is already named by the side the goal counts for.
 */
export type GoalAuthor = 'organizer' | 'club'

export type StoredGoal = {
  id: string
  team: Side
  playerId: string
  /**
   * Absent where nobody knew it.
   *
   * A manager filling in last month's scoresheet remembers who scored and not
   * when, and a required minute is answered by typing a number at random —
   * which is worse than a dash, because it sorts the timeline wrongly and
   * cannot be told from a real one.
   */
  minute?: number
  type: GoalType
  assistPlayerId?: string
  enteredBy?: GoalAuthor
}

const TYPES = new Set<GoalType>(['goal', 'penalty', 'own_goal'])

/** The goals of a fixture, with anything that is not a goal record dropped. */
export function goalsOf(match: Record<string, unknown> | undefined | null): StoredGoal[] {
  const list = (match as { goals?: unknown } | null | undefined)?.goals
  if (!Array.isArray(list)) return []
  return list.filter(
    (goal): goal is StoredGoal =>
      Boolean(goal) && typeof goal === 'object' && typeof (goal as StoredGoal).id === 'string',
  )
}

/** How many goals are recorded as counting for one side. */
export function recordedFor(match: Record<string, unknown>, side: Side): number {
  return goalsOf(match).filter((goal) => goal.team === side).length
}

const scoreField = (side: Side) => (side === 'home' ? 'homeGoals' : 'awayGoals')

/** The score as stored, treating anything but a number as no result at all. */
export function scoredBy(match: Record<string, unknown>, side: Side): number {
  const value = match[scoreField(side)]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * How many of one side's goals nobody has named a scorer for.
 *
 * The whole feature rests on this being derived rather than stored. An
 * organiser types 2-1 on the season page and the events follow later, often
 * from somebody else: those two unattributed goals are already a fact of the
 * record, and writing them out as empty rows would mean migrating every match
 * ever played, deciding which of the empty ones to delete when a score is
 * corrected, and keeping them out of every tally that walks `goals`.
 */
export function unattributed(match: Record<string, unknown>, side: Side): number {
  return Math.max(0, scoredBy(match, side) - recordedFor(match, side))
}

/**
 * The score once this goal is added, or null when it does not move.
 *
 * Filling in a goal the score already counts changes nothing: that is what an
 * unattributed goal is. A goal the score has no room for is a goal the score
 * did not know about, so it raises it by one — which is also what makes
 * entering a match from an empty scoresheet work exactly as it did before any
 * of this, one goal at a time.
 *
 * Deleting is deliberately not the mirror of it: the goal becomes unattributed
 * again and the score stands, because a score is the organiser's record of the
 * result and a mistyped scorer is not a reason to change the result. The
 * scoreboard is where a wrong score is corrected.
 */
export function scoreAfterAdding(
  match: Record<string, unknown>,
  side: Side,
): { homeGoals: number; awayGoals: number } | null {
  if (unattributed(match, side) > 0) return null
  return {
    homeGoals: scoredBy(match, 'home') + (side === 'home' ? 1 : 0),
    awayGoals: scoredBy(match, 'away') + (side === 'away' ? 1 : 0),
  }
}

/**
 * One goal as the request describes it, checked.
 *
 * The record is schemaless and everything downstream — the table, the scorer
 * list, the public timeline — walks this list, so a minute of "second half" or
 * a type nobody has heard of is a page rendering nonsense for as long as it
 * takes somebody to notice.
 */
export function readGoal(body: Record<string, unknown>): {
  team: Side
  type: GoalType
  minute?: number
  playerId: string
  assistPlayerId?: string
} {
  const team = body.team
  if (team !== 'home' && team !== 'away') throw badRequest("team must be 'home' or 'away'")

  const type = body.type === undefined ? 'goal' : body.type
  if (typeof type !== 'string' || !TYPES.has(type as GoalType)) {
    throw badRequest("type must be 'goal', 'penalty' or 'own_goal'")
  }

  let minute: number | undefined
  if (body.minute !== undefined && body.minute !== null && body.minute !== '') {
    const value = Number(body.minute)
    if (!Number.isInteger(value) || value < 1 || value > 130) {
      throw badRequest('minute must be a whole number of minutes, or left out')
    }
    minute = value
  }

  const playerId = typeof body.playerId === 'string' ? body.playerId : ''
  const assist = typeof body.assistPlayerId === 'string' ? body.assistPlayerId : ''

  // An own goal has no assist: the field is not offered for one on any screen,
  // and a value stored on an older record is ignored rather than credited.
  return {
    team: team as Side,
    type: type as GoalType,
    minute,
    playerId,
    assistPlayerId: type === 'own_goal' || !assist ? undefined : assist,
  }
}

/**
 * The record as it is stored. `undefined` is dropped on the way to DynamoDB,
 * so an absent minute and an absent assist are absent rather than null.
 */
export function composeGoal(
  id: string,
  fields: ReturnType<typeof readGoal>,
  enteredBy: GoalAuthor,
): StoredGoal {
  return {
    id,
    team: fields.team,
    type: fields.type,
    minute: fields.minute,
    playerId: fields.playerId,
    assistPlayerId: fields.assistPlayerId,
    enteredBy,
  }
}

/**
 * A copy of the fixture with one goal taken out.
 *
 * Correcting a goal is a removal and an addition, and the side it counts for is
 * one of the things that can be corrected — so what the score should be is
 * asked of the match as it would be without this goal.
 */
export function withoutGoal(
  match: Record<string, unknown>,
  goalId: string,
): Record<string, unknown> {
  return { ...match, goals: goalsOf(match).filter((goal) => goal.id !== goalId) }
}

/**
 * The score once a goal already in the match is corrected, or null when it does
 * not move.
 *
 * A goal that stays on its own side never moves the score, whatever else is
 * being corrected. Not `scoreAfterAdding` on the match without it, which is
 * what this was first written as: on a fixture holding more goals for a side
 * than the score counts — which the organiser makes the moment they lower a
 * score somebody had already named the scorers of — that expression finds no
 * room, reads the correction as a new goal and puts the score back up. Fixing a
 * spelling would have raised a result, and for a club manager it was a way to
 * move a league table one edit at a time.
 *
 * A goal moved to the other side is a goal that side did not have, so it is
 * asked the ordinary question. The one it left keeps its score: what that side
 * loses is a name, and the score is the organiser's record of the result.
 */
export function scoreAfterMoving(
  match: Record<string, unknown>,
  goalId: string,
  from: unknown,
  to: Side,
): { homeGoals: number; awayGoals: number } | null {
  if (from === to) return null
  return scoreAfterAdding(withoutGoal(match, goalId), to)
}

/**
 * What the caller read before deciding. The write asserts it.
 *
 * A route decides whether a goal may be added from a copy of the match it read
 * a moment earlier — how many goals that side has, and what the score counts.
 * Without both of those in the condition, two saves whose reads overlap both
 * pass, and the side ends up with more goals than the result it belongs to.
 * The number of goals alone is not enough: it does not notice the organiser
 * correcting the score in the same moment.
 */
export type MatchExpectation = {
  goals: number
  homeGoals?: number
  awayGoals?: number
}

export function expectationOf(match: Record<string, unknown>): MatchExpectation {
  const score = (side: Side) => {
    const value = match[side === 'home' ? 'homeGoals' : 'awayGoals']
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }
  return { goals: goalsOf(match).length, homeGoals: score('home'), awayGoals: score('away') }
}
