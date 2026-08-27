import { badRequest, forbidden, notFound } from '../lib/http.js'
import { assertCanAccessOrganizer, assertManagesTeam, isSuperAdmin } from '../lib/auth.js'
import { assertPasswordStrength, generateId, generateSalt, hashPassword } from '../lib/passwords.js'
import { createSession } from '../lib/sessions.js'
import { ddb, PutCommand } from '../lib/ddb.js'
import { SITE_URL, TABLES } from '../lib/env.js'
import { record } from '../lib/audit.js'
import { sendTeamInvite } from '../lib/mail.js'
import { teams, tournaments, organizers, isPublic, seasonStatus } from '../repos.js'
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
  type Entry,
  type TeamInvite,
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
    // Deliberately the organizer's test rather than the club's. An invitation
    // hands somebody permanent control of a club, so a manager who already has
    // it must not be able to pass it on — nor to send mail from the product's
    // own address to an address of their choosing.
    assertCanAccessOrganizer(user, team.organizerId)

    // An invitation may also enter the club in one competition. That is a write
    // against the competition, so the same check is made against its organizer
    // rather than assumed from the club's: the two are the same organizer in
    // every case the interface offers, and the day they are not, this is the
    // difference between a link and a way into somebody else's league.
    const tournamentId =
      typeof ctx.body.tournamentId === 'string' ? ctx.body.tournamentId.trim() : ''
    const tournament = tournamentId ? await tournaments.getOrThrow(tournamentId) : null
    if (tournament) assertCanAccessOrganizer(user, tournament.organizerId)

    const email = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : ''
    const invite = await createInvite(team as Team, user.id, {
      email: email || undefined,
      tournament: tournament ? { id: tournament.id, name: tournament.name } : undefined,
    })
    const link = `${SITE_URL}/join?token=${invite.token}`

    const mail = email
      ? await sendTeamInvite(email, team.name, link, tournament?.name)
      : { sent: false }

    const where = tournament ? ` and enter it in ${tournament.name}` : ''
    await record(user, {
      action: 'team.invite',
      entity: 'team',
      entityId: team.id,
      summary: mail.sent
        ? `Emailed an invitation to run ${team.name}${where}`
        : `Created an invitation link to run ${team.name}${where}`,
      organizerId: team.organizerId,
    })

    return {
      link,
      expiresAt: invite.expiresAt,
      emailed: mail.sent,
      tournamentName: tournament?.name,
    }
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
      // Only the name. The id would tell an unauthenticated holder of a stolen
      // link which competition to go looking at, and buys the person who was
      // actually invited nothing the name does not.
      tournamentName: invite.tournamentName ?? '',
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
    // Read it, check everything, and only then spend it. Consuming first meant
    // a stale session token, a weak password or an email already in use burned
    // the invitation permanently — and the organizer had to issue another.
    const invite = await peekInvite(token)
    if (!invite) throw badRequest('This invitation has expired or has already been used')

    const team = await teams.get(invite.teamId)
    if (!team) throw notFound('That club no longer exists')

    // Already signed in: just add the club.
    const authorization = ctx.headers['authorization']
    if (authorization) {
      const user = await ctx.user()
      if (!(await consumeInvite(token))) {
        throw badRequest('This invitation has expired or has already been used')
      }
      await linkManagerToTeam(user, team as Team)
      await record(user, {
        action: 'team.claim',
        entity: 'team',
        entityId: team.id,
        summary: `Took over running ${team.name}`,
        organizerId: team.organizerId,
      })
      await enterInvitedTournament(user, team as Team, invite)
      return { user: toPublicUser(user), teamId: team.id }
    }

    const email = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : ''
    if (!email.includes('@')) throw badRequest('A valid email address is required')

    // An invitation sent to somebody is for them. Without this, holding any
    // link — including one for your own club — was a way to open an account on
    // any address at all, and account creation is otherwise super-admin only.
    if (invite.email && invite.email !== email) {
      throw badRequest('This invitation was sent to a different email address')
    }

    try {
      assertPasswordStrength(ctx.body.password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    const existing = await findActiveUserByEmail(email)
    if (existing) {
      throw badRequest('There is already an account with this email — sign in first, then open the link again')
    }

    if (!(await consumeInvite(token))) {
      throw badRequest('This invitation has expired or has already been used')
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
    await enterInvitedTournament(user, team as Team, invite)

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

    // A season every match of which has a score is over, and joining it would
    // change a finished table. The club page never offered these, but the route
    // has to say so itself: it is one request, and there are years of them.
    if (seasonStatus(tournament) === 'finished') {
      throw badRequest('That competition has finished')
    }

    if ((tournament.teamIds ?? []).includes(teamId)) {
      throw badRequest('This club is already in that competition')
    }

    const existing = await getEntry(tournamentId, teamId)
    // A pending application is returned rather than rewritten. That is also
    // what stops a club badgering an organizer: asking again is only possible
    // once the organizer has answered, so every repeat costs them one
    // deliberate decision rather than a stream of identical rows.
    if (existing && existing.status === 'pending') return existing

    // A club turned down once may ask again — circumstances change, and the
    // alternative was a dead end the manager could do nothing about. The
    // decision this replaces is carried onto the new row, so the organizer sees
    // it is a repeat and reads back what they said the first time rather than a
    // request that looks new.
    const replaced = existing && existing.status !== 'pending' ? existing : undefined

    let entry: Entry
    try {
      entry = await putEntry(
        {
          tournamentId,
          teamId,
          organizerId: tournament.organizerId,
          status: 'pending',
          requestedBy: user.id,
          requestedByRole: user.role,
          createdAt: new Date().toISOString(),
          previousNote: replaced?.note || undefined,
          previousDecidedAt: replaced?.decidedAt || undefined,
        },
        existing ? existing.status : null,
      )
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
      // The organizer decided between the read and the write. Their decision is
      // the current state of the application and the club should see it, not a
      // 'pending' row written on top of it.
      const current = await getEntry(tournamentId, teamId)
      if (current) return current
      throw error
    }

    await record(user, {
      action: 'entry.apply',
      entity: 'tournament',
      entityId: tournamentId,
      summary:
        replaced?.status === 'declined'
          ? `${team.name} applied to join ${tournament.name} again, after being turned down`
          : `${team.name} applied to join ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return entry
  })

  /**
   * Which of the club's players are entered in one competition.
   *
   * The same eleven do not necessarily play in the Sunday league and the
   * midweek cup, and a player signed in March should not appear in a list of
   * who played in February. So the selection lives on the competition, keyed by
   * club, and the club's own squad stays untouched by it.
   *
   * No selection means everybody. That is the honest default: it is what every
   * competition assumed before this existed, so nothing changes underneath a
   * manager who never opens the screen.
   */
  router.put('/manager/tournaments/:tournamentId/squad', async (ctx, params) => {
    const user = await ctx.user()
    const teamId = typeof ctx.body.teamId === 'string' ? ctx.body.teamId : ''
    if (!teamId) throw badRequest('teamId is required')

    const team = await teams.getOrThrow(teamId)
    assertManagesTeam(user, team as Team)

    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    if (!(tournament.teamIds ?? []).includes(teamId)) {
      throw badRequest('This club is not in that competition')
    }

    // The organizer can close squads once the competition is under way. That
    // binds the managers, not the organizer: somebody still has to be able to
    // fix a mistake after the deadline.
    const runsTheCompetition =
      isSuperAdmin(user) || (!!user.organizerId && user.organizerId === tournament.organizerId)
    if (tournament.squadsLocked && !runsTheCompetition) {
      throw forbidden('The organiser has closed squads for this competition')
    }

    const known = new Set(
      ((team.players as Array<{ id?: string }> | undefined) ?? [])
        .map((player) => player.id)
        .filter((id): id is string => typeof id === 'string'),
    )
    const requested: unknown[] = Array.isArray(ctx.body.playerIds) ? ctx.body.playerIds : []
    const playerIds = requested.filter(
      (id): id is string => typeof id === 'string' && known.has(id),
    )

    // "Everybody" and "no selection" are the same state, and storing it as no
    // selection is what keeps the two in step when the club signs somebody new
    // afterwards.
    const everyone = playerIds.length === known.size
    await tournaments.setSquad(params.tournamentId!, teamId, everyone ? null : playerIds)

    await record(user, {
      action: 'squad.update',
      entity: 'tournament',
      entityId: params.tournamentId!,
      summary: everyone
        ? `Entered the whole squad of ${team.name} in ${tournament.name}`
        : `Entered ${playerIds.length} of ${known.size} players of ${team.name} in ${tournament.name}`,
      organizerId: tournament.organizerId,
    })

    return { playerIds, all: everyone }
  })

  /* ---------------- the organizer's side ---------------- */

  router.get('/admin/tournaments/:id/entries', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    // Not a hand-rolled comparison: a team manager has no organizer id at all,
    // and `undefined !== undefined` is false — the inline version let them
    // through on any row whose organizer id was missing.
    assertCanAccessOrganizer(user, tournament.organizerId)
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
    // Not a hand-rolled comparison: a team manager has no organizer id at all,
    // and `undefined !== undefined` is false — the inline version let them
    // through on any row whose organizer id was missing.
    assertCanAccessOrganizer(user, tournament.organizerId)

    const status = ctx.body.status
    if (status !== 'accepted' && status !== 'declined') {
      throw badRequest("status must be 'accepted' or 'declined'")
    }

    const entry = await getEntry(params.id!, params.teamId!)
    if (!entry) throw notFound('No application from that club')

    const note = typeof ctx.body.note === 'string' ? ctx.body.note.trim() : undefined
    await decideEntry(params.id!, params.teamId!, status, user.id, note)

    const team = await teams.get(params.teamId!)

    // Appended under a condition rather than written as a whole list read
    // before the decision: an organizer accepting one club while another was
    // being added elsewhere used to drop whichever write landed first.
    if (status === 'accepted') {
      await tournaments.addTeam(params.id!, params.teamId!)
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

/**
 * Puts a newly claimed club into the competition its invitation named.
 *
 * The authority for this write is the invitation: it was issued by somebody who
 * could already have added the club by hand, and the token proves the person
 * following the link is the one they gave it to. That is why the new manager's
 * own permissions are not consulted — a manager cannot enter a club anywhere
 * without the organizer agreeing, and this is the organizer having agreed in
 * advance.
 *
 * What that authority does not survive is the club changing hands. A super
 * admin can move a club to another organizer, and invitations are not torn up
 * when that happens, so the pairing is checked again here rather than taken
 * from a fortnight-old token.
 *
 * Nothing here fails the claim, and that is enforced rather than hoped for: the
 * club changing hands is the thing the person came to do, and a competition
 * deleted or finished in the meantime must not cost them the invitation, the
 * account and the session all at once.
 */
async function enterInvitedTournament(
  user: AuthUser,
  team: Team,
  invite: TeamInvite,
): Promise<void> {
  if (!invite.tournamentId) return

  try {
    const tournament = await tournaments.get(invite.tournamentId)
    if (!tournament) return

    // The club has moved to another organizer since the invitation was written.
    // Entering it in a competition its present owner does not run is not what
    // anybody agreed to.
    if (tournament.organizerId !== team.organizerId) return

    // A season every match of which has a score is over, and adding a club to
    // it changes a finished table. The application route refuses this for the
    // same reason; an invitation lasts a fortnight, which is long enough for a
    // season to end inside it.
    if (seasonStatus(tournament) === 'finished') return

    const added = await tournaments.addTeam(tournament.id, team.id)

    // An application already on the row would otherwise leave the club both in
    // the competition and, on its own page, refused by it. The organizer's
    // earlier answer is being overruled by the organizer's own invitation, so
    // it is overruled in the audit log too rather than quietly.
    const existing = await getEntry(tournament.id, team.id)
    const overruled = existing && existing.status !== 'accepted' ? existing.status : null
    if (overruled) {
      await decideEntry(tournament.id, team.id, 'accepted', invite.createdBy)
    }

    if (!added && !overruled) return

    // Deliberately not touching the fixtures, for the same reason accepting an
    // application does not: what a new club should do to a draw depends on
    // whether a ball has been kicked, and the settings screen is where the
    // organizer is shown that cost before paying it.
    await record(user, {
      action: 'entry.invited',
      entity: 'tournament',
      entityId: tournament.id,
      summary: overruled
        ? `${team.name} entered ${tournament.name} through the organiser's invitation, replacing an application marked ${overruled}`
        : `${team.name} entered ${tournament.name} through the organiser's invitation`,
      organizerId: tournament.organizerId,
    })
  } catch (error) {
    // The club has changed hands either way. Losing that to a competition that
    // was deleted mid-signup would burn the invitation with nothing to show.
    console.error('Entering an invited club in its competition failed', error)
  }
}

/** Local to this file: the auth routes own the shared version. */
async function findActiveUserByEmail(email: string): Promise<AuthUser | null> {
  const { findUserByCredential } = await import('./auth.js')
  return findUserByCredential(email)
}
