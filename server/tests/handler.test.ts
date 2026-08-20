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

vi.mock('../src/repos.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repos.js')>()
  return {
    ...actual,
    organizers: { list: vi.fn(async () => []) },
    teams: {
      get: vi.fn(async (id: string) => (id === 'team-other' ? otherTeam : null)),
      update: vi.fn(async () => undefined),
      listByOrganizer: vi.fn(async () => []),
      listAll: vi.fn(async () => []),
      getMany: vi.fn(async () => []),
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

  it('refuses super-admin-only routes to an organizer', async () => {
    const response = await request('POST', '/admin/organizers', {
      token: 'good-token',
      body: { name: 'New org', email: 'new@example.com' },
    })
    expect(response.statusCode).toBe(403)
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
