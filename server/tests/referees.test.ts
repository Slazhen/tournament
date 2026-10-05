import { describe, expect, it } from 'vitest'
import {
  keepAppointments,
  appointmentOf,
  appointmentsOf,
  positionOf,
  publicRefereeNames,
  readAppointments,
  readRefereeEmail,
  readRefereeName,
  refereeNameIndex,
  refereesOf,
  withRefereeNames,
} from '../src/lib/referees.js'
import { cardsOf, composeCard, readCard } from '../src/lib/cards.js'
import { isInviteKind } from '../src/lib/invites.js'
import { scoreIsReferees } from '../src/routes/referees.js'
import {
  assertCanAccessOrganizer,
  assertIsOrganizer,
  assertManagesTeam,
  assertSuperAdmin,
} from '../src/lib/auth.js'
import { HttpError } from '../src/lib/http.js'
import type { AuthUser, Organizer } from '../src/lib/types.js'

const organizer = (referees: unknown[]): Organizer => ({
  id: 'org-1',
  name: 'League',
  email: 'league@example.com',
  createdAtISO: '2026-01-01T00:00:00.000Z',
  referees,
})

const ann = { id: 'r-ann', name: 'Ann Whistle', email: 'ann@example.com', userId: 'u-ann', createdAtISO: 'x' }
const bob = { id: 'r-bob', name: 'Bob Flag', email: 'bob@example.com', createdAtISO: 'x' }

const refereeAccount: AuthUser = {
  id: 'u-ann',
  email: 'ann@example.com',
  role: 'referee',
  passwordHash: 'x'.repeat(128),
  salt: 'salt',
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
}

describe('what a referee account is not', () => {
  it('runs no competition and no club', () => {
    // A referee carries no organizerId. Every organiser route asks
    // `assertCanAccessOrganizer`, which refuses a missing id on purpose.
    expect(() => assertCanAccessOrganizer(refereeAccount, 'org-1')).toThrow(HttpError)
    expect(() => assertIsOrganizer(refereeAccount)).toThrow(HttpError)
    expect(() => assertSuperAdmin(refereeAccount)).toThrow(HttpError)
    expect(() =>
      assertManagesTeam(refereeAccount, { id: 't', organizerId: 'org-1', managerUserIds: [] }),
    ).toThrow(HttpError)
  })
})

describe('the organiser list', () => {
  it('drops anything that is not a referee', () => {
    expect(refereesOf(organizer([ann, null, { id: 3 }, 'x', bob]))).toEqual([ann, bob])
    expect(refereesOf(null)).toEqual([])
    expect(refereesOf({ ...organizer([]), referees: 'nonsense' })).toEqual([])
  })

  it('checks a name and an address as typed', () => {
    expect(readRefereeName('  Ann   Whistle ')).toBe('Ann Whistle')
    expect(() => readRefereeName('   ')).toThrow(HttpError)
    expect(readRefereeEmail(' Ann@Example.com ')).toBe('ann@example.com')
    expect(readRefereeEmail('')).toBeUndefined()
    expect(readRefereeEmail(null)).toBeUndefined()
    expect(() => readRefereeEmail('not an address')).toThrow(HttpError)
  })
})

describe('appointments', () => {
  const known = [ann, bob]

  it('takes every position, and reads an empty one as nobody', () => {
    expect(readAppointments({ main: 'r-ann', assistant1: '', assistant2: null }, known)).toEqual({
      main: 'r-ann',
    })
  })

  it("refuses an id that is not on the competition's own list", () => {
    // Another organiser's referee, or a made-up id: the list checked is the
    // season's organiser's, so neither can be appointed here.
    expect(() => readAppointments({ main: 'r-elsewhere' }, known)).toThrow(HttpError)
    expect(() => readAppointments({ main: 7 }, known)).toThrow(HttpError)
  })

  it('refuses one person in two positions of the same match', () => {
    expect(() => readAppointments({ main: 'r-ann', assistant2: 'r-ann' }, known)).toThrow(HttpError)
  })

  it('reads what a fixture holds, dropping anything malformed', () => {
    expect(appointmentsOf({ referees: { main: 'r-ann', assistant1: 5, other: 'x' } })).toEqual({
      main: 'r-ann',
    })
    expect(appointmentsOf({})).toEqual({})
    expect(positionOf({ referees: { assistant2: 'r-bob' } }, 'r-bob')).toBe('assistant2')
    expect(positionOf({ referees: { assistant2: 'r-bob' } }, 'r-ann')).toBeNull()
  })
})

describe('who may write a fixture', () => {
  const match = { id: 'm1', referees: { main: 'r-bob', assistant1: 'r-ann' } }

  it('is the account linked to a record appointed to it, in any position', () => {
    expect(appointmentOf(organizer([ann, bob]), match, 'u-ann')).toEqual({
      referee: ann,
      position: 'assistant1',
    })
  })

  it('is nobody whose record is not appointed', () => {
    expect(appointmentOf(organizer([ann, bob]), { id: 'm2' }, 'u-ann')).toBeNull()
  })

  it('is nobody for a record nobody has taken up', () => {
    // Bob is appointed but has no account: no account id can reach his match.
    expect(appointmentOf(organizer([ann, bob]), { referees: { main: 'r-bob' } }, 'u-bob')).toBeNull()
  })

  it("is decided by the season's organiser and not by the id alone", () => {
    // The same record id appointed on a fixture of an organiser whose list
    // does not hold it - a `matches` array written whole can carry any id.
    expect(appointmentOf(organizer([bob]), match, 'u-ann')).toBeNull()
  })

  it('stops the moment the record is taken off the list', () => {
    expect(appointmentOf(organizer([bob]), { referees: { main: 'r-ann' } }, 'u-ann')).toBeNull()
  })
})

describe('whose score it is', () => {
  it("is the referee's while nobody has set one", () => {
    expect(scoreIsReferees({})).toBe(true)
    expect(scoreIsReferees({ homeGoals: null, awayGoals: null })).toBe(true)
  })

  it("is the referee's while the mark says they set it", () => {
    expect(scoreIsReferees({ homeGoals: 2, awayGoals: 1, scoreEnteredBy: 'referee' })).toBe(true)
  })

  it("is the organiser's for every score without the mark, which is every score before it", () => {
    expect(scoreIsReferees({ homeGoals: 2, awayGoals: 1 })).toBe(false)
    expect(scoreIsReferees({ homeGoals: 0, awayGoals: 0 })).toBe(false)
  })
})

describe('what the public reads', () => {
  const index = refereeNameIndex([organizer([ann, bob])])

  it('is names, and never the ids that key the list holding addresses', () => {
    const season = withRefereeNames(
      {
        id: 't',
        organizerId: 'org-1',
        matches: [{ id: 'm1', referees: { main: 'r-ann', assistant1: 'r-gone' } }],
      },
      index.get('org-1')!,
    )
    const match = (season.matches as Array<Record<string, unknown>>)[0]!
    expect(match.referees).toBeUndefined()
    expect(match.refereeNames).toEqual({ main: 'Ann Whistle' })
    expect(JSON.stringify(season)).not.toContain('r-ann')
    expect(JSON.stringify(season)).not.toContain('ann@example.com')
  })

  it('names the referees of a hand-built playoff round too', () => {
    const season = withRefereeNames(
      {
        id: 't',
        matches: [],
        format: {
          customPlayoffConfig: {
            playoffRounds: [{ name: 'Final', matches: [{ id: 'f', referees: { main: 'r-bob' } }] }],
          },
        },
      },
      index.get('org-1')!,
    )
    const round = (season.format as any).customPlayoffConfig.playoffRounds[0]
    expect(round.matches[0]).toEqual({ id: 'f', refereeNames: { main: 'Bob Flag' } })
  })

  it('leaves a fixture with nobody appointed exactly as it was', () => {
    expect(publicRefereeNames({}, new Map())).toBeUndefined()
    const untouched = { id: 'm', homeGoals: 1 }
    const season = withRefereeNames({ matches: [untouched] }, new Map())
    expect((season.matches as unknown[])[0]).toBe(untouched)
  })
})

describe('a booking', () => {
  it('needs a side, a colour, a minute and a player', () => {
    expect(readCard({ team: 'home', type: 'red', minute: 12, playerId: 'p1' })).toEqual({
      team: 'home',
      type: 'red',
      minute: 12,
      playerId: 'p1',
    })
    expect(() => readCard({ team: 'home', type: 'red', playerId: 'p1' })).toThrow(HttpError)
    expect(() => readCard({ team: 'home', type: 'green', minute: 3, playerId: 'p1' })).toThrow(HttpError)
    expect(() => readCard({ team: 'both', type: 'red', minute: 3, playerId: 'p1' })).toThrow(HttpError)
    expect(() => readCard({ team: 'home', type: 'red', minute: 3 })).toThrow(HttpError)
    expect(() => readCard({ team: 'home', type: 'red', minute: 0, playerId: 'p1' })).toThrow(HttpError)
  })

  it('records who entered it', () => {
    const fields = readCard({ team: 'away', type: 'blue', minute: '40', playerId: 'p2' })
    expect(composeCard('c1', fields, 'referee').enteredBy).toBe('referee')
  })

  it('reads a stored list defensively', () => {
    expect(cardsOf({ cards: [{ id: 'c1' }, null, 'x', { id: 2 }] })).toEqual([{ id: 'c1' }])
    expect(cardsOf({ cards: 'x' })).toEqual([])
  })
})

describe('the referee invitation', () => {
  it('opens only its own door', () => {
    const invite = { kind: 'referee' }
    expect(isInviteKind(invite, 'referee')).toBe(true)
    expect(isInviteKind(invite, 'team')).toBe(false)
    expect(isInviteKind(invite, 'organizer')).toBe(false)
    // An old club invitation carries no kind and must never read as a referee's.
    expect(isInviteKind({}, 'referee')).toBe(false)
  })
})

describe('a season written whole', () => {
  const stored = {
    matches: [
      { id: 'm1', homeGoals: 2, awayGoals: 1, scoreEnteredBy: 'referee', referees: { main: 'r-bob' } },
      { id: 'm2' },
    ],
    format: {
      customPlayoffConfig: {
        playoffRounds: [{ matches: [{ id: 'f1', referees: { main: 'r-ann' } }] }],
      },
    },
  }

  it('keeps the appointments that are stored, whatever a stale tab sends', () => {
    // Tab A loaded the season when Ann held m1; Bob has been appointed since.
    const body = keepAppointments(
      { matches: [{ id: 'm1', homeGoals: 2, awayGoals: 1, referees: { main: 'r-ann' } }, { id: 'm2' }] },
      stored,
    )
    const [m1] = body.matches as Array<Record<string, unknown>>
    expect(m1!.referees).toEqual({ main: 'r-bob' })
    expect(m1!.scoreEnteredBy).toBe('referee')
  })

  it('takes the mark off a result the whole-season write changed', () => {
    const body = keepAppointments({ matches: [{ id: 'm1', homeGoals: 3, awayGoals: 1 }] }, stored)
    expect((body.matches as Array<Record<string, unknown>>)[0]!.scoreEnteredBy).toBeUndefined()
  })

  it('appoints nobody on a fixture that is not stored, and on a new season', () => {
    const body = keepAppointments(
      { matches: [{ id: 'new', referees: { main: 'r-ann' }, scoreEnteredBy: 'referee' }] },
      {},
    )
    expect((body.matches as unknown[])[0]).toEqual({ id: 'new' })
  })

  it('does the same inside a hand-built playoff round', () => {
    const body = keepAppointments(
      {
        format: {
          customPlayoffConfig: { playoffRounds: [{ matches: [{ id: 'f1', referees: { main: 'r-x' } }] }] },
        },
      },
      stored,
    )
    const round = (body.format as any).customPlayoffConfig.playoffRounds[0]
    expect(round.matches[0].referees).toEqual({ main: 'r-ann' })
  })
})
