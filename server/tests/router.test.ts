import { describe, expect, it } from 'vitest'
import { Router } from '../src/lib/router.js'
import { HttpError } from '../src/lib/http.js'

const noop = async () => null

describe('Router', () => {
  it('matches a static path', () => {
    const router = new Router<null>().get('/public/organizers', noop)
    expect(router.match('GET', '/public/organizers').params).toEqual({})
  })

  it('captures path parameters', () => {
    const router = new Router<null>().patch(
      '/admin/tournaments/:tournamentId/matches/:matchId',
      noop,
    )
    const { params } = router.match('PATCH', '/admin/tournaments/t-1/matches/m-9')
    expect(params).toEqual({ tournamentId: 't-1', matchId: 'm-9' })
  })

  it('decodes encoded parameters', () => {
    const router = new Router<null>().delete('/admin/accounts/:email', noop)
    const { params } = router.match('DELETE', '/admin/accounts/user%40example.com')
    expect(params.email).toBe('user@example.com')
  })

  it('does not match a different method', () => {
    const router = new Router<null>().get('/public/organizers', noop)
    expect(() => router.match('POST', '/public/organizers')).toThrow(HttpError)
  })

  it('does not let a parameter swallow extra segments', () => {
    const router = new Router<null>().get('/public/tournaments/:id', noop)
    expect(() => router.match('GET', '/public/tournaments/t-1/matches')).toThrow(HttpError)
  })

  it('throws a 404 for an unknown path', () => {
    const router = new Router<null>().get('/public/organizers', noop)
    try {
      router.match('GET', '/nope')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as HttpError).status).toBe(404)
    }
  })
})
