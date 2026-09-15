import { badRequest } from './http.js'

type Shootout = { home: number; away: number }

const kicks = (side: unknown): side is number =>
  typeof side === 'number' && Number.isInteger(side) && side >= 0 && side <= 99

/**
 * A penalty shootout is two whole counts of kicks, or nothing at all.
 *
 * It returns the value rather than only approving it, the way `readGoal` and
 * `pickNumbers` do: these records are schemaless, so a record that is attested
 * and then stored as it arrived keeps whatever else was sitting on it.
 * `null` is how a shootout entered by mistake is taken off again, because JSON
 * has no undefined and a key left out of the body means "unchanged".
 */
export function readShootout(value: unknown): Shootout | null {
  if (value === null || value === undefined) return null

  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !kicks((value as Record<string, unknown>).home) ||
    !kicks((value as Record<string, unknown>).away)
  ) {
    throw badRequest('shootout must be { home, away } as whole numbers of penalties')
  }

  const { home, away } = value as Shootout
  return { home, away }
}

/**
 * The same, in place, on a record that may carry one.
 *
 * Every route that can write a fixture calls this, the create and the two
 * pass-through bodies included. A validation that runs on the update and not on
 * the create has not been done: that is how a colour of any shape went on being
 * stored after the update route started refusing it, and `matches` is written
 * whole by two routes here.
 */
export function assertShootout(record: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(record, 'shootout')) return
  record.shootout = readShootout(record.shootout)
}

/**
 * Every fixture a tournament body carries, in both of the places one can live.
 *
 * A fixture has two homes — `matches`, and the hand-built rounds inside
 * `format.customPlayoffConfig.playoffRounds` — and the create and the update
 * both pass their whole body through, so a check that only reads `matches`
 * covers half of them.
 */
export function assertShootoutsInBody(body: Record<string, unknown>): void {
  const fixtures: unknown[] = []

  if (Array.isArray(body.matches)) fixtures.push(...body.matches)

  const format = body.format
  if (format && typeof format === 'object') {
    const config = (format as Record<string, unknown>).customPlayoffConfig
    if (config && typeof config === 'object') {
      const rounds = (config as Record<string, unknown>).playoffRounds
      if (Array.isArray(rounds)) {
        for (const round of rounds) {
          if (round && typeof round === 'object' && Array.isArray((round as Record<string, unknown>).matches)) {
            fixtures.push(...((round as Record<string, unknown>).matches as unknown[]))
          }
        }
      }
    }
  }

  for (const fixture of fixtures) {
    if (fixture && typeof fixture === 'object' && !Array.isArray(fixture)) {
      assertShootout(fixture as Record<string, unknown>)
    }
  }
}
