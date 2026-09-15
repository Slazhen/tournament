import { describe, expect, it } from 'vitest'
import { assertDeductionsInBody, composeDeduction } from '../src/lib/deductions.js'

/**
 * What may be stored as a punishment.
 *
 * A deduction is subtracted from a published table, so the two things these
 * tests hold down are that it can only ever take points away, and that the
 * check runs on the create as well as on the write — `POST /admin/tournaments`
 * passes its body through, and a validation that runs on the update and not on
 * the create has not been done.
 */
describe('composeDeduction', () => {
  const teamIds = ['t1', 't2']

  it('reads a whole deduction', () => {
    const deduction = composeDeduction(
      'd1',
      { teamId: 't1', points: 3, reason: '  Ineligible player  ' },
      teamIds,
    )
    expect(deduction).toMatchObject({
      id: 'd1',
      teamId: 't1',
      points: 3,
      reason: 'Ineligible player',
    })
    expect(Number.isNaN(Date.parse(deduction.createdAtISO))).toBe(false)
  })

  it('refuses a club that does not play in this competition', () => {
    expect(() => composeDeduction('d1', { teamId: 't9', points: 3, reason: 'No' }, teamIds)).toThrow()
  })

  it('refuses points that are not a whole number of points to lose', () => {
    for (const points of [0, -3, 1.5, 100, '3', null, undefined]) {
      expect(() =>
        composeDeduction('d1', { teamId: 't1', points, reason: 'Why' }, teamIds),
      ).toThrow()
    }
  })

  it('refuses a punishment nobody is told the reason for', () => {
    for (const reason of ['', '   ', 42, undefined, 'x'.repeat(201)]) {
      expect(() =>
        composeDeduction('d1', { teamId: 't1', points: 3, reason }, teamIds),
      ).toThrow()
    }
  })

  it('keeps nothing else the body was carrying', () => {
    const deduction = composeDeduction(
      'd1',
      { teamId: 't1', points: 3, reason: 'Why', enteredBy: 'somebody', points2: 9 },
      teamIds,
    ) as Record<string, unknown>
    expect(Object.keys(deduction).sort()).toEqual(
      ['createdAtISO', 'id', 'points', 'reason', 'teamId'].sort(),
    )
  })
})

describe('assertDeductionsInBody', () => {
  it('leaves a body without the field alone', () => {
    const body: Record<string, unknown> = { name: 'A season' }
    assertDeductionsInBody(body)
    expect(body).toEqual({ name: 'A season' })
  })

  it('rewrites the list as the records it read', () => {
    const body: Record<string, unknown> = {
      teamIds: ['t1'],
      pointDeductions: [
        { id: 'd1', teamId: 't1', points: 3, reason: 'Why', createdAtISO: '2026-01-01T00:00:00.000Z', extra: 1 },
      ],
    }
    assertDeductionsInBody(body)
    expect(body.pointDeductions).toEqual([
      {
        id: 'd1',
        teamId: 't1',
        points: 3,
        reason: 'Why',
        createdAtISO: '2026-01-01T00:00:00.000Z',
      },
    ])
  })

  it('refuses a bonus dressed as a deduction on the create', () => {
    const body: Record<string, unknown> = {
      teamIds: ['t1'],
      pointDeductions: [{ id: 'd1', teamId: 't1', points: -3, reason: 'A gift' }],
    }
    expect(() => assertDeductionsInBody(body)).toThrow()
  })

  it('refuses a value that is not a list of records', () => {
    expect(() => assertDeductionsInBody({ pointDeductions: 'three' })).toThrow()
    expect(() => assertDeductionsInBody({ pointDeductions: [null] })).toThrow()
    expect(() =>
      assertDeductionsInBody({ pointDeductions: [{ teamId: 't1', points: 1, reason: 'No id' }] }),
    ).toThrow()
  })

  it('refuses a club the season does not carry', () => {
    expect(() =>
      assertDeductionsInBody({
        teamIds: ['t1'],
        pointDeductions: [{ id: 'd1', teamId: 't9', points: 1, reason: 'Why' }],
      }),
    ).toThrow()
  })
})
