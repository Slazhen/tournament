import { badRequest } from './http.js'

/**
 * What a card costs a player, checked before it is stored.
 *
 * The rules are the season's, like `scoring` beside them in `format`, and the
 * site reads them defensively because `format` is written whole by the create
 * route. That is the backstop and not the guard: a number stored as `Infinity`
 * or as a string is a rule nobody on screen can read back, so it is refused
 * where it is written.
 *
 * Every number is matches, and zero means the card suspends nobody — which is
 * what a blue card does by default, and what a yellow does until somebody sets
 * a threshold.
 */
export type DisciplineRules = {
  red: number
  secondYellow: number
  blue: number
  yellowEvery: number
  yellowSuspension: number
  secondYellowCounts: number
  blueEvery: number
  blueSuspension: number
}

/** Nobody sits out more than a season, and no threshold is worth more than one. */
const LIMITS: Record<keyof DisciplineRules, number> = {
  red: 20,
  secondYellow: 20,
  blue: 20,
  yellowEvery: 50,
  yellowSuspension: 20,
  secondYellowCounts: 2,
  blueEvery: 50,
  blueSuspension: 20,
}

const FIELDS = Object.keys(LIMITS) as Array<keyof DisciplineRules>

const readOne = (value: unknown, field: keyof DisciplineRules): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > LIMITS[field]) {
    throw badRequest(`${field} has to be a whole number between 0 and ${LIMITS[field]}`)
  }
  return value
}

/** The eight numbers, all of them, or a refusal naming the one that is wrong. */
export function readDisciplineRules(body: unknown): DisciplineRules {
  if (!body || typeof body !== 'object') throw badRequest('No rules were sent')
  const sent = body as Record<string, unknown>

  const rules = {} as DisciplineRules
  for (const field of FIELDS) rules[field] = readOne(sent[field], field)
  return rules
}

/**
 * The card rules a `format` written whole must not take off.
 *
 * `PATCH /admin/tournaments/:id` writes the whole `format` attribute from
 * whatever copy the browser is holding, which is why these rules have a route
 * of their own. But the check above only refuses a value it can read — it says
 * nothing about a body that simply does not carry one, and that is the shape
 * that costs the data: a tab loaded before the rules were saved, or the group
 * repair on the season page, which posts `format` by itself on a timer with
 * nobody pressing anything. Either would take the season's suspensions off in
 * silence, and the public pages would go back to counting cards by the
 * defaults — a change to who is allowed to play, made by a screen that was not
 * editing the subject.
 *
 * So the rules are carried rather than accepted as absent. They are changed at
 * their own route and nowhere else; `POST /admin/tournaments` is untouched,
 * because a season being created has nothing to carry.
 */
export function keepDiscipline(
  body: Record<string, unknown>,
  storedFormat: unknown,
): Record<string, unknown> {
  const sent = body?.format
  if (!sent || typeof sent !== 'object' || Array.isArray(sent)) return body
  if ((sent as Record<string, unknown>).discipline !== undefined) return body

  const stored =
    storedFormat && typeof storedFormat === 'object' && !Array.isArray(storedFormat)
      ? (storedFormat as Record<string, unknown>).discipline
      : undefined
  if (stored === undefined) return body

  return { ...body, format: { ...(sent as Record<string, unknown>), discipline: stored } }
}

/**
 * The same check, for the routes that write `format` whole.
 *
 * `POST /admin/tournaments` and `PATCH /admin/tournaments/:id` pass their
 * bodies through, so the create screen writes these rules by that road and
 * anything at all could be written by it. A validation that runs on the update
 * and not on the create has not been done — this repository has learned that
 * one twice.
 */
export function assertDisciplineInBody(body: unknown): void {
  const format = (body as { format?: unknown } | null | undefined)?.format
  if (!format || typeof format !== 'object') return
  const discipline = (format as { discipline?: unknown }).discipline
  if (discipline === undefined) return
  readDisciplineRules(discipline)
}
