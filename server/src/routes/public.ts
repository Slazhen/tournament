import { Router } from '../lib/router.js'
import { badRequest, notFound } from '../lib/http.js'
import { organizerSlug, tournamentSlug } from '../lib/slugs.js'
import { isPublic, organizers, teams, tournaments } from '../repos.js'
import type { RequestContext } from '../context.js'

/**
 * Routes anyone may call, with no token.
 *
 * Two rules hold for everything in this file: it never returns a private
 * tournament, and it never touches the auth tables. The old browser-side code
 * could read both, because the "read-only" key it shipped to every visitor was
 * allowed to Scan the users and sessions tables.
 */
export function registerPublicRoutes(router: Router<RequestContext>): void {
  router.get('/public/organizers', async () => {
    const all = await organizers.list()
    // A public visitor gets the organizer's public identity, not their contact details.
    return all.map(({ id, name, logo, description, createdAtISO }) => ({
      id,
      name,
      logo,
      description,
      createdAtISO,
    }))
  })

  router.get('/public/tournaments', async () => tournaments.listPublicSummaries())

  /**
   * Every public tournament in full.
   *
   * A few pages (a player's or a team's history across tournaments) genuinely
   * need all of it. This used to mean each visitor scanning the table from their
   * own browser; now one server-side read serves everyone for the cache window,
   * so the cost stops scaling with traffic.
   */
  router.get('/public/tournaments/full', async () => {
    const all = await tournaments.listAll()
    return all.filter(isPublic)
  })

  router.get('/public/teams', async () => teams.listAll())

  router.get('/public/teams/:id', async (_ctx, params) => {
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    return team
  })

  router.get('/public/tournaments/:id', async (_ctx, params) => {
    const tournament = await tournaments.get(params.id!)
    if (!tournament || !isPublic(tournament)) throw notFound('Tournament not found')
    return tournament
  })

  router.get('/public/organizers/:organizerId/tournaments', async (_ctx, params) => {
    const list = await tournaments.listByOrganizer(params.organizerId!)
    return list.filter(isPublic)
  })

  router.get('/public/organizers/:organizerId/teams', async (_ctx, params) =>
    teams.listByOrganizer(params.organizerId!),
  )

  /**
   * Everything a public tournament page needs, in one request: the tournament,
   * the teams it references, and the organizer that runs it.
   *
   * The page used to make three sequential calls to assemble this — resolve the
   * slug from the full summary list, fetch the tournament, then fetch its teams —
   * each one waiting on the last. All three reads here come from the same
   * server-side cache.
   */
  router.get('/public/by-slug/:organizerSlug/:tournamentSlug', async (_ctx, params) => {
    const allOrganizers = await organizers.list()
    const organizer = allOrganizers.find((o) => organizerSlug(o) === params.organizerSlug!.toLowerCase())
    if (!organizer) throw notFound('Organizer not found')

    const candidates = await tournaments.listByOrganizer(organizer.id)
    const tournament = candidates
      .filter(isPublic)
      .find((t) => tournamentSlug(t).toLowerCase() === params.tournamentSlug!.toLowerCase())
    if (!tournament) throw notFound('Tournament not found')

    const teamIds = Array.isArray(tournament.teamIds) ? tournament.teamIds : []

    return {
      tournament,
      teams: await teams.getMany(teamIds),
      organizer: {
        id: organizer.id,
        name: organizer.name,
        logo: organizer.logo,
        description: organizer.description,
      },
    }
  })

  /**
   * Fetches a specific set of teams by id — used by pages that already know
   * which teams they need. POST rather than GET so a long list of ids does not
   * have to fit in a URL.
   */
  router.post('/public/teams/batch', async (ctx) => {
    const ids = ctx.body.teamIds
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      throw badRequest('teamIds must be an array of strings')
    }
    if (ids.length > 500) throw badRequest('Too many teamIds in one request')
    return teams.getMany(ids as string[])
  })
}
