import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import type { AuthUser, Tournament } from '../src/lib/types.js'

/**
 * End-to-end tests for the request pipeline with the database mocked out.
 *
 * These are the checks that matter most after the rewrite: that a private
 * tournament never leaves the server, that a write without a token is refused,
 * and that one organizer cannot edit another's data. All three were impossible
 * to enforce in the old design, where the browser held write credentials.
 */

const publicTournament = {
  id: 't-public',
  name: 'Autumn Cup',
  organizerId: 'org-1',
  createdAtISO: '2026-01-01T00:00:00.000Z',
  teamIds: ['team-1'],
  matches: [],
  visibility: 'public',
} satisfies Tournament

const privateTournament = {
  ...publicTournament,
  id: 't-private',
  name: 'Secret Trials',
  visibility: 'private',
} satisfies Tournament

const organizerUser: AuthUser = {
  id: 'u-1',
  email: 'org1@example.com',
  role: 'organizer',
  organizerId: 'org-1',
  passwordHash: 'x'.repeat(128),
  salt: 'salt',
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
}

const otherTeam = { id: 'team-other', name: 'Rivals', organizerId: 'org-2' }

/**
 * A club as the public route finds it: someone with a date of birth, someone
 * marked private, and a hole in the list of the kind the browser-side era left
 * behind. The projection has to survive all three.
 */
const bornInJanuary = `${new Date().getUTCFullYear() - 25}-01-01`

const publicTeam = {
  id: 'team-public',
  name: 'Public FC',
  organizerId: 'org-1',
  managerUserIds: ['u-9'],
  managerLinkedAt: { 'u-9': '2026-01-01T00:00:00.000Z' },
  players: [
    { id: 'p-open', firstName: 'Open', lastName: 'Player', dateOfBirth: bornInJanuary },
    { id: 'p-hidden', firstName: 'Hidden', lastName: 'Player', isPublic: false },
    null,
  ],
}

/** The same club, with the age switched off. */
const shyTeam = { ...publicTeam, id: 'team-shy', hidePlayerAges: true }

const ownTeam = {
  id: 'team-own',
  name: 'FC Volna',
  organizerId: 'org-1',
  players: [
    { id: 'p-1', firstName: 'Vasily', lastName: 'Esipov' },
    { id: 'p-2', firstName: 'Other', lastName: 'Player' },
  ],
}

vi.mock('../src/repos.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repos.js')>()
  return {
    ...actual,
    organizers: { list: vi.fn(async () => []) },
    teams: {
      get: vi.fn(async (id: string) =>
        id === 'team-other'
          ? otherTeam
          : id === 'team-own'
            ? ownTeam
            : id === 'team-public'
              ? publicTeam
              : id === 'team-shy'
                ? shyTeam
                : null,
      ),
      getOrThrow: vi.fn(async (id: string) => {
        if (id === 'team-other') return otherTeam
        if (id === 'team-own') return ownTeam
        throw new (await import('../src/lib/http.js')).HttpError(404, 'Team not found')
      }),
      update: vi.fn(async () => undefined),
      listByOrganizer: vi.fn(async () => []),
      listAll: vi.fn(async () => []),
      getMany: vi.fn(async () => []),
      addPlayer: vi.fn(async (_teamId: string, player: Record<string, unknown>) => ({
        ...player,
        id: 'p-new',
      })),
      updatePlayer: vi.fn(async (_teamId: string, playerId: string, updates: object) => ({
        id: playerId,
        ...updates,
      })),
      removePlayer: vi.fn(async () => undefined),
    },
    tournaments: {
      listAll: vi.fn(async () => [publicTournament, privateTournament]),
      listPublicSummaries: actual.tournaments.listPublicSummaries,
      get: vi.fn(async (id: string) =>
        id === 't-public' ? publicTournament : id === 't-private' ? privateTournament : null,
      ),
      listByOrganizer: vi.fn(async () => [publicTournament, privateTournament]),
    },
  }
})

vi.mock('../src/lib/sessions.js', () => ({
  findSessionByToken: vi.fn(async (token: string) =>
    token === 'good-token'
      ? {
          id: 's-1',
          userId: 'u-1',
          token,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          createdAt: new Date().toISOString(),
        }
      : null,
  ),
  getUserById: vi.fn(async () => organizerUser),
  createSession: vi.fn(),
  deleteAllUserSessions: vi.fn(),
  deleteSessionByToken: vi.fn(),
  deleteSessionById: vi.fn(),
  isExpired: () => false,
}))

const { handler } = await import('../src/handler.js')
const repos = await import('../src/repos.js')

function request(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; origin?: string } = {},
) {
  const headers: Record<string, string> = {
    origin: options.origin ?? 'https://myfootballtournament.com',
  }
  if (options.token) headers.authorization = `Bearer ${options.token}`

  return handler({
    rawPath: path,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    isBase64Encoded: false,
    queryStringParameters: {},
    requestContext: { http: { method, sourceIp: '198.51.100.7' } },
  } as unknown as APIGatewayProxyEventV2) as Promise<{
    statusCode: number
    headers: Record<string, string>
    body: string
  }>
}

const parse = (body: string) => JSON.parse(body)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('public routes', () => {
  it('lists only public tournaments', async () => {
    const response = await request('GET', '/public/tournaments')
    const body = parse(response.body) as { id: string }[]

    expect(response.statusCode).toBe(200)
    expect(body.map((t) => t.id)).toEqual(['t-public'])
  })

  it('refuses to serve a private tournament by direct id', async () => {
    const response = await request('GET', '/public/tournaments/t-private')
    expect(response.statusCode).toBe(404)
  })

  it('treats /public/tournaments/full as its own route, not as an id', async () => {
    // Route order matters: registered after ':id' this would 404 as a lookup
    // for a tournament literally called "full".
    const response = await request('GET', '/public/tournaments/full')
    const body = parse(response.body) as { id: string }[]

    expect(response.statusCode).toBe(200)
    expect(body.map((t) => t.id)).toEqual(['t-public'])
  })

  it('serves a public tournament by id', async () => {
    const response = await request('GET', '/public/tournaments/t-public')
    expect(response.statusCode).toBe(200)
    expect(parse(response.body).name).toBe('Autumn Cup')
  })

  it('filters private tournaments out of an organizer listing', async () => {
    const response = await request('GET', '/public/organizers/org-1/tournaments')
    const body = parse(response.body) as { id: string }[]
    expect(body.map((t) => t.id)).toEqual(['t-public'])
  })

  it('allows caching of public reads but not of anything else', async () => {
    const publicResponse = await request('GET', '/public/tournaments')
    expect(publicResponse.headers['cache-control']).toContain('public')

    const adminResponse = await request('GET', '/admin/tournaments', { token: 'good-token' })
    expect(adminResponse.headers['cache-control']).toBe('no-store')
  })
})

describe('authentication', () => {
  it('refuses an admin write with no token', async () => {
    const response = await request('PATCH', '/admin/teams/team-other', { body: { name: 'x' } })
    expect(response.statusCode).toBe(401)
    expect(repos.teams.update).not.toHaveBeenCalled()
  })

  it('refuses an admin write with an unknown token', async () => {
    const response = await request('PATCH', '/admin/teams/team-other', {
      token: 'forged-token',
      body: { name: 'x' },
    })
    expect(response.statusCode).toBe(401)
    expect(repos.teams.update).not.toHaveBeenCalled()
  })
})

describe('authorization', () => {
  it("refuses to edit another organizer's team", async () => {
    const response = await request('PATCH', '/admin/teams/team-other', {
      token: 'good-token',
      body: { name: 'Renamed by someone else' },
    })

    expect(response.statusCode).toBe(403)
    expect(repos.teams.update).not.toHaveBeenCalled()
  })

  it("refuses to edit a player on another organizer's team", async () => {
    const response = await request('PATCH', '/admin/teams/team-other/players/p-1', {
      token: 'good-token',
      body: { lastName: 'Hijacked' },
    })

    expect(response.statusCode).toBe(403)
    expect(repos.teams.updatePlayer).not.toHaveBeenCalled()
  })

  it('refuses super-admin-only routes to an organizer', async () => {
    const response = await request('POST', '/admin/organizers', {
      token: 'good-token',
      body: { name: 'New org', email: 'new@example.com' },
    })
    expect(response.statusCode).toBe(403)
  })

  // Deleting an organizer now takes its competitions and its logins with it, so
  // the check that keeps an organizer out has to hold before anything is read,
  // let alone written.
  it('refuses to delete an organizer, their own included, and reads nothing first', async () => {
    const response = await request('DELETE', '/admin/organizers/org-1', { token: 'good-token' })

    expect(response.statusCode).toBe(403)
    expect(repos.tournaments.listByOrganizer).not.toHaveBeenCalled()
    expect(repos.teams.listByOrganizer).not.toHaveBeenCalled()
  })

  it('refuses to tell an organizer what deleting one would cost', async () => {
    const response = await request('GET', '/admin/organizers/org-1/impact', {
      token: 'good-token',
    })
    expect(response.statusCode).toBe(403)
  })
})

describe('player editing', () => {
  it('saves only the fields that changed, not the whole squad', async () => {
    const response = await request('PATCH', '/admin/teams/team-own/players/p-1', {
      token: 'good-token',
      body: { lastName: 'Esipov' },
    })

    expect(response.statusCode).toBe(200)
    expect(repos.teams.updatePlayer).toHaveBeenCalledWith('team-own', 'p-1', {
      lastName: 'Esipov',
    })
    // The old path rewrote the team record — that is what lost concurrent edits.
    expect(repos.teams.update).not.toHaveBeenCalled()
  })

  it('will not let a client change a player id or creation date', async () => {
    await request('PATCH', '/admin/teams/team-own/players/p-1', {
      token: 'good-token',
      body: { id: 'p-2', createdAtISO: '1999-01-01', number: 10 },
    })

    expect(repos.teams.updatePlayer).toHaveBeenCalledWith('team-own', 'p-1', { number: 10 })
  })

  it('adds and removes a player on an own team', async () => {
    const added = await request('POST', '/admin/teams/team-own/players', {
      token: 'good-token',
      body: { firstName: 'New', lastName: 'Player' },
    })
    expect(added.statusCode).toBe(200)
    expect(parse(added.body).id).toBe('p-new')

    const removed = await request('DELETE', '/admin/teams/team-own/players/p-2', {
      token: 'good-token',
    })
    expect(removed.statusCode).toBe(200)
    expect(repos.teams.removePlayer).toHaveBeenCalledWith('team-own', 'p-2')
  })

  it('refuses a change to nothing at all', async () => {
    const response = await request('PATCH', '/admin/teams/team-own/players/p-1', {
      token: 'good-token',
      body: { somethingNobodyHasInvented: true },
    })

    expect(response.statusCode).toBe(400)
    expect(repos.teams.updatePlayer).not.toHaveBeenCalled()
  })

  // Absent means public, so a null — which clears the field — and a string
  // "false" both end up showing somebody who asked not to be shown.
  it('refuses anything but a boolean for isPublic', async () => {
    for (const value of [null, 'false', 0]) {
      const response = await request('PATCH', '/admin/teams/team-own/players/p-1', {
        token: 'good-token',
        body: { isPublic: value },
      })
      expect(response.statusCode).toBe(400)
    }
    expect(repos.teams.updatePlayer).not.toHaveBeenCalled()
  })

  it('refuses a height that is not a number and a foot that is not a foot', async () => {
    const height = await request('PATCH', '/admin/teams/team-own/players/p-1', {
      token: 'good-token',
      body: { heightCm: 'very tall' },
    })
    expect(height.statusCode).toBe(400)

    const foot = await request('PATCH', '/admin/teams/team-own/players/p-1', {
      token: 'good-token',
      body: { preferredFoot: 'either' },
    })
    expect(foot.statusCode).toBe(400)
  })

  it('creates a player without storing the nulls that mean "clear this"', async () => {
    await request('POST', '/admin/teams/team-own/players', {
      token: 'good-token',
      body: { firstName: 'New', lastName: 'Player', heightCm: null, preferredFoot: 'left' },
    })

    const [, created] = (repos.teams.addPlayer as unknown as { mock: { calls: any[][] } }).mock
      .calls[0]
    expect(created.preferredFoot).toBe('left')
    expect('heightCm' in created).toBe(false)
  })

  it('refuses player edits with no token', async () => {
    const response = await request('PATCH', '/admin/teams/team-own/players/p-1', {
      body: { lastName: 'Nope' },
    })
    expect(response.statusCode).toBe(401)
    expect(repos.teams.updatePlayer).not.toHaveBeenCalled()
  })
})

describe('CORS and errors', () => {
  it('answers a preflight without touching the database', async () => {
    const response = await request('OPTIONS', '/admin/teams/team-other')
    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://myfootballtournament.com',
    )
  })

  it('sends no CORS header to an origin that is not allow-listed', async () => {
    const response = await request('GET', '/public/tournaments', { origin: 'https://evil.example' })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('returns 404 for an unknown route', async () => {
    const response = await request('GET', '/nope')
    expect(response.statusCode).toBe(404)
  })

  it('rejects a malformed JSON body', async () => {
    const response = await handler({
      rawPath: '/public/teams/batch',
      headers: { origin: 'https://myfootballtournament.com' },
      body: 'this is not json',
      isBase64Encoded: false,
      queryStringParameters: {},
      requestContext: { http: { method: 'POST', sourceIp: '198.51.100.7' } },
    } as unknown as APIGatewayProxyEventV2)
    expect((response as { statusCode: number }).statusCode).toBe(400)
  })
})

describe('what the public is told about a squad', () => {
  it('sends an age and never the date of birth', async () => {
    const response = await request('GET', '/public/teams/team-public')
    const team = parse(response.body)

    expect(response.statusCode).toBe(200)
    const player = team.players.find((one: any) => one.id === 'p-open')
    expect(player.age).toBe(25)
    expect(player.dateOfBirth).toBeUndefined()
  })

  it('sends no age at all for a club that has turned them off', async () => {
    const team = parse((await request('GET', '/public/teams/team-shy')).body)
    const player = team.players.find((one: any) => one.id === 'p-open')

    expect(player.age).toBeUndefined()
    expect(player.dateOfBirth).toBeUndefined()
  })

  it('still leaves out a private player and who runs the club', async () => {
    const team = parse((await request('GET', '/public/teams/team-public')).body)

    expect(team.players.some((one: any) => one?.id === 'p-hidden')).toBe(false)
    expect(team.managerUserIds).toBeUndefined()
    expect(team.managerLinkedAt).toBeUndefined()
  })

  // One bad row used to answer 500 to every visitor of every page naming this club.
  it('survives a hole in the squad', async () => {
    const response = await request('GET', '/public/teams/team-public')
    expect(response.statusCode).toBe(200)
    expect(parse(response.body).players.every(Boolean)).toBe(true)
  })
})

/**
 * Colours reach a public page inside a CSS declaration, so the API checks them
 * rather than trusting the browser that computed them. `colors` went unchecked
 * for a long time and is printed through the `background` shorthand, which
 * accepts `url(...)`: a club manager could have made every visitor to a public
 * match fetch an address of their choosing.
 */
describe('club colours', () => {
  it('refuses a crest colour that is not a colour', async () => {
    const response = await request('PATCH', '/admin/teams/team-own', {
      token: 'good-token',
      body: { crestColor: 'url(https://elsewhere.example/beacon.png)' },
    })

    expect(response.statusCode).toBe(400)
    expect(repos.teams.update).not.toHaveBeenCalled()
  })

  it('takes null as clearing the crest colour', async () => {
    const response = await request('PATCH', '/admin/teams/team-own', {
      token: 'good-token',
      body: { logo: 'https://images.example/crest.png', crestColor: null, crestOpaqueBackground: null },
    })

    expect(response.statusCode).toBe(200)
    expect(repos.teams.update).toHaveBeenCalledWith(
      'team-own',
      expect.objectContaining({ crestColor: null, crestOpaqueBackground: null }),
    )
  })

  it('refuses club colours that are not one or two hex values', async () => {
    for (const colors of [['red'], [], ['#ffffff', '#000000', '#123456'], 'red']) {
      const response = await request('PATCH', '/admin/teams/team-own', {
        token: 'good-token',
        body: { colors },
      })
      expect(response.statusCode).toBe(400)
    }
    expect(repos.teams.update).not.toHaveBeenCalled()
  })

  it('still accepts an ordinary pair of colours', async () => {
    const response = await request('PATCH', '/admin/teams/team-own', {
      token: 'good-token',
      body: { colors: ['#d95000', '#ffffff'] },
    })

    expect(response.statusCode).toBe(200)
  })
})
