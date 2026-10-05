import { ddb, PutCommand } from '../lib/ddb.js'
import { SITE_URL, TABLES } from '../lib/env.js'
import { badRequest, forbidden, notFound } from '../lib/http.js'
import { assertCanAccessOrganizer } from '../lib/auth.js'
import { assertPasswordStrength, generateId, generateSalt, hashPassword } from '../lib/passwords.js'
import { createSession } from '../lib/sessions.js'
import { toPublicUser, type AuthUser, type Organizer, type Team, type Tournament } from '../lib/types.js'
import { organizers, teams, tournaments } from '../repos.js'
import {
  assertScorerOrCounted,
  composeGoal,
  expectationOf,
  readGoal,
  recordedFor,
  scoreAfterAdding,
  scoreAfterMoving,
} from '../lib/goals.js'
import { cardsOf, composeCard, describeCard, readCard } from '../lib/cards.js'
import { nameableInMatch, type Side } from '../lib/lineups.js'
import { allFixtures, locateMatch } from '../lib/matches.js'
import { isArchivedPlayer } from '../lib/players.js'
import {
  appointmentOf,
  appointmentsOf,
  POSITION_LABELS,
  positionOf,
  readAppointments,
  readRefereeEmail,
  readRefereeName,
  refereesOf,
  REFEREE_POSITIONS,
  type Referee,
  type RefereePosition,
} from '../lib/referees.js'
import { sendRefereeInvite } from '../lib/mail.js'
import {
  consumeRefereeInvite,
  createRefereeInvite,
  deleteRefereeInvites,
  peekRefereeInvite,
  pendingRefereeInvites,
} from '../repos-referee-invites.js'
import { adminRead } from '../lib/cache.js'
import { record } from '../lib/audit.js'
import { emailIsTaken } from './auth.js'
import type { EventGuard } from '../repos.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'

/**
 * Referees: the organiser's list of them, the appointments, the invitation that
 * links a person's account to a record on that list, and what an appointed
 * referee may write.
 *
 * The rules a referee writes under, all decided with the organiser:
 *
 * - The score is the referee's while it is empty or while the referee is the
 *   one who set it (`scoreEnteredBy: 'referee'`). The organiser changing it
 *   takes it back, for good: the mark comes off and the referee's routes
 *   refuse to move it again.
 * - While the score is theirs, a goal the result has no room for raises it, as
 *   it does for the organiser. Once it is the organiser's, a referee names the
 *   goals it counts and moves nothing, as a club's manager does.
 * - A referee corrects and removes events they or a club entered - the
 *   referee's word is above the club's - and never the organiser's. A goal of a
 *   club's that the referee corrects becomes the referee's.
 * - Players are named from the registration for the competition, plus anyone
 *   already on that side's teamsheet: the same rule a teamsheet is written
 *   under, because a referee is often the first person to record anything about
 *   the match and there is no sheet yet to pick from.
 *
 * Every write asserts in its condition that the referee is still appointed to
 * the position the route found them in. Taking somebody off a match is the
 * organiser withdrawing a permission, and a request already in flight must not
 * outlive it.
 */
export function registerRefereeRoutes(router: Router<RequestContext>): void {
  /* ---------------- the organiser's list ---------------- */

  /**
   * The organiser's referees, with who has been asked and has not answered.
   *
   * Addresses included: these are the organiser's own records of people they
   * invited. Nothing here ever reaches a public route.
   */
  router.get('/admin/organizers/:id/referees', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizers.readConsistently(params.id!)
    if (!organizer) throw notFound('Organizer not found')

    const pending = await pendingRefereeInvites(organizer.id)
    return refereesOf(organizer).map((referee) => {
      const invite = pending.find((candidate) => candidate.refereeId === referee.id)
      return {
        id: referee.id,
        name: referee.name,
        email: referee.email,
        linked: Boolean(referee.userId),
        linkedAtISO: referee.linkedAtISO,
        createdAtISO: referee.createdAtISO,
        invitedUntil: invite?.expiresAt,
      }
    })
  })

  router.post('/admin/organizers/:id/referees', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizers.get(params.id!)
    if (!organizer) throw notFound('Organizer not found')

    const referee: Referee = {
      id: generateId(),
      name: readRefereeName(ctx.body.name),
      createdAtISO: new Date().toISOString(),
    }
    const email = readRefereeEmail(ctx.body.email)
    if (email) referee.email = email

    await organizers.addReferee(organizer.id, referee)
    await record(user, {
      action: 'referee.add',
      entity: 'organizer',
      entityId: organizer.id,
      summary: `Added ${referee.name} to the referees of ${organizer.name}`,
      organizerId: organizer.id,
    })
    return { id: referee.id, name: referee.name, email: referee.email, linked: false }
  })

  /**
   * A referee's name, or the address their invitation goes to.
   *
   * The address only while nobody has taken the record up: after that it is the
   * address of somebody's login, and changing it here would change nothing
   * about the account while saying it had.
   */
  router.patch('/admin/organizers/:id/referees/:refereeId', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizers.readConsistently(params.id!)
    if (!organizer) throw notFound('Organizer not found')
    const current = refereesOf(organizer).find((referee) => referee.id === params.refereeId)
    if (!current) throw notFound('That referee is no longer on your list')

    const changes: Partial<Record<'name' | 'email', string | undefined>> = {}
    if (ctx.body.name !== undefined) changes.name = readRefereeName(ctx.body.name)
    if (ctx.body.email !== undefined) {
      if (current.userId) {
        throw badRequest('This referee already has an account. Their email is the one they sign in with.')
      }
      changes.email = readRefereeEmail(ctx.body.email)
    }
    if (Object.keys(changes).length === 0) throw badRequest('Nothing to change')

    // A referee who already has an account is asserted as still linked to the
    // same one: the record is not to be renamed out from under a claim that
    // landed between the read and this write.
    const updated = await organizers.updateReferee(
      organizer.id,
      current.id,
      changes,
      current.userId ? { userId: current.userId } : { unlinked: changes.email !== undefined },
    )
    if (!updated) throw badRequest('This referee has changed since the page was loaded. Reload and try again.')

    // A new address makes the links already sent to the old one wrong.
    if ('email' in changes && changes.email !== current.email) {
      await deleteRefereeInvites(organizer.id, current.id)
    }

    await record(user, {
      action: 'referee.update',
      entity: 'organizer',
      entityId: organizer.id,
      summary: `Changed the details of referee ${updated.name}`,
      organizerId: organizer.id,
    })
    return { id: updated.id, name: updated.name, email: updated.email, linked: Boolean(updated.userId) }
  })

  /**
   * Takes a referee off the list.
   *
   * Their appointments stay on the fixtures as ids that no longer resolve,
   * which every reader treats as nobody; with the record gone, so is the
   * account's standing over those matches. What they entered stays: it is the
   * record of the match.
   */
  router.delete('/admin/organizers/:id/referees/:refereeId', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizers.get(params.id!)
    if (!organizer) throw notFound('Organizer not found')

    const removed = await organizers.removeReferee(organizer.id, params.refereeId!)
    if (!removed) throw notFound('That referee is no longer on your list')
    await deleteRefereeInvites(organizer.id, removed.id)

    // And off every fixture they were appointed to. The list going is what
    // ends the permission, but a position left holding an id nothing resolves
    // reads on the organiser's screen as somebody still appointed, and each
    // removal here is conditional on the position still holding them.
    let cleared = 0
    for (const tournament of await tournaments.listByOrganizer(organizer.id, adminRead)) {
      for (const { match } of allFixtures(tournament)) {
        const position = positionOf(match, removed.id)
        if (!position) continue
        if (await tournaments.clearAppointment(tournament.id, match.id as string, position, removed.id)) {
          cleared += 1
        }
      }
    }

    await record(user, {
      action: 'referee.remove',
      entity: 'organizer',
      entityId: organizer.id,
      summary: `Removed ${removed.name} from the referees of ${organizer.name}${
        cleared > 0 ? `, and from ${cleared} ${cleared === 1 ? 'appointment' : 'appointments'}` : ''
      }`,
      organizerId: organizer.id,
    })
    return { ok: true }
  })

  /**
   * Invites the person behind a referee record to link an account to it.
   *
   * Always to the address on the record. The organiser types it once, when
   * adding the referee or later; an address sent with the invitation instead
   * would be a second place for it to live, and the two would disagree.
   */
  router.post('/admin/organizers/:id/referees/:refereeId/invites', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const organizer = await organizers.readConsistently(params.id!)
    if (!organizer) throw notFound('Organizer not found')
    const referee = refereesOf(organizer).find((candidate) => candidate.id === params.refereeId)
    if (!referee) throw notFound('That referee is no longer on your list')
    if (referee.userId) throw badRequest('This referee has already set up their account')
    if (!referee.email) throw badRequest('Add an email address for this referee first')

    // One live link per record. A second invitation is how a lost link is dealt
    // with, and the first must not keep working beside it.
    await deleteRefereeInvites(organizer.id, referee.id)

    const invite = await createRefereeInvite(organizer, referee, user.id, referee.email)
    const link = `${SITE_URL}/join-referee?token=${invite.token}`
    const mail = await sendRefereeInvite(referee.email, organizer.name, link)

    await record(user, {
      action: 'referee.invite',
      entity: 'organizer',
      entityId: organizer.id,
      summary: mail.sent
        ? `Emailed ${referee.name} an invitation to referee for ${organizer.name}`
        : `Created an invitation link for ${referee.name} to referee for ${organizer.name}`,
      organizerId: organizer.id,
    })
    return { link, expiresAt: invite.expiresAt, emailed: mail.sent, email: referee.email }
  })

  router.delete('/admin/organizers/:id/referees/:refereeId/invites', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const cancelled = await deleteRefereeInvites(params.id!, params.refereeId!)
    if (cancelled > 0) {
      await record(user, {
        action: 'referee.invite_cancel',
        entity: 'organizer',
        entityId: params.id!,
        summary: 'Cancelled an invitation to referee',
        organizerId: params.id!,
      })
    }
    return { cancelled }
  })

  /**
   * Who referees one fixture.
   *
   * All three positions in every request, because the screen shows all three:
   * a position missing from the body is a position nobody holds. The ids are
   * checked against the competition's own organiser's list - the season's, not
   * the caller's, so a super admin appointing on somebody's behalf appoints from
   * that league's referees.
   */
  router.put('/admin/tournaments/:tournamentId/matches/:matchId/referees', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    if (!locateMatch(tournament, params.matchId!)) throw notFound('Match not found in this tournament')

    const organizer = await organizers.readConsistently(tournament.organizerId)
    const known = refereesOf(organizer)
    const appointed = readAppointments(ctx.body, known)

    await tournaments.setMatchReferees(params.tournamentId!, params.matchId!, appointed)

    const byId = new Map(known.map((referee) => [referee.id, referee.name]))
    const named = REFEREE_POSITIONS.filter((position) => appointed[position]).map(
      (position) => `${POSITION_LABELS[position]}: ${byId.get(appointed[position]!)}`,
    )
    await record(user, {
      action: 'match.referees',
      entity: 'match',
      entityId: `${params.tournamentId}/${params.matchId}`,
      summary:
        named.length > 0
          ? `Appointed referees in ${tournament.name} (${named.join(', ')})`
          : `Cleared the referees of a match in ${tournament.name}`,
      organizerId: tournament.organizerId,
    })
    return { referees: appointed }
  })

  /* ---------------- the invitation ---------------- */

  /**
   * What a referee invitation is for, before anybody acts on it.
   *
   * The address is in the answer, as it is for an organiser's, because the link
   * opens or links an account on that address and no other. `hasAccount` says
   * which of the two the page should offer; it tells the holder of the link
   * nothing they could not learn by trying it.
   *
   * Under `/auth/` and not `/public/`, for the reason the organiser's preview
   * is: everything public is cached for a minute, with the address in it.
   */
  router.get('/auth/referee-invites/:token', async (_ctx, params) => {
    const invite = await peekRefereeInvite(params.token!)
    if (!invite) throw notFound('This invitation has expired or has already been used')
    return {
      organizerName: invite.organizerName,
      refereeName: invite.refereeName,
      email: invite.email,
      expiresAt: invite.expiresAt,
      hasAccount: await emailIsTaken(invite.email),
    }
  })

  /**
   * Taking one up.
   *
   * Signed in, the record is linked to the account that is here - which has to
   * be a referee's account on the invited address, because an account has one
   * role and turning a coach's or an organiser's into a referee's would drop
   * what it already was. Signed out, a referee's account is created on the
   * invited address, unless one exists there, in which case the person signs in
   * first.
   *
   * Checked in full before the invitation is spent, so that a weak password or
   * the wrong session does not burn it.
   */
  router.post('/auth/claim-referee', async (ctx) => {
    const token = typeof ctx.body.token === 'string' ? ctx.body.token : ''
    const invite = await peekRefereeInvite(token)
    if (!invite) throw badRequest('This invitation has expired or has already been used')

    const organizer = await organizers.readConsistently(invite.organizerId)
    if (!organizer) throw notFound('That organizer no longer exists')
    const referee = refereesOf(organizer).find((candidate) => candidate.id === invite.refereeId)
    if (!referee) throw badRequest('This invitation was withdrawn. Ask the organiser for a new one.')
    if (referee.userId) throw badRequest('This referee has already been set up')
    // The organiser can have corrected the address since the link went out, and
    // the links to the old one are deleted after the record changes, not with
    // it. A link to an address the record no longer holds is dead.
    if ((referee.email ?? '') !== invite.email) {
      throw badRequest('This invitation was withdrawn. Ask the organiser for a new one.')
    }

    if (ctx.headers['authorization']) {
      const user = await ctx.user()
      if ((user.email ?? '').toLowerCase() !== invite.email) {
        throw badRequest('This invitation was sent to a different email address')
      }
      if (user.role !== 'referee') {
        throw badRequest(
          'This account is not a referee account. An account has one role, so refereeing needs a separate login on another address.',
        )
      }
      if (!(await consumeRefereeInvite(token))) {
        throw badRequest('This invitation has expired or has already been used')
      }
      await linkReferee(organizer, referee, user, invite.email)
      return { user: toPublicUser(user) }
    }

    try {
      assertPasswordStrength(ctx.body.password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }
    // Any row on the address, switched off or not: this is "may an account be
    // opened here", and a deactivated login is somebody deliberately locked out.
    if (await emailIsTaken(invite.email)) {
      throw badRequest('There is already an account with this email. Sign in with it, then open the link again.')
    }
    if (!(await consumeRefereeInvite(token))) {
      throw badRequest('This invitation has expired or has already been used')
    }

    const salt = generateSalt()
    const user: AuthUser = {
      id: generateId(),
      email: invite.email,
      displayName:
        typeof ctx.body.displayName === 'string' && ctx.body.displayName.trim()
          ? ctx.body.displayName.trim()
          : referee.name,
      role: 'referee',
      passwordHash: await hashPassword(ctx.body.password as string, salt),
      salt,
      createdAt: new Date().toISOString(),
      isActive: true,
    }
    // The link before the account, so that losing the race for the record
    // leaves no login behind that refers to nothing - and undone if the account
    // then fails to be written, or the record would name an account that does
    // not exist and could never be invited again.
    await linkReferee(organizer, referee, user, invite.email)
    try {
      await ddb.send(new PutCommand({ TableName: TABLES.AUTH_USERS, Item: user }))
    } catch (error) {
      await organizers.updateReferee(
        organizer.id,
        referee.id,
        { userId: undefined, linkedAtISO: undefined },
        { userId: user.id },
      )
      throw error
    }

    const session = await createSession(user.id, ctx.userAgent, ctx.sourceIp)
    return { user: toPublicUser(user), token: session.token, expiresAt: session.expiresAt }
  })

  /* ---------------- the referee's own screens ---------------- */

  /** Every fixture this account is appointed to, across every organiser it referees for. */
  router.get('/referee/matches', async (ctx) => {
    const user = await ctx.user()
    assertIsReferee(user)

    const out: Array<Record<string, unknown>> = []
    const clubIds = new Set<string>()

    for (const organizer of await organizers.linkedToReferee(user.id, adminRead)) {
      const mine = refereesOf(organizer)
        .filter((referee) => referee.userId === user.id)
        .map((referee) => referee.id)
      for (const tournament of await tournaments.listByOrganizer(organizer.id, adminRead)) {
        for (const { match, roundName } of allFixtures(tournament)) {
          const position = mine.map((id) => positionOf(match, id)).find(Boolean)
          if (!position) continue
          for (const field of ['homeTeamId', 'awayTeamId'] as const) {
            if (typeof match[field] === 'string') clubIds.add(match[field] as string)
          }
          out.push({
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            organizerName: organizer.name,
            matchId: match.id,
            position,
            roundName,
            round: match.round,
            isPlayoff: match.isPlayoff,
            dateISO: match.dateISO,
            time: match.time,
            venue: match.venue,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homeGoals: match.homeGoals,
            awayGoals: match.awayGoals,
          })
        }
      }
    }

    const clubs = (await teams.getMany([...clubIds])).map((team) => ({
      id: team.id,
      name: team.name,
      logo: typeof team.logo === 'string' ? team.logo : undefined,
    }))
    return { matches: out, clubs }
  })

  /**
   * One appointed fixture, with what the referee needs to write it: both clubs'
   * names and squads, who may be named on each side, and whether the score is
   * theirs to set.
   *
   * The squads are projected: names, shirt numbers and whether the player is
   * still on the club's books. A referee has no business with a date of birth,
   * and the record is schemaless, so anything not named here stays behind.
   */
  router.get('/referee/tournaments/:tournamentId/matches/:matchId', async (ctx, params) => {
    const { tournament, match, organizer, position } = await refereeMatch(ctx, params)

    const home = typeof match.homeTeamId === 'string' ? await teams.get(match.homeTeamId) : null
    const away = typeof match.awayTeamId === 'string' ? await teams.get(match.awayTeamId) : null

    const nameable = (team: Team | null, side: Side) =>
      team ? [...nameableInMatch(tournament, team, match, side)] : []

    const byId = new Map(refereesOf(organizer).map((referee) => [referee.id, referee.name]))
    const appointed = appointmentsOf(match)
    const officials: Partial<Record<RefereePosition, string>> = {}
    for (const slot of REFEREE_POSITIONS) {
      const name = appointed[slot] ? byId.get(appointed[slot]!) : undefined
      if (name) officials[slot] = name
    }

    return {
      tournament: { id: tournament.id, name: tournament.name, organizerName: organizer.name },
      match: refereeView(match),
      position,
      officials,
      scoreIsMine: scoreIsReferees(match),
      homeTeam: home ? toRefereeTeam(home as Team) : null,
      awayTeam: away ? toRefereeTeam(away as Team) : null,
      nameable: { home: nameable(home as Team | null, 'home'), away: nameable(away as Team | null, 'away') },
    }
  })

  /**
   * The score, while it is the referee's to set.
   *
   * Both halves together or neither: a result with one number in it is not a
   * result. It may not go below the goals already recorded for a side - a score
   * that counts fewer goals than the match holds would leave named goals the
   * result does not count, and the referee has a Delete for those. Clearing it
   * is refused while any goal is recorded, for the same reason.
   */
  router.put('/referee/tournaments/:tournamentId/matches/:matchId/score', async (ctx, params) => {
    const { user, tournament, match, guard } = await refereeMatch(ctx, params)
    if (!scoreIsReferees(match)) {
      throw forbidden('The organiser has set this result. Ask them if it needs changing.')
    }

    const clearing = ctx.body.homeGoals === null && ctx.body.awayGoals === null
    let score: { homeGoals: number; awayGoals: number } | null = null
    if (clearing) {
      if (recordedFor(match, 'home') + recordedFor(match, 'away') > 0) {
        throw badRequest('Remove the goals recorded for this match before clearing its result')
      }
    } else {
      score = { homeGoals: readScore(ctx.body.homeGoals), awayGoals: readScore(ctx.body.awayGoals) }
      for (const side of ['home', 'away'] as const) {
        const value = side === 'home' ? score.homeGoals : score.awayGoals
        if (value < recordedFor(match, side)) {
          throw badRequest(
            'More goals are recorded for this side than that score counts. Remove a goal first.',
          )
        }
      }
    }

    await tournaments.setRefereeScore(
      params.tournamentId!,
      params.matchId!,
      score,
      expectationOf(match),
      { ...guard, scoreBy: scoreMark(match) },
    )

    await record(user, {
      action: 'match.referee_score',
      entity: 'match',
      entityId: `${params.tournamentId}/${params.matchId}`,
      summary: score
        ? `Referee set the score to ${score.homeGoals}:${score.awayGoals} in ${tournament.name}`
        : `Referee cleared the score of a match in ${tournament.name}`,
      organizerId: tournament.organizerId,
    })
    return { homeGoals: score?.homeGoals ?? null, awayGoals: score?.awayGoals ?? null }
  })

  router.post('/referee/tournaments/:tournamentId/matches/:matchId/goals', async (ctx, params) => {
    const { user, tournament, match, guard } = await refereeMatch(ctx, params)

    const fields = readGoal(ctx.body)
    const mine = scoreIsReferees(match)
    const score = scoreAfterAdding(match, fields.team)
    if (score && !mine) {
      throw badRequest(
        'Every goal in this result already has a scorer. The organiser set the score, so ask them to correct it first.',
      )
    }
    assertScorerOrCounted(fields, score)
    await assertRefereePlayers(fields, tournament, match)

    const goal = composeGoal(generateId(), fields, 'referee')
    await tournaments.addGoal(params.tournamentId!, params.matchId!, goal, score, expectationOf(match), {
      ...guard,
      scoreAuthor: 'referee',
      scoreBy: scoreMark(match),
    })

    await record(user, {
      action: 'goal.add',
      entity: 'match',
      entityId: `${params.tournamentId}/${params.matchId}`,
      summary: score
        ? `Referee recorded a goal in ${tournament.name}, making it ${score.homeGoals}:${score.awayGoals}`
        : `Referee recorded a goal in ${tournament.name}`,
      organizerId: tournament.organizerId,
    })
    return { goal, score }
  })

  router.patch(
    '/referee/tournaments/:tournamentId/matches/:matchId/goals/:goalId',
    async (ctx, params) => {
      const { user, tournament, guard } = await refereeMatch(ctx, params)
      const { located, goal: stored } = await tournaments.findGoal(
        params.tournamentId!,
        params.matchId!,
        params.goalId!,
      )
      assertRefereeMayCorrect(stored)

      const fields = readGoal({ ...stored, ...ctx.body })
      const mine = scoreIsReferees(located.match)
      const score = scoreAfterMoving(located.match, params.goalId!, stored.team, fields.team)
      if (score && !mine) {
        throw badRequest(
          'The other side has no goal left to name in this result. The organiser set the score, so ask them to correct it.',
        )
      }
      assertScorerOrCounted(fields, score)
      await assertRefereePlayers(fields, tournament, located.match)

      const goal = composeGoal(params.goalId!, fields, 'referee')
      await tournaments.updateGoal(
        params.tournamentId!,
        params.matchId!,
        params.goalId!,
        goal,
        score,
        expectationOf(located.match),
        {
          ...guard,
          authors: ['referee', 'club'],
          scoreAuthor: 'referee',
          scoreBy: scoreMark(located.match),
        },
      )

      await record(user, {
        action: 'goal.update',
        entity: 'match',
        entityId: `${params.tournamentId}/${params.matchId}`,
        summary:
          stored.enteredBy === 'club'
            ? `Referee corrected a goal the club had entered in ${tournament.name}`
            : `Referee corrected a goal in ${tournament.name}`,
        organizerId: tournament.organizerId,
      })
      return { goal, score }
    },
  )

  router.delete(
    '/referee/tournaments/:tournamentId/matches/:matchId/goals/:goalId',
    async (ctx, params) => {
      const { user, tournament, guard } = await refereeMatch(ctx, params)
      const { goal: stored } = await tournaments.findGoal(
        params.tournamentId!,
        params.matchId!,
        params.goalId!,
      )
      assertRefereeMayCorrect(stored)

      // The score stays: the goal goes back to being one the result counts and
      // nobody has named, which is what deleting a goal means for everybody.
      await tournaments.removeGoal(params.tournamentId!, params.matchId!, params.goalId!, {
        ...guard,
        authors: ['referee', 'club'],
      })

      await record(user, {
        action: 'goal.remove',
        entity: 'match',
        entityId: `${params.tournamentId}/${params.matchId}`,
        summary: `Referee removed a goal from a match of ${tournament.name}`,
        organizerId: tournament.organizerId,
      })
      return { ok: true }
    },
  )

  router.post('/referee/tournaments/:tournamentId/matches/:matchId/cards', async (ctx, params) => {
    const { user, tournament, match, guard } = await refereeMatch(ctx, params)

    const fields = readCard(ctx.body)
    await assertRefereeBooking(fields, tournament, match)

    const card = composeCard(generateId(), fields, 'referee')
    await tournaments.addCard(params.tournamentId!, params.matchId!, card, cardsOf(match).length, guard)

    await record(user, {
      action: 'card.add',
      entity: 'match',
      entityId: `${params.tournamentId}/${params.matchId}`,
      summary: `Referee recorded a ${describeCard(card.type)} in ${tournament.name}`,
      organizerId: tournament.organizerId,
    })
    return { card }
  })

  router.patch(
    '/referee/tournaments/:tournamentId/matches/:matchId/cards/:cardId',
    async (ctx, params) => {
      const { user, tournament, guard } = await refereeMatch(ctx, params)
      const { located, card: stored } = await tournaments.findCard(
        params.tournamentId!,
        params.matchId!,
        params.cardId!,
      )
      if (stored.enteredBy !== 'referee') {
        throw forbidden('The organiser entered that card. Ask them to change it.')
      }

      const fields = readCard({ ...stored, ...ctx.body })
      await assertRefereeBooking(fields, tournament, located.match)

      const card = composeCard(params.cardId!, fields, 'referee')
      await tournaments.updateCard(params.tournamentId!, params.matchId!, params.cardId!, card, {
        ...guard,
        authors: ['referee'],
      })

      await record(user, {
        action: 'card.update',
        entity: 'match',
        entityId: `${params.tournamentId}/${params.matchId}`,
        summary: `Referee corrected a ${describeCard(card.type)} in ${tournament.name}`,
        organizerId: tournament.organizerId,
      })
      return { card }
    },
  )

  router.delete(
    '/referee/tournaments/:tournamentId/matches/:matchId/cards/:cardId',
    async (ctx, params) => {
      const { user, tournament, guard } = await refereeMatch(ctx, params)
      const { card: stored } = await tournaments.findCard(
        params.tournamentId!,
        params.matchId!,
        params.cardId!,
      )
      if (stored.enteredBy !== 'referee') {
        throw forbidden('The organiser entered that card. Ask them to change it.')
      }

      await tournaments.removeCard(params.tournamentId!, params.matchId!, params.cardId!, {
        ...guard,
        authors: ['referee'],
      })

      await record(user, {
        action: 'card.remove',
        entity: 'match',
        entityId: `${params.tournamentId}/${params.matchId}`,
        summary: `Referee removed a card from a match of ${tournament.name}`,
        organizerId: tournament.organizerId,
      })
      return { ok: true }
    },
  )
}

/* ---------------- the rules ---------------- */

function assertIsReferee(user: AuthUser): void {
  if (user.role !== 'referee') throw forbidden('Only a referee can do that')
}

/**
 * The caller, the fixture, and the appointment that lets them write it.
 *
 * Decided from the competition's organiser's list and the appointment on the
 * fixture, both read now: an account carries nothing that says what it may
 * referee, so there is nothing on it to go stale.
 */
async function refereeMatch(
  ctx: RequestContext,
  params: Record<string, string | undefined>,
): Promise<{
  user: AuthUser
  tournament: Tournament
  organizer: Organizer
  match: Record<string, unknown>
  position: RefereePosition
  guard: EventGuard
}> {
  const user = await ctx.user()
  assertIsReferee(user)

  const tournament = await tournaments.getOrThrow(params.tournamentId!)
  const located = locateMatch(tournament, params.matchId!)
  if (!located) throw notFound('Match not found in this tournament')

  const organizer = await organizers.get(tournament.organizerId)
  const appointment = appointmentOf(organizer, located.match, user.id)
  if (!organizer || !appointment) throw forbidden('You are not appointed to this match')

  return {
    user,
    tournament,
    organizer,
    match: located.match,
    position: appointment.position,
    guard: { referee: { refereeId: appointment.referee.id, position: appointment.position } },
  }
}

/** Whether nobody has set a result yet. A score is a result only when both halves are numbers. */
function scoreIsEmpty(match: Record<string, unknown>): boolean {
  return typeof match.homeGoals !== 'number' && typeof match.awayGoals !== 'number'
}

/** Whether the score is the referee's to move: empty, or set by a referee and untouched since. */
export function scoreIsReferees(match: Record<string, unknown>): boolean {
  return scoreIsEmpty(match) || match.scoreEnteredBy === 'referee'
}

/** The author mark as read, in the form `EventGuard.scoreBy` asserts it. */
function scoreMark(match: Record<string, unknown>): 'referee' | null {
  return match.scoreEnteredBy === 'referee' ? 'referee' : null
}

function readScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 99) {
    throw badRequest('A score is two whole numbers from 0 to 99')
  }
  return value
}

/** A goal the referee may correct: theirs, or a club's. Never the organiser's. */
function assertRefereeMayCorrect(goal: Record<string, unknown>): void {
  if (goal.enteredBy === 'referee' || goal.enteredBy === 'club') return
  throw forbidden('The organiser entered that goal. Ask them to change it.')
}

/**
 * The players on a goal are ones that may be named for their sides.
 *
 * The scorer of an own goal plays for the side it did not count for, so that is
 * the squad they are checked against; the assist always belongs to the side the
 * goal counted for. Both clubs are read here and not taken from the request.
 */
async function assertRefereePlayers(
  fields: { team: Side; type: string; playerId: string; assistPlayerId?: string },
  tournament: Tournament,
  match: Record<string, unknown>,
): Promise<void> {
  const scorerSide: Side =
    fields.type === 'own_goal' ? (fields.team === 'home' ? 'away' : 'home') : fields.team
  if (fields.playerId) await assertNameable(fields.playerId, scorerSide, tournament, match)
  if (fields.assistPlayerId) await assertNameable(fields.assistPlayerId, fields.team, tournament, match)
}

async function assertRefereeBooking(
  fields: { team: Side; playerId: string },
  tournament: Tournament,
  match: Record<string, unknown>,
): Promise<void> {
  await assertNameable(fields.playerId, fields.team, tournament, match)
}

async function assertNameable(
  playerId: string,
  side: Side,
  tournament: Tournament,
  match: Record<string, unknown>,
): Promise<void> {
  const teamId = match[side === 'home' ? 'homeTeamId' : 'awayTeamId']
  const team = typeof teamId === 'string' ? await teams.get(teamId) : null
  if (!team || !nameableInMatch(tournament, team as Team, match, side).has(playerId)) {
    throw badRequest('That player is not registered for this competition. Reload the page and try again.')
  }
}

/**
 * Links an account to a referee record, and drops every other live link to it.
 *
 * Conditional on nobody having taken the record up in the meantime: two people
 * holding links to the same record - an organiser who sent the link twice - is
 * one record for whoever arrives first.
 */
async function linkReferee(
  organizer: Organizer,
  referee: Referee,
  user: AuthUser,
  invitedEmail: string,
): Promise<void> {
  // Still nobody's, and still at the address the invitation went to.
  const linked = await organizers.updateReferee(
    organizer.id,
    referee.id,
    { userId: user.id, linkedAtISO: new Date().toISOString() },
    { unlinked: true, email: invitedEmail },
  )
  if (!linked) throw badRequest('This referee has already been set up')
  await deleteRefereeInvites(organizer.id, referee.id)
  await record(user, {
    action: 'referee.claim',
    entity: 'organizer',
    entityId: organizer.id,
    summary: `${referee.name} set up their account to referee for ${organizer.name}`,
    organizerId: organizer.id,
  })
}

/** A fixture as the referee's screen reads it. Named fields, like every projection here. */
function refereeView(match: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of [
    'id',
    'homeTeamId',
    'awayTeamId',
    'dateISO',
    'time',
    'venue',
    'round',
    'isPlayoff',
    'homeGoals',
    'awayGoals',
    'scoreEnteredBy',
    'goals',
    'cards',
    'lineups',
    'status',
  ]) {
    if (match[field] !== undefined) out[field] = match[field]
  }
  return out
}

/** A club as the referee's screen needs it: a name, a crest and who is in the squad. */
function toRefereeTeam(team: Team): Record<string, unknown> {
  const players = Array.isArray(team.players)
    ? (team.players as Array<Record<string, unknown> | null>)
        .filter((player): player is Record<string, unknown> => Boolean(player) && typeof player === 'object')
        .map((player) => {
          const kept: Record<string, unknown> = {
            id: player.id,
            firstName: player.firstName,
            lastName: player.lastName,
          }
          if (player.number !== undefined) kept.number = player.number
          if (isArchivedPlayer({ archivedAt: player.archivedAt })) kept.archived = true
          return kept
        })
    : []
  return {
    id: team.id,
    name: team.name,
    logo: team.logo,
    colors: Array.isArray(team.colors) ? team.colors : [],
    crestColor: team.crestColor,
    players,
  }
}
