import { Router } from '../lib/router.js'
import { badRequest, notFound } from '../lib/http.js'
import { organizerSlug, tournamentSlug, seriesSlug, seasonSlug, seriesKey } from '../lib/slugs.js'
import { isPublic, organizers, teams, toSummary, tournaments } from '../repos.js'
import type { Organizer, Team, Tournament } from '../lib/types.js'
import type { RequestContext } from '../context.js'

/**
 * Routes anyone may call, with no token.
 *
 * Two rules hold for everything in this file: it never returns a private
 * tournament, and it never touches the auth tables. The old browser-side code
 * could read both, because the "read-only" key it shipped to every visitor was
 * allowed to Scan the users and sessions tables.
 */

/**
 * A club as the public may see it.
 *
 * These routes returned the stored record whole, which meant two things nobody
 * asked for went out to anyone who asked: `managerUserIds`, the account ids of
 * the people who run the club, and every player marked `isPublic: false` — a
 * flag the player route already honoured and then undid by attaching the club
 * beside it.
 */
function toPublicTeam(team: Team): Team {
  const { managerUserIds: _managers, ...rest } = team
  if (!Array.isArray(team.players)) return rest as Team

  const players = (team.players as Array<{ isPublic?: boolean }>).filter(
    (player) => player?.isPublic !== false,
  )
  return { ...(rest as Team), players }
}

const toPublicTeams = (list: Team[]): Team[] => list.map(toPublicTeam)

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

  router.get('/public/teams', async () => toPublicTeams(await teams.listAll()))

  router.get('/public/teams/:id', async (_ctx, params) => {
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    return toPublicTeam(team)
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
    toPublicTeams(await teams.listByOrganizer(params.organizerId!)),
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
  /**
   * One competition's seasons, and which of them is being shown.
   *
   * The page needs the switcher as well as the season, and a second request for
   * it would be a second cold Lambda on every visit.
   */
  const seasonsOf = (all: Tournament[], tournament: Tournament) => {
    const key = seriesKey(tournament)
    return all
      .filter(isPublic)
      .filter((candidate) => seriesKey(candidate) === key)
      .map(toSummary)
      .sort(
        (a, b) =>
          new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime(),
      )
  }

  /**
   * The season a visitor should land on when they only named the competition:
   * the newest one still being played, or the newest one there is.
   */
  const currentSeason = (seasons: Tournament[]): Tournament => {
    const byNewest = [...seasons].sort(
      (a, b) => new Date(b.createdAtISO || 0).getTime() - new Date(a.createdAtISO || 0).getTime(),
    )
    const unfinished = byNewest.find((season) => toSummary(season).status !== 'finished')
    return unfinished ?? byNewest[0]
  }

  const bundle = (all: Tournament[], tournament: Tournament, organizer: Organizer) => ({
    tournament,
    seasons: seasonsOf(all, tournament),
    organizer: {
      id: organizer.id,
      name: organizer.name,
      logo: organizer.logo,
      description: organizer.description,
    },
  })

  const organizerBySlug = async (slug: string) => {
    const all = await organizers.list()
    const organizer = all.find((o) => organizerSlug(o) === slug.toLowerCase())
    if (!organizer) throw notFound('Organizer not found')
    return organizer
  }

  /**
   * The old address of a tournament, and the address of a whole competition,
   * are the same shape: /:organizer/:slug. Try it as one, then as the other, so
   * every link ever shared keeps working.
   */
  router.get('/public/by-slug/:organizerSlug/:tournamentSlug', async (_ctx, params) => {
    const organizer = await organizerBySlug(params.organizerSlug!)
    const candidates = (await tournaments.listByOrganizer(organizer.id)).filter(isPublic)
    const slug = params.tournamentSlug!.toLowerCase()

    const exact = candidates.find((t) => tournamentSlug(t).toLowerCase() === slug)
    const bySeries = candidates.filter((t) => seriesSlug(t).toLowerCase() === slug)

    const tournament = exact ?? (bySeries.length > 0 ? currentSeason(bySeries) : undefined)
    if (!tournament) throw notFound('Tournament not found')

    const teamIds = Array.isArray(tournament.teamIds) ? tournament.teamIds : []
    return {
      ...bundle(candidates, tournament, organizer),
      teams: toPublicTeams(await teams.getMany(teamIds)),
      matchedAs: exact ? 'tournament' : 'series',
    }
  })

  /** A season by name: /homebush_futsal/homebush_futsal_premier_league/2025 */
  router.get('/public/season/:organizerSlug/:seriesSlug/:seasonSlug', async (_ctx, params) => {
    const organizer = await organizerBySlug(params.organizerSlug!)
    const candidates = (await tournaments.listByOrganizer(organizer.id)).filter(isPublic)

    const series = candidates.filter(
      (t) => seriesSlug(t).toLowerCase() === params.seriesSlug!.toLowerCase(),
    )
    if (series.length === 0) throw notFound('Competition not found')

    const tournament = series.find(
      (t) => seasonSlug(t).toLowerCase() === params.seasonSlug!.toLowerCase(),
    )
    if (!tournament) throw notFound('Season not found')

    const teamIds = Array.isArray(tournament.teamIds) ? tournament.teamIds : []
    return {
      ...bundle(candidates, tournament, organizer),
      teams: toPublicTeams(await teams.getMany(teamIds)),
      matchedAs: 'season',
    }
  })

  /**
   * Everything a public team page needs: the team, the public tournaments it
   * plays in, and the teams referenced by those tournaments so opponents can be
   * named. One request instead of downloading every team and every tournament in
   * the system and filtering in the browser.
   */
  router.get('/public/teams/:id/context', async (_ctx, params) => {
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    return buildTeamContext(team)
  })

  /**
   * A player, the team they belong to, and that team's tournaments.
   *
   * Finding a player means looking through the teams, which is exactly the kind
   * of work that belongs on the server: the page used to pull every team into
   * the browser to run the same search.
   */
  router.get('/public/players/:id', async (_ctx, params) => {
    const allTeams = await teams.listAll()

    for (const team of allTeams) {
      const players = Array.isArray(team.players)
        ? (team.players as { id?: string; isPublic?: boolean }[])
        : []
      // A player marked not public is not served here at all.
      const player = players.find(
        (candidate) => candidate?.id === params.id && candidate.isPublic !== false,
      )
      if (player) {
        return { player, ...(await buildTeamContext(team)) }
      }
    }

    throw notFound('Player not found')
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
    return toPublicTeams(await teams.getMany(ids as string[]))
  })
}

/** The team, its public tournaments, and every team those tournaments mention. */
async function buildTeamContext(team: Awaited<ReturnType<typeof teams.get>> & object) {
  const all = await tournaments.listAll()
  const played = all
    .filter(isPublic)
    .filter((tournament) =>
      Array.isArray(tournament.teamIds) && tournament.teamIds.includes(team.id as string),
    )

  const referenced = new Set<string>()
  for (const tournament of played) {
    for (const id of tournament.teamIds ?? []) referenced.add(id)
    for (const match of (tournament.matches ?? []) as { homeTeamId?: string; awayTeamId?: string }[]) {
      if (match?.homeTeamId) referenced.add(match.homeTeamId)
      if (match?.awayTeamId) referenced.add(match.awayTeamId)
    }
  }

  return {
    team: toPublicTeam(team as Team),
    tournaments: played,
    teams: toPublicTeams(await teams.getMany([...referenced])),
  }
}
