import { describe, expect, it } from 'vitest'
import { assertDisciplineInBody, keepDiscipline, readDisciplineRules } from '../src/lib/discipline.js'

/**
 * What may be stored as a card rule.
 *
 * The site reads these defensively and falls back field by field, so nothing on
 * screen breaks over a bad one. That is the backstop; these tests hold down the
 * guard. The second thing they hold down is that the check runs on the routes
 * that write `format` whole as well as on the route that writes the rules —
 * `POST /admin/tournaments` passes its body through, and a validation that runs
 * on the update and not on the create has not been done.
 */

const whole = {
  red: 1,
  secondYellow: 1,
  blue: 0,
  yellowEvery: 3,
  yellowSuspension: 1,
  secondYellowCounts: 0,
  blueEvery: 0,
  blueSuspension: 1,
}

describe('readDisciplineRules', () => {
  it('reads the eight numbers', () => {
    expect(readDisciplineRules(whole)).toEqual(whole)
  })

  it('refuses a rule that is missing', () => {
    const { blue, ...rest } = whole
    expect(() => readDisciplineRules(rest)).toThrow(/blue/)
  })

  it('refuses anything that is not a whole number of matches', () => {
    expect(() => readDisciplineRules({ ...whole, red: 1.5 })).toThrow(/red/)
    expect(() => readDisciplineRules({ ...whole, red: '1' })).toThrow(/red/)
    expect(() => readDisciplineRules({ ...whole, red: -1 })).toThrow(/red/)
    expect(() => readDisciplineRules({ ...whole, red: Number.POSITIVE_INFINITY })).toThrow(/red/)
  })

  it('refuses a ban longer than a season and a threshold nobody reaches', () => {
    expect(() => readDisciplineRules({ ...whole, red: 21 })).toThrow(/red/)
    expect(() => readDisciplineRules({ ...whole, yellowEvery: 51 })).toThrow(/yellowEvery/)
    expect(() => readDisciplineRules({ ...whole, secondYellowCounts: 3 })).toThrow(
      /secondYellowCounts/,
    )
  })

  it('takes nought, which is a rule rather than an empty box', () => {
    expect(readDisciplineRules({ ...whole, red: 0 }).red).toBe(0)
  })

  it('refuses a body that is not an object at all', () => {
    expect(() => readDisciplineRules(null)).toThrow()
    expect(() => readDisciplineRules('all of them')).toThrow()
  })
})

describe('assertDisciplineInBody', () => {
  it('passes a body carrying no format and a format carrying no rules', () => {
    expect(() => assertDisciplineInBody({ name: 'A season' })).not.toThrow()
    expect(() => assertDisciplineInBody({ format: { rounds: 1, mode: 'league' } })).not.toThrow()
  })

  it('checks the rules a create writes into format', () => {
    expect(() =>
      assertDisciplineInBody({ format: { rounds: 1, mode: 'league', discipline: whole } }),
    ).not.toThrow()
    expect(() =>
      assertDisciplineInBody({
        format: { rounds: 1, mode: 'league', discipline: { ...whole, red: 'lots' } },
      }),
    ).toThrow(/red/)
  })

  it('refuses a discipline that is not an object', () => {
    expect(() => assertDisciplineInBody({ format: { discipline: 'strict' } })).toThrow()
  })
})

describe('keepDiscipline', () => {
  const stored = { rounds: 1, mode: 'league', discipline: whole }

  it('carries the stored rules through a format that does not name them', () => {
    const body = { format: { rounds: 2, mode: 'league' } }
    const kept = keepDiscipline(body, stored)
    expect((kept.format as Record<string, unknown>).discipline).toEqual(whole)
    // The body itself is left alone: the caller decides what to write.
    expect((body.format as Record<string, unknown>).discipline).toBeUndefined()
  })

  it('leaves a body that names them alone', () => {
    const sent = { ...whole, red: 2 }
    const kept = keepDiscipline({ format: { rounds: 1, mode: 'league', discipline: sent } }, stored)
    expect((kept.format as Record<string, unknown>).discipline).toEqual(sent)
  })

  it('does nothing where there is nothing to carry', () => {
    const body = { format: { rounds: 1, mode: 'league' } }
    expect(keepDiscipline(body, { rounds: 1, mode: 'league' })).toBe(body)
    expect(keepDiscipline(body, undefined)).toBe(body)
  })

  it('does nothing to a body writing no format at all', () => {
    const body = { name: 'A season' }
    expect(keepDiscipline(body, stored)).toBe(body)
  })
})
