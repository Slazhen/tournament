import { badRequest, forbidden, notFound } from '../lib/http.js'
import { assertManagesTeam, isSuperAdmin } from '../lib/auth.js'
import { assertPasswordStrength, generateId, generateSalt, hashPassword } from '../lib/passwords.js'
import { createSession } from '../lib/sessions.js'
import { ddb, PutCommand } from '../lib/ddb.js'
import { SITE_URL, TABLES } from '../lib/env.js'
import { record } from '../lib/audit.js'
import { sendTeamInvite } from '../lib/mail.js'
import { teams, tournaments, organizers, isPublic } from '../repos.js'
import {
  consumeInvite,
  createInvite,
  decideEntry,
  entriesForTeam,
  entriesForTournament,
  getEntry,
  linkManagerToTeam,
  peekInvite,
  putEntry,
} from '../repos-clubs.js'
import { toPublicUser, type AuthUser, type Team } from '../lib/types.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'

/**
 * Clubs run by the people who play in them.
 *
 * Until now every club belonged to the organizer who typed it in, and a coach
 * had no way to touch their own squad. The way in is an invitation: the
 * organizer creates a one-time link for a club and passes it on — no email
 * addresses to collect in advance, and no stranger able to claim a club by
 * guessing its name.
 */
export function registerClubRoutes(router: Router<RequestContext>): void {
  /* ---------------- invitations ---------------- */

  router.post('/admin/teams/:id/invites', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertManagesTeam(user, team as Team)

    const email = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : ''
    const invite = await createInvite(team as Team, user.id, email || undefined)
    const link = `${SITE_URL}/join?token=${invite.token}`

    const mail = email ? await sendTeamInvite(email, team.name, link) : { sent: false }

    await record(user, {
      action: 'team.invite',
      entity: 'team',
      entityId: team.id,
      summary: mail.sent
        ? `Emailed an invitation to run ${team.name}`
        : `Created an invitation link for ${team.name}`,
      organizerId: team.organizerId,
    })

    return { link, expiresAt: invite.expiresAt, emailed: mail.sent }
  })

  /**
   * What an invitation is for, before anyone signs up for it.
   *
   * Only the club and the organizer's names: enough for the person holding the
   * link to see they are claiming the right club, and nothing that would make
   * a stolen link worth more than it already is.
   */
  router.get('/public/invites/:token', async (_ctx, params) => {
    const invite = await peekInvite(params.token!)
    if (!invite) throw notFound('This invitation has expired or has already been used')

    const organizer = await organizers.get(invite.organizerId)
    return {
      teamName: invite.teamName,
      organizerName: organizer?.name ?? '',
      expiresAt: invite.expiresAt,
    }
  })

  /**
   * Taking up an invitation.
   *
   * Signed in, it attaches the club to the account that is already here. Signed
   * out, it creates the account first — the person following the link is a
   * coach with a phone, not somebody who wants to register first and read the
   * link second.
   */
  router.post('/auth/claim', async (ctx) => {
    const token = typeof ctx.body.token === 'string' ? ctx.body.token : ''
    const invite = await consumeInvite(token)
    if (!invite) throw badRequest('This invitation has expired or has already been used')

    const team = await teams.get(invite.teamId)
    if (!team) throw notFound('That club no longer exists')

    // Already signed in: just add the club.
    const authorization = ctx.headers['authorization']
    if (authorization) {
      const user = await ctx.user()
      await linkManagerToTeam(user, team as Team)
      await record(user, {
        action: 'team.claim',
        entity: 'team',
        entityId: team.id,
        summary: `Took over running ${team.name}`,
        organizerId: team.organizerId,
      })
      return { user: toPublicUser(user), teamId: team.id }
    }

    const email = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : ''
    if (!email.includes('@')) throw badRequest('A valid email address is required')

    try {
      assertPasswordStrength(ctx.body.password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    const existing = await findActiveUserByEmail(email)
    if (existing) {
      throw badRequest('There is already an account with this email — sign in first, then open the link again')
    }

    const salt = generateSalt()
    const user: AuthUser = {
      id: generateId(),
      email,
      displayName:
        typeof ctx.body.displayName === 'string' && ctx.body.displayName.trim()
          ? ctx.body.displayName.trim()
          : undefined,
      role: 'team_manager',
      passwordHash: await hashPassword(ctx.body.password as string, salt),
      salt,
      teamIds: [],
      createdAt: new Date().toISOString(),
      isActive: true,
    }

    await ddb.send(new PutCommand({ TableName: TABLES.AUTH_USERS, Item: user }))
    await linkManagerToTeam(user, team as Team)
    await record(user, {
      action: 'team.claim',
      entity: 'team',
      entityId: team.id,
      summary: `Signed up and took over running ${team.name}`,
      organizerId: team.organizerId,
    })

    const session = await createSession(user.id, ctx.userAgent, ctx.sourceIp)
    return {
      user: toPublicUser({ ...user, teamIds: [team.id] }),
      token: session.token,
      expiresAt: session.expiresAt,
      teamId: team.id,
    }
  })

  /* ---------------- a manager's own clubs ---------------- */

  /**
   * Everything the club's page needs: the clubs themselves, the competitions
   * they are in, and any application still waiting on an organizer.
   */
  router.get('/manager/overview', async (ctx) => {
    const user = await ctx.user()
    const teamIds = user.teamIds ?? []
    if (teamIds.length === 0) return { teams: [], tournaments: [], entries: [] }

    const myTeams = await teams.getMany(teamIds)
    const entries = (await Promise.all(teamIds.map((id) => entriesForTeam(id)))).flat()

    // Every public tournament these clubs appear in, plus the ones they have
    // applied to, in full — the club page shows the table and the next match.
    const all = await tournaments.listAll()
    const relevant = all.filter((tournament) => {
      const inSquadList = (tournament.teamIds ?? []).some((id: string) => teamIds.includes(id))
      const applied = entries.some((entry) => entry.tournamentId === tournament.id)
      return (inSquadList || applied) && (isPublic(tournament) || inSquadList)
    })

    // The names of everyone these clubs play against: the club page shows
    // "vs Sporting Sydney FC", and a manager only gets their own clubs in full.
    const referenced = new Set<string>()
    for (const tournament of relevant) {
      for (const id of tournament.teamIds ?? []) referenced.add(id)
    }
    const opponents = await teams.getMany([...referenced])
    const teamNames = Object.fromEntries(opponents.map((team) => [team.id, team.name]))

    return { teams: myTeams, tournaments: relevant, entries, teamNames }
  })

  /** Applying to a competition. The organizer still has to say yes. */
  router.post('/manager/entries', async (ctx) => {
    const user = await ctx.user()
    const teamId = typeof ctx.body.teamId === 'string' ? ctx.body.teamId : ''
    const tournamentId = typeof ctx.body.tournamentId === 'string' ? ctx.body.tournamentId : ''
    if (!teamId || !tournamentId) throw badRequest('teamId and tournamentId are required')

    const team = await teams.getOrThrow(teamId)
    assertManagesTeam(user, team as Team)

    const tournament = await tournaments.getOrThrow(tournamentId)
    if (!isPublic(tournament)) throw forbidden('That competition is not open for entries')

    if ((tournament.teamIds ?? []).includes(teamId)) {
      throw badRequest('This club is already in that competition')
    }

    const existing = await getEntry(tournamentId, teamId)
    if (existing && existing.status === 'pending') return existing

    const entry = await putEntry({
      tournamentId,
      teamId,
      organizerId: tournament.organizerId,
      status: 'pending',
      requestedBy: user.id,
      requestedByRole: user.role,
      createdAt: new Date().toISOString(),
    })

    await record(user, {
      action: 'entry.apply',
      entity: 'tournament',
      entityId: tournamentId,
      summary: `${team.name} applied to join ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return entry
  })

  /* ---------------- the organizer's side ---------------- */

  router.get('/admin/tournaments/:id/entries', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    if (!isSuperAdmin(user) && user.organizerId !== tournament.organizerId) {
      throw forbidden('This competition belongs to another organizer')
    }
    return entriesForTournament(params.id!)
  })

  /**
   * Accepting or turning down an application.
   *
   * Accepting adds the club to the competition but deliberately does not touch
   * the fixture list: what that should do depends on whether a ball has been
   * kicked yet, and the settings screen already shows the organizer exactly
   * what changing the teams would cost before it does it.
   */
  router.patch('/admin/tournaments/:id/entries/:teamId', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    if (!isSuperAdmin(user) && user.organizerId !== tournament.organizerId) {
      throw forbidden('This competition belongs to another organizer')
    }

    const status = ctx.body.status
    if (status !== 'accepted' && status !== 'declined') {
      throw badRequest("status must be 'accepted' or 'declined'")
    }

    const entry = await getEntry(params.id!, params.teamId!)
    if (!entry) throw notFound('No application from that club')

    const note = typeof ctx.body.note === 'string' ? ctx.body.note.trim() : undefined
    await decideEntry(params.id!, params.teamId!, status, user.id, note)

    const team = await teams.get(params.teamId!)

    if (status === 'accepted' && !(tournament.teamIds ?? []).includes(params.teamId!)) {
      await tournaments.update(params.id!, {
        teamIds: [...(tournament.teamIds ?? []), params.teamId!],
      })
    }

    await record(user, {
      action: `entry.${status}`,
      entity: 'tournament',
      entityId: params.id!,
      summary: `${status === 'accepted' ? 'Accepted' : 'Turned down'} ${
        team?.name ?? 'a club'
      } for ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return { ok: true }
  })
}

/** Local to this file: the auth routes own the shared version. */
async function findActiveUserByEmail(email: string): Promise<AuthUser | null> {
  const { findUserByCredential } = await import('./auth.js')
  return findUserByCredential(email)
}
