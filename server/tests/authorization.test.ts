import { describe, expect, it } from 'vitest'
import {
  assertCanAccessOrganizer,
  assertIsOrganizer,
  assertManagesTeam,
  assertSuperAdmin,
  extractBearerToken,
  isSuperAdmin,
} from '../src/lib/auth.js'
import { toPublicUser, type AuthUser } from '../src/lib/types.js'
import { buildUpdate } from '../src/lib/ddb.js'
import { corsHeaders, parseJsonBody, HttpError } from '../src/lib/http.js'
import { organiserMayDecide, toClubTournament, toDirectoryClub } from '../src/routes/clubs.js'
import { toPoolTeam, toVisitingTeam } from '../src/routes/admin.js'
import { isInClubPool } from '../src/lib/pool.js'
import type { Team } from '../src/lib/types.js'

const organizerUser: AuthUser = {
  id: 'u-1',
  email: 'org@example.com',
  role: 'organizer',
  organizerId: 'org-1',
  passwordHash: 'x'.repeat(128),
  salt: 'salt',
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
}

const superAdmin: AuthUser = { ...organizerUser, id: 'u-0', role: 'super_admin', organizerId: undefined }

/** A coach: no organizer at all, and one club to their name. */
const manager: AuthUser = {
  ...organizerUser,
  id: 'u-9',
  email: 'coach@example.com',
  role: 'team_manager',
  organizerId: undefined,
  teamIds: ['team-mine'],
}

const myClub = { id: 'team-mine', organizerId: 'org-1', managerUserIds: ['u-9'] }
const otherClub = { id: 'team-theirs', organizerId: 'org-2', managerUserIds: ['u-8'] }
const unclaimedClub = { id: 'team-new', organizerId: 'org-1' }

describe('bearer tokens', () => {
  it('reads a token out of the header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123')
    expect(extractBearerToken('bearer abc123')).toBe('abc123')
  })

  it('ignores anything that is not a bearer header', () => {
    expect(extractBearerToken(undefined)).toBeNull()
    expect(extractBearerToken('')).toBeNull()
    expect(extractBearerToken('Basic abc123')).toBeNull()
    expect(extractBearerToken('abc123')).toBeNull()
  })
})

describe('organizer isolation', () => {
  it('lets an organizer reach their own data', () => {
    expect(() => assertCanAccessOrganizer(organizerUser, 'org-1')).not.toThrow()
  })

  it("refuses another organizer's data", () => {
    try {
      assertCanAccessOrganizer(organizerUser, 'org-2')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as HttpError).status).toBe(403)
    }
  })

  it('refuses when no organizer is named at all', () => {
    expect(() => assertCanAccessOrganizer(organizerUser, undefined)).toThrow(HttpError)
    expect(() => assertCanAccessOrganizer(organizerUser, '')).toThrow(HttpError)
  })

  it('lets the super admin reach everything', () => {
    expect(isSuperAdmin(superAdmin)).toBe(true)
    expect(() => assertCanAccessOrganizer(superAdmin, 'org-2')).not.toThrow()
    expect(() => assertSuperAdmin(superAdmin)).not.toThrow()
  })

  it('keeps an organizer out of super admin routes', () => {
    expect(() => assertSuperAdmin(organizerUser)).toThrow(HttpError)
  })
})

describe('who runs a club', () => {
  it('lets a manager touch the club they were invited to', () => {
    expect(() => assertManagesTeam(manager, myClub)).not.toThrow()
  })

  it("keeps a manager out of somebody else's club", () => {
    expect(() => assertManagesTeam(manager, otherClub)).toThrow(HttpError)
  })

  it('keeps a manager out of a club nobody has claimed, even in the same competition', () => {
    expect(() => assertManagesTeam(manager, unclaimedClub)).toThrow(HttpError)
  })

  it('lets the organizer run a club nobody has claimed', () => {
    expect(() => assertManagesTeam(organizerUser, unclaimedClub)).not.toThrow()
  })

  it('keeps the organizer out of a club that has a manager', () => {
    // The club record decides this, not the competition it plays in: an
    // invitation that hands the coach the squad and the crest is not kept if
    // the organizer can still write both. What the organizer keeps is the
    // entry and the teamsheet, which `assertCanAccessOrganizer` guards.
    expect(() => assertManagesTeam(organizerUser, myClub)).toThrow(HttpError)
  })

  it('lets an organizer who runs the club themselves back in', () => {
    const mine = { ...unclaimedClub, managerUserIds: [organizerUser.id] }
    expect(() => assertManagesTeam(organizerUser, mine)).not.toThrow()
  })

  it('reads an empty manager list as a club nobody runs', () => {
    expect(() =>
      assertManagesTeam(organizerUser, { ...unclaimedClub, managerUserIds: [] }),
    ).not.toThrow()
  })

  it('counts a manager whose account has gone as a manager', () => {
    // The id is the whole record of the link, so a club whose only manager was
    // deleted would otherwise be editable by nobody: the manager cannot sign in
    // and the organizer is refused. Deleting an account unlinks its clubs for
    // that reason, and the organizer's club screen can take a leftover id off
    // by hand — but the rule here stays "an id means a manager".
    expect(() =>
      assertManagesTeam(organizerUser, { ...unclaimedClub, managerUserIds: ['u-gone'] }),
    ).toThrow(HttpError)
  })

  it("keeps an organizer out of another organizer's club", () => {
    expect(() => assertManagesTeam(organizerUser, otherClub)).toThrow(HttpError)
  })

  it('lets the super admin reach any club', () => {
    expect(() => assertManagesTeam(superAdmin, otherClub)).not.toThrow()
  })

  it('does not treat a missing organizer id as a match', () => {
    // Both sides undefined must not read as "same organizer" — the mistake the
    // hand-rolled comparisons in the club routes used to make.
    expect(() => assertManagesTeam(manager, { id: 'team-orphan' })).toThrow(HttpError)
  })
})

describe('user serialization', () => {
  it('never lets the hash or salt out', () => {
    const publicUser = toPublicUser(organizerUser) as Record<string, unknown>
    expect(publicUser.passwordHash).toBeUndefined()
    expect(publicUser.salt).toBeUndefined()
    expect(publicUser.id).toBe('u-1')
    expect(JSON.stringify(publicUser)).not.toContain('xxxx')
  })
})

describe('update expressions', () => {
  it('aliases every attribute name, including DynamoDB reserved words', () => {
    const update = buildUpdate({ name: 'Cup', location: { name: 'Field 1' }, status: 'live' })
    expect(update?.UpdateExpression).toBe('SET #u0 = :u0, #u1 = :u1, #u2 = :u2')
    expect(Object.values(update!.ExpressionAttributeNames)).toEqual(['name', 'location', 'status'])
  })

  it('refuses to overwrite immutable fields', () => {
    const update = buildUpdate({ id: 'hacked', organizerId: 'org-2', name: 'Cup' }, [
      'id',
      'organizerId',
    ])
    expect(Object.values(update!.ExpressionAttributeNames)).toEqual(['name'])
  })

  it('returns null when there is nothing to change', () => {
    expect(buildUpdate({ id: 'x' })).toBeNull()
    expect(buildUpdate({ name: undefined })).toBeNull()
  })
})

describe('CORS', () => {
  it('echoes an allowed origin', () => {
    expect(corsHeaders('https://myfootballtournament.com')['access-control-allow-origin']).toBe(
      'https://myfootballtournament.com',
    )
  })

  it('allows every method the router registers, PUT included', () => {
    // The squad route is a PUT, and a method missing here fails the browser's
    // preflight rather than the request itself — which looks like the feature
    // silently not working.
    const methods = corsHeaders('https://myfootballtournament.com')['access-control-allow-methods']
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(methods).toContain(method)
    }
  })

  it('sends no CORS headers to an unknown origin', () => {
    expect(corsHeaders('https://evil.example')).toEqual({})
    expect(corsHeaders(undefined)).toEqual({})
  })
})

describe('request bodies', () => {
  it('parses a JSON object', () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonBody(undefined)).toEqual({})
  })

  it('rejects JSON that is not an object', () => {
    expect(() => parseJsonBody('[1,2]')).toThrow(HttpError)
    expect(() => parseJsonBody('"text"')).toThrow(HttpError)
    expect(() => parseJsonBody('not json')).toThrow(HttpError)
  })

  it('decodes a base64 body', () => {
    expect(parseJsonBody(Buffer.from('{"a":2}').toString('base64'), true)).toEqual({ a: 2 })
  })
})

describe('a competition as a visiting club sees it', () => {
  const tournament = {
    id: 't-1',
    organizerId: 'org-2',
    teamIds: ['team-mine', 'team-a', 'team-b'],
    visibility: 'private',
    squads: { 'team-mine': ['p-1'], 'team-a': ['p-9'] },
    matches: [
      {
        id: 'm-1',
        homeTeamId: 'team-mine',
        awayTeamId: 'team-a',
        homeGoals: 2,
        awayGoals: 1,
        goals: [{ id: 'g-1', team: 'home', playerId: 'p-1', minute: 12, type: 'goal' }],
      },
      {
        id: 'm-2',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        dateISO: '2026-03-01T10:00:00.000Z',
        homeGoals: 0,
        awayGoals: 3,
        referee: 'A. Referee',
        goals: [{ id: 'g-2', team: 'away', playerId: 'p-9', minute: 4, type: 'goal' }],
        statistics: { home: { corners: 1 }, away: { corners: 7 } },
      },
    ],
  }

  const seen = toClubTournament(tournament, ['team-mine'])

  it('keeps the club\'s own match whole', () => {
    expect(seen.matches[0]).toEqual(tournament.matches[0])
  })

  it('reduces everybody else\'s match to the score', () => {
    expect(seen.matches[1]).toEqual({
      id: 'm-2',
      homeTeamId: 'team-a',
      awayTeamId: 'team-b',
      dateISO: '2026-03-01T10:00:00.000Z',
      homeGoals: 0,
      awayGoals: 3,
    })
  })

  it('leaves the table computable', () => {
    expect(seen.matches).toHaveLength(tournament.matches.length)
    expect(seen.teamIds).toEqual(tournament.teamIds)
  })

  it("does not carry another club's registered squad", () => {
    expect(seen.squads).toEqual({ 'team-mine': ['p-1'] })
  })
})

describe('a hand-built playoff, as a visiting club sees it', () => {
  const tournament = {
    id: 't-2',
    organizerId: 'org-2',
    teamIds: ['team-mine', 'team-a', 'team-b'],
    matches: [],
    // Not a real field. Records here are schemaless, and this stands in for the
    // one somebody adds next: it must not travel by default.
    internalNotes: 'do not show this to the clubs',
    format: {
      rounds: 1,
      mode: 'league_custom_playoff',
      customPlayoffConfig: {
        playoffTeams: 4,
        enableBye: true,
        preset: 'progressive_elimination',
        playoffRounds: [
          {
            roundNumber: 1,
            name: 'Week 1',
            quantityOfGames: 2,
            matches: [
              { id: 'p-1', homeTeamId: 'team-mine', awayTeamId: 'team-a', notes: 'ours' },
              { id: 'p-2', homeTeamId: 'team-a', awayTeamId: 'team-b', notes: 'theirs' },
            ],
          },
        ],
      },
    },
  }

  const seen = toClubTournament(tournament, ['team-mine'])
  const round = seen.format.customPlayoffConfig.playoffRounds[0]

  it('summarises a playoff match the club is not in', () => {
    expect(round.matches[1].notes).toBeUndefined()
    expect(round.matches[1].homeTeamId).toBe('team-a')
  })

  it("leaves the club's own playoff match whole", () => {
    expect(round.matches[0].notes).toBe('ours')
  })

  it('keeps the preset the format depends on', () => {
    expect(seen.format.customPlayoffConfig.preset).toBe('progressive_elimination')
  })

  it('does not carry a field it was never taught about', () => {
    expect(seen.internalNotes).toBeUndefined()
  })

  it('survives a hole in the fixture list', () => {
    const holed = toClubTournament({ ...tournament, matches: [null, undefined] }, ['team-mine'])
    expect(holed.matches).toHaveLength(2)
  })
})

describe('a round the organiser is holding back, as a visiting club sees it', () => {
  const tournament = {
    id: 't-3',
    organizerId: 'org-2',
    teamIds: ['team-mine', 'team-a', 'team-b'],
    matches: [],
    hiddenRounds: [3],
  }

  const upcoming = (extra: Record<string, unknown>) => ({
    id: 'm-x',
    dateISO: '2026-04-01T10:00:00.000Z',
    round: 3,
    ...extra,
  })

  // This route answers any club with an entry in the competition — an
  // application the organiser turned down included — so the pairings of a round
  // the public may not read must not be here either.
  it("redacts another club's fixture in a hidden round", () => {
    const seen = toClubTournament(
      { ...tournament, matches: [upcoming({ homeTeamId: 'team-a', awayTeamId: 'team-b' })] },
      ['team-mine'],
    )
    expect(seen.matches[0]).toEqual({ hidden: true, round: 3 })
  })

  // Deliberate: a club has to know when it plays and against whom, and a season
  // where it cannot see its own next game is one nobody can name a teamsheet for.
  it("still shows the club its own fixture in that round", () => {
    const mine = upcoming({ homeTeamId: 'team-mine', awayTeamId: 'team-a' })
    const seen = toClubTournament({ ...tournament, matches: [mine] }, ['team-mine'])
    expect(seen.matches[0]).toEqual(mine)
  })

  it('leaves a played fixture in that round readable, so the table still adds up', () => {
    const played = upcoming({
      homeTeamId: 'team-a',
      awayTeamId: 'team-b',
      homeGoals: 1,
      awayGoals: 1,
    })
    const seen = toClubTournament({ ...tournament, matches: [played] }, ['team-mine'])
    expect(seen.matches[0]).toEqual(played)
  })

  it('redacts a hidden hand-built round the same way', () => {
    const seen = toClubTournament(
      {
        ...tournament,
        format: {
          mode: 'league_custom_playoff',
          customPlayoffConfig: {
            playoffRounds: [
              {
                roundNumber: 2,
                name: 'Week 2',
                hidden: true,
                matches: [{ id: 'p-9', homeTeamId: 'team-a', awayTeamId: 'team-b' }],
              },
            ],
          },
        },
      },
      ['team-mine'],
    )
    expect(seen.format.customPlayoffConfig.playoffRounds[0].matches[0]).toEqual({ hidden: true })
  })

  // Legacy, written by nothing and read by no screen, and it names the pairings
  // the fixtures above have just had taken off them.
  it('does not send a playoff bracket at all', () => {
    const seen = toClubTournament(
      {
        ...tournament,
        playoffBrackets: [
          { round: 1, matches: [{ matchId: 'b-1', homeTeamId: 'team-a', awayTeamId: 'team-b' }] },
        ],
      },
      ['team-mine'],
    )
    expect(seen.playoffBrackets).toBeUndefined()
  })
})

describe('who may read the club directory', () => {
  it('lets an organizer and the super admin in', () => {
    expect(() => assertIsOrganizer(organizerUser)).not.toThrow()
    expect(() => assertIsOrganizer(superAdmin)).not.toThrow()
  })

  it('keeps a club manager out', () => {
    // It names other people's clubs and the people who run them. A coach has no
    // organizerId either, so an inline comparison would have let them through.
    expect(() => assertIsOrganizer(manager)).toThrow(HttpError)
  })

  it('refuses an organizer with no organizer id', () => {
    expect(() => assertIsOrganizer({ ...organizerUser, organizerId: undefined })).toThrow(HttpError)
  })
})

describe('a club as a stranger sees it', () => {
  const listed = {
    id: 'team-listed',
    name: 'Sporting Sydney',
    organizerId: 'org-2',
    colors: ['#ff0000'],
    logo: 'https://example.com/crest.png',
    crestColor: '#ff0000',
    managerUserIds: ['u-8'],
    managerLinkedAt: { 'u-8': '2026-01-01T00:00:00.000Z' },
    players: [{ id: 'p-1', dateOfBirth: '1999-01-01' }, null, { id: 'p-2' }],
    discoverable: true,
    secretFieldInventedLater: 'nope',
  } as unknown as Team

  const managerNames = new Map([['u-8', 'Ana Petrova']])
  const leagueNames = new Map([['org-2', 'Homebush Futsal']])

  it('names the person who runs the club', () => {
    const card = toDirectoryClub(listed, managerNames, leagueNames)
    expect(card.ownerName).toBe('Ana Petrova')
    expect(card.ownerKind).toBe('manager')
  })

  it('falls back to the league for a club nobody has taken on', () => {
    const unclaimed = { ...listed, managerUserIds: [] } as unknown as Team
    const card = toDirectoryClub(unclaimed, managerNames, leagueNames)
    expect(card.ownerName).toBe('Homebush Futsal')
    expect(card.ownerKind).toBe('organizer')
  })

  it('sends a whitelist and not the record', () => {
    const card = toDirectoryClub(listed, managerNames, leagueNames) as Record<string, unknown>
    // No account ids, no squad, and nothing a PATCH writes onto a club later.
    expect(card.managerUserIds).toBeUndefined()
    expect(card.players).toBeUndefined()
    expect(card.secretFieldInventedLater).toBeUndefined()
    // A hole in the squad is not a player.
    expect(card.squadSize).toBe(2)
  })
})

describe("another organiser's club, playing here", () => {
  const guest = {
    id: 'team-guest',
    name: 'Aspire FC',
    organizerId: 'org-2',
    managerUserIds: ['u-8'],
    managerLinkedAt: { 'u-8': '2026-01-01T00:00:00.000Z' },
    players: [
      { id: 'p-1', firstName: 'Ana', dateOfBirth: '1999-01-01' },
      null,
    ],
  } as unknown as Team

  it('keeps the squad, so a teamsheet can be named', () => {
    const visiting = toVisitingTeam(guest) as Record<string, unknown>
    const players = visiting.players as Array<Record<string, unknown>>
    expect(players).toHaveLength(1)
    expect(players[0]!.firstName).toBe('Ana')
  })

  it('drops what belongs to the club and not to the competition', () => {
    const visiting = toVisitingTeam(guest) as Record<string, unknown>
    const players = visiting.players as Array<Record<string, unknown>>
    expect(visiting.managerUserIds).toBeUndefined()
    expect(visiting.managerLinkedAt).toBeUndefined()
    expect(players[0]!.dateOfBirth).toBeUndefined()
    expect(visiting.visiting).toBe(true)
  })
})

describe('answering an entry', () => {
  it("will not let an organiser accept their own invitation", () => {
    // Otherwise asking the club is a formality: the organiser writes the
    // invitation and accepts it in the next request.
    expect(organiserMayDecide('invited', 'accepted')).toBe(false)
  })

  it('lets them withdraw one', () => {
    expect(organiserMayDecide('invited', 'declined')).toBe(true)
  })

  it('will not let them overrule a club that refused, by any route', () => {
    // `refused` exists as its own status because `declined` is a decision of
    // the organiser's own that they may reverse. Turning a refusal into one of
    // those is the laundering step, so it is refused as well — the first
    // version of this allowed `refused -> declined` and the accept came free.
    expect(organiserMayDecide('refused', 'accepted')).toBe(false)
    expect(organiserMayDecide('refused', 'declined')).toBe(false)
  })

  it('will not let them re-grant an invitation they took back', () => {
    expect(organiserMayDecide('withdrawn', 'accepted')).toBe(false)
    expect(organiserMayDecide('withdrawn', 'declined')).toBe(false)
  })

  it('lets them reverse their own refusal of an application', () => {
    expect(organiserMayDecide('declined', 'accepted')).toBe(true)
  })

  it('lets them drop a club they had accepted, but not re-accept one', () => {
    expect(organiserMayDecide('accepted', 'declined')).toBe(true)
    expect(organiserMayDecide('accepted', 'accepted')).toBe(false)
  })

  it('leaves an application alone', () => {
    expect(organiserMayDecide('pending', 'accepted')).toBe(true)
    expect(organiserMayDecide('pending', 'declined')).toBe(true)
  })
})

describe('the club pool', () => {
  it('carries a club that has a manager and has not hidden itself', () => {
    expect(isInClubPool({ managerUserIds: ['u-9'] })).toBe(true)
    expect(isInClubPool({ managerUserIds: ['u-9'], hiddenFromPool: false })).toBe(true)
    // The opt-in this replaced is stored on records whose managers never chose
    // it, either way round, and nothing reads it any more — it is not even a
    // field the check accepts.
    expect(isInClubPool({ managerUserIds: ['u-9'], ...{ discoverable: false } })).toBe(true)
  })

  it('leaves out a club nobody has taken on', () => {
    // There is nobody to answer the invitation, and the league that owns the
    // record has not offered it to anybody.
    expect(isInClubPool({})).toBe(false)
    expect(isInClubPool({ managerUserIds: [] })).toBe(false)
    expect(isInClubPool({ managerUserIds: [] })).toBe(false)
  })

  it('leaves out a club that has hidden itself', () => {
    expect(isInClubPool({ managerUserIds: ['u-9'], hiddenFromPool: true })).toBe(false)
  })
})

describe('a club taken off the pool', () => {
  const club = {
    id: 'team-theirs',
    name: 'Sydney United',
    organizerId: 'org-2',
    colors: ['#123456'],
    managerUserIds: ['u-8'],
    players: [
      { id: 'p-1', firstName: 'A', lastName: 'B', dateOfBirth: '1999-01-01', isPublic: true },
    ],
  } as unknown as Team

  it('arrives without its squad', () => {
    const out = toPoolTeam(club)
    expect(out.players).toEqual([])
    expect(out.poolOnly).toBe(true)
    // Nothing offers to edit it: the API refuses those writes either way.
    expect(out.visiting).toBe(true)
    expect(out.name).toBe('Sydney United')
  })

  it('carries no date of birth and no list of accounts', () => {
    const out = toPoolTeam(club) as unknown as Record<string, unknown>
    expect(out.managerUserIds).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain('1999-01-01')
  })
})
