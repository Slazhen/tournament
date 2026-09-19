import { describe, expect, it } from 'vitest'
import {
  assertStaffName,
  newStaff,
  staffUpdates,
  toPublicStaff,
  STAFF_ROLES,
} from '../src/lib/staff.js'

/**
 * What may be written about a club's coaching staff.
 *
 * The club record is schemaless and this list goes out whole to every public
 * page that names the club, so the whitelist is the only thing between a
 * manager and an attribute of their own invention sitting on it.
 */
describe('staffUpdates', () => {
  it('keeps only the fields a member of staff has', () => {
    expect(
      staffUpdates({
        role: 'coach',
        firstName: 'Vasily',
        lastName: 'Esipov',
        photo: 'https://images.example/x.jpg',
        organizerId: 'someone-else',
        managerUserIds: ['me'],
      }),
    ).toEqual({
      role: 'coach',
      firstName: 'Vasily',
      lastName: 'Esipov',
      photo: 'https://images.example/x.jpg',
    })
  })

  it('accepts every role and nothing else', () => {
    for (const role of STAFF_ROLES) {
      expect(staffUpdates({ role })).toEqual({ role })
    }
    for (const role of ['manager', '', null, 1, undefined]) {
      expect(() => staffUpdates({ role })).toThrow()
    }
  })

  it('trims a name and refuses one that is not text', () => {
    expect(staffUpdates({ firstName: '  Vasily  ' })).toEqual({ firstName: 'Vasily' })
    expect(() => staffUpdates({ lastName: 42 })).toThrow()
    expect(() => staffUpdates({ firstName: 'x'.repeat(81) })).toThrow()
  })

  it('lets a photograph be cleared with null, and refuses anything but an address', () => {
    expect(staffUpdates({ photo: null })).toEqual({ photo: null })
    expect(staffUpdates({ photo: 'https://images.example/x.jpg' })).toEqual({
      photo: 'https://images.example/x.jpg',
    })
    for (const photo of [7, 'javascript:alert(1)', 'x.jpg', `https://e/${'a'.repeat(600)}.jpg`]) {
      expect(() => staffUpdates({ photo })).toThrow()
    }
  })

  it('changes nothing when the body names nothing', () => {
    expect(staffUpdates({})).toEqual({})
  })
})

/**
 * Adding somebody is the one moment at which the role and the name cannot be
 * inherited from what is already stored, so both are required here and only
 * here.
 */
describe('newStaff', () => {
  it('requires a role and a name', () => {
    expect(() => newStaff({ firstName: 'Vasily' })).toThrow()
    expect(() => newStaff({ role: 'physio' })).toThrow()
    expect(() => newStaff({ role: 'physio', firstName: '', lastName: '' })).toThrow()
  })

  it('takes a surname alone', () => {
    expect(newStaff({ role: 'assistant_coach', lastName: 'Esipov' })).toEqual({
      role: 'assistant_coach',
      firstName: '',
      lastName: 'Esipov',
    })
  })

  it('drops a clearing null: a new record has nothing to clear', () => {
    expect(newStaff({ role: 'coach', firstName: 'Ann', photo: null })).toEqual({
      role: 'coach',
      firstName: 'Ann',
      lastName: '',
    })
  })
})

/**
 * The check that keeps a row from losing its name.
 *
 * Asked of the record as it will be stored, because the halves are written
 * separately: emptying the first name in one request and the surname in the
 * next passes anything that only reads what arrived, and the row left behind
 * has a photograph, a role and nobody nameable on it.
 */
describe('assertStaffName', () => {
  it('takes either half', () => {
    expect(() => assertStaffName('Vasily', '')).not.toThrow()
    expect(() => assertStaffName('', 'Esipov')).not.toThrow()
  })

  it('refuses two empty halves, however they are spelt', () => {
    expect(() => assertStaffName('', '')).toThrow()
    expect(() => assertStaffName('   ', undefined)).toThrow()
    expect(() => assertStaffName(undefined, undefined)).toThrow()
  })
})

/**
 * What leaves the club. A named list, because these records are schemaless and
 * a field added here next year would otherwise be public the day it is written.
 */
describe('toPublicStaff', () => {
  it('keeps the fields a page draws and drops everything else', () => {
    expect(
      toPublicStaff([
        {
          id: 's1',
          role: 'coach',
          firstName: 'Vasily',
          lastName: 'Esipov',
          photo: 'https://images.example/x.jpg',
          createdAtISO: '2026-09-19T00:00:00.000Z',
          phone: '+61 400 000 000',
          notes: 'not for publication',
        },
      ]),
    ).toEqual([
      {
        id: 's1',
        role: 'coach',
        firstName: 'Vasily',
        lastName: 'Esipov',
        photo: 'https://images.example/x.jpg',
        createdAtISO: '2026-09-19T00:00:00.000Z',
      },
    ])
  })

  it('steps over holes and anything with no role to be listed under', () => {
    expect(toPublicStaff([null, { id: 's2' }, { id: 's3', role: 'manager' }])).toEqual([])
  })

  it('answers nothing at all for a club that has no staff stored', () => {
    expect(toPublicStaff(undefined)).toBeUndefined()
    expect(toPublicStaff('nonsense')).toBeUndefined()
  })
})
