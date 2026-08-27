import { ddb, PutCommand, DeleteCommand, UpdateCommand, scanAll } from '../lib/ddb.js'
import { TABLES } from '../lib/env.js'
import { badRequest, notFound } from '../lib/http.js'
import {
  assertCanAccessOrganizer,
  assertManagesTeam,
  assertSuperAdmin,
  isSuperAdmin,
} from '../lib/auth.js'
import {
  assertPasswordStrength,
  generateId,
  generateSalt,
  hashPassword,
} from '../lib/passwords.js'
import { deleteAllUserSessions } from '../lib/sessions.js'
import { toPublicUser, type AuthUser, type Team } from '../lib/types.js'
import { organizers, teams, tournaments } from '../repos.js'
import {
  deleteEntriesForTournament,
  deleteInvitesOfOrganizer,
  linkManagerToTeam,
  unlinkManagerFromTeam,
} from '../repos-clubs.js'
import { findUserByCredential } from './auth.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'
import { record, recent } from '../lib/audit.js'
import { invalidate } from '../lib/cache.js'
import { issueResetToken } from '../lib/resets.js'
import { SITE_URL } from '../lib/env.js'
import { sendPasswordReset } from '../lib/mail.js'

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${field} is required`)
  }
  return value.trim()
}

/**
 * The organizer a write is being made against.
 *
 * An organizer may only name their own id; the super admin may name any. This
 * is what stops one organizer from creating or editing another's data — a check
 * that simply did not exist while the browser held write credentials.
 */
function resolveOrganizerId(user: AuthUser, requested: unknown): string {
  if (isSuperAdmin(user)) return requireString(requested, 'organizerId')
  const own = user.organizerId
  if (!own) throw badRequest('This account is not linked to an organizer')
  if (typeof requested === 'string' && requested && requested !== own) {
    assertCanAccessOrganizer(user, requested)
  }
  return own
}


/**
 * The fields of a club anyone may edit through the API.
 *
 * A whitelist rather than a blacklist: the club record is schemaless, so
 * anything not named here would otherwise be persisted on it by whoever asked.
 */
const TEAM_FIELDS = [
  'name',
  'colors',
  'logo',
  'photo',
  'socialMedia',
  'establishedDate',
  'players',
] as const

function pick(body: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) out[field] = body[field]
  }
  return out
}

/**
 * Every login that administers one organizer.
 *
 * A scan rather than a query: the accounts table is indexed by email, which is
 * the only thing anybody signs in with, and it holds a handful of rows. An
 * index on `organizerId` would cost more to keep than this read costs to run.
 */
async function accountsOfOrganizer(organizerId: string): Promise<AuthUser[]> {
  const all = await scanAll<AuthUser>(TABLES.AUTH_USERS)
  return all.filter((account) => account.organizerId === organizerId)
}

/** A club's manager as the organizer who owns the club may see them. */
type ClubManager = {
  id: string
  email: string
  displayName?: string
  isActive: boolean
  /** Absent for clubs claimed before the date was recorded. */
  linkedAt?: string
}

/**
 * Who runs each of these clubs.
 *
 * `managerUserIds` is the list permissions are decided from, so it is the list
 * read here — the account's own `teamIds` is the same link written from the
 * other side, and showing the organizer a manager the server would not actually
 * let through would be worse than showing none.
 *
 * One scan of the accounts table for the whole set rather than a read per id: a
 * competition has twenty-odd clubs, and the table holds a handful of rows.
 */
async function managersOfTeams(list: Team[]): Promise<Record<string, ClubManager[]>> {
  const wanted = new Set<string>()
  for (const team of list) for (const id of team.managerUserIds ?? []) wanted.add(id)

  const byId = new Map<string, AuthUser>()
  if (wanted.size > 0) {
    for (const account of await scanAll<AuthUser>(TABLES.AUTH_USERS)) {
      if (wanted.has(account.id)) byId.set(account.id, account)
    }
  }

  const out: Record<string, ClubManager[]> = {}
  for (const team of list) {
    out[team.id] = (team.managerUserIds ?? [])
      .map((id): ClubManager => {
        const account = byId.get(id)
        // A link to an account that no longer exists is worth saying out loud:
        // it is the club nobody can edit and nobody can see why.
        if (!account) {
          return { id, email: '', isActive: false, linkedAt: team.managerLinkedAt?.[id] }
        }
        return {
          id: account.id,
          // Accounts old enough to predate email logins have a username and no
          // address. They are still the people running the club, so they are
          // listed; the organizer simply has nothing to write to.
          email: account.email ?? '',
          displayName: account.displayName,
          isActive: account.isActive !== false,
          linkedAt: team.managerLinkedAt?.[id],
        }
      })
      .sort((a, b) => (a.linkedAt ?? '').localeCompare(b.linkedAt ?? ''))
  }
  return out
}

export function registerAdminRoutes(router: Router<RequestContext>): void {
  /* ---------------- listings (include private data) ---------------- */

  router.get('/admin/organizers', async (ctx) => {
    const user = await ctx.user()
    const all = await organizers.list()
    return isSuperAdmin(user) ? all : all.filter((o) => o.id === user.organizerId)
  })

  // A team manager belongs to no organizer, and DynamoDB rejects an empty key
  // value — so asking anyway turned their first admin request into a 500
  // instead of the empty list it means.
  router.get('/admin/teams', async (ctx) => {
    const user = await ctx.user()
    if (isSuperAdmin(user)) return teams.listAll()
    return user.organizerId ? teams.listByOrganizer(user.organizerId) : []
  })

  router.get('/admin/tournaments', async (ctx) => {
    const user = await ctx.user()
    if (isSuperAdmin(user)) return tournaments.listAll()
    return user.organizerId ? tournaments.listByOrganizer(user.organizerId) : []
  })

  router.get('/admin/tournaments/:id', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    return tournament
  })

  /* ---------------- organizers ---------------- */

  router.post('/admin/organizers', async (ctx) => {
    assertSuperAdmin(await ctx.user())
    const name = requireString(ctx.body.name, 'name')
    const email = requireString(ctx.body.email, 'email').toLowerCase()
    return organizers.create({ name, email })
  })

  router.patch('/admin/organizers/:id', async (ctx, params) => {
    const user = await ctx.user()
    assertCanAccessOrganizer(user, params.id!)
    const existing = await organizers.get(params.id!)
    if (!existing) throw notFound('Organizer not found')
    await organizers.update(params.id!, ctx.body)
    return { ok: true }
  })

  /**
   * What deleting this organizer would take with it.
   *
   * The confirmation has to say more than "are you sure": the competitions go,
   * the clubs do not, and the logins stop working. The page asking the question
   * holds none of that, so the server counts it.
   */
  router.get('/admin/organizers/:id/impact', async (ctx, params) => {
    assertSuperAdmin(await ctx.user())
    const id = params.id!
    if (!(await organizers.get(id))) throw notFound('Organizer not found')

    // Read past the cache, exactly as the delete does. Answering this one from
    // a stale copy is worse than answering it slowly: the operator would be
    // agreeing to a smaller deletion than the one that happens.
    invalidate(`tournaments:organizer:${id}`)
    invalidate(`teams:organizer:${id}`)

    const [ownTournaments, ownTeams, accounts] = await Promise.all([
      tournaments.listByOrganizer(id),
      teams.listByOrganizer(id),
      accountsOfOrganizer(id),
    ])

    return {
      tournaments: ownTournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
      })),
      teams: ownTeams.map((team) => ({ id: team.id, name: team.name })),
      accounts: accounts.map((account) => account.email),
    }
  })

  /**
   * Deletes an organizer and everything that only makes sense alongside it.
   *
   * A competition belongs to whoever runs it and goes with them. A club does
   * not: it has its own managers, its own squad and a life longer than any one
   * league, so it is moved to another organizer named by the caller rather than
   * deleted. Deleting the organizer row alone — all this route used to do — left
   * both behind, owned by nobody and still listed on the public site, and the
   * organizer's login still worked.
   *
   * The order is deliberate and every step is idempotent: clubs are moved to
   * safety first, the organizer row goes last, and a request that fails halfway
   * can simply be repeated. There is no cross-table transaction to lean on.
   */
  router.delete('/admin/organizers/:id', async (ctx, params) => {
    const actor = await ctx.user()
    assertSuperAdmin(actor)
    const id = params.id!
    const organizer = await organizers.get(id)
    if (!organizer) throw notFound('Organizer not found')

    // These two lists decide what gets deleted and what gets moved, so they
    // are read past the cache. The listings live in the Lambda's memory and a
    // write made by another warm container does not invalidate this copy: a
    // competition created a minute ago could be missing from it and would
    // survive as an orphan, which is the whole bug this route exists to stop.
    // The index behind them is eventually consistent, so something created in
    // the last second can still be missed; `scripts/delete-orphans.mjs` is the
    // net underneath.
    invalidate(`tournaments:organizer:${id}`)
    invalidate(`teams:organizer:${id}`)

    const [ownTournaments, ownTeams] = await Promise.all([
      tournaments.listByOrganizer(id),
      teams.listByOrganizer(id),
    ])

    const teamsTo = typeof ctx.query?.teamsTo === 'string' ? ctx.query.teamsTo.trim() : ''
    if (ownTeams.length > 0) {
      if (!teamsTo) {
        throw badRequest(
          `${ownTeams.length} ${ownTeams.length === 1 ? 'club belongs' : 'clubs belong'} to this organizer. Name the organizer to move them to.`,
        )
      }
      if (teamsTo === id) throw badRequest('Clubs cannot be moved to the organizer being deleted')
      if (!(await organizers.get(teamsTo))) {
        throw badRequest('The organizer the clubs would move to does not exist')
      }
    }

    for (const team of ownTeams) {
      await teams.update(team.id, { organizerId: teamsTo })
    }

    for (const tournament of ownTournaments) {
      await deleteEntriesForTournament(tournament.id)
      await tournaments.remove(tournament.id)
    }

    // An invitation is a door into a club, and it outlives the organizer that
    // wrote it by a fortnight unless it goes now.
    const invitesDeleted = await deleteInvitesOfOrganizer(id)

    // Every login attached to this organizer, not only the one matching its
    // contact address. The interface used to delete the account by email in a
    // second request of its own, which failed with "Account not found" whenever
    // the addresses had drifted apart — and left the account able to sign in.
    //
    // Never a super admin, and never the caller: the role has nobody above it
    // to recreate it, and an organizerId on such an account would be a mistake
    // in the data rather than a licence to delete the keys to the building.
    const accounts = (await accountsOfOrganizer(id)).filter(
      (account) => account.role !== 'super_admin' && account.id !== actor.id,
    )
    for (const account of accounts) {
      await deleteAllUserSessions(account.id)
      await ddb.send(new DeleteCommand({ TableName: TABLES.AUTH_USERS, Key: { id: account.id } }))
    }

    await organizers.remove(id)

    await record(actor, {
      action: 'organizer.delete',
      entity: 'organizer',
      entityId: id,
      // Where the clubs went belongs in here. `teamsTo` is any organizer id the
      // caller names, so a mistyped one that happens to exist hands somebody
      // else a league's worth of clubs, and this line is the only way back to
      // finding out where they are.
      summary:
        `Deleted ${organizer.name}: ${ownTournaments.length} ${ownTournaments.length === 1 ? 'competition' : 'competitions'}` +
        `, ${accounts.length} ${accounts.length === 1 ? 'login' : 'logins'}` +
        `, ${invitesDeleted} ${invitesDeleted === 1 ? 'invitation' : 'invitations'}` +
        (ownTeams.length > 0 ? `, ${ownTeams.length} clubs moved to ${teamsTo}` : ''),
      organizerId: id,
    })

    return {
      ok: true,
      tournamentsDeleted: ownTournaments.length,
      teamsMoved: ownTeams.length,
      accountsDeleted: accounts.length,
      invitesDeleted,
    }
  })

  /* ---------------- teams ---------------- */

  router.post('/admin/teams', async (ctx) => {
    const user = await ctx.user()
    const organizerId = resolveOrganizerId(user, ctx.body.organizerId)
    const name = requireString(ctx.body.name, 'name')
    const team = await teams.create({ ...ctx.body, name, organizerId })
    await record(user, {
      action: 'team.create',
      entity: 'team',
      entityId: (team as { id?: string }).id ?? '',
      summary: `Created the team ${name}`,
      organizerId,
    })
    return team
  })

  router.patch('/admin/teams/:id', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    assertManagesTeam(user, team)
    // A named list rather than whatever arrived. Passing the body straight
    // through wrote any attribute a caller invented onto the club, and put its
    // key names verbatim into the audit log the super admin reads.
    //
    // Two absences are deliberate. `organizerId`: a club is not moved between
    // organizers by editing it. `managerUserIds`: who runs a club is decided by
    // invitation, and a manager able to write that field could hand the club to
    // anyone or quietly remove the others.
    const updates = pick(ctx.body, TEAM_FIELDS)
    if (isSuperAdmin(user) && typeof ctx.body.organizerId === 'string') {
      updates.organizerId = ctx.body.organizerId
    }
    if (Object.keys(updates).length === 0) throw badRequest('Nothing to change')
    await teams.update(params.id!, updates)
    await record(user, {
      action: 'team.update',
      entity: 'team',
      entityId: params.id!,
      summary: `Edited ${team.name}: ${describeFields(updates)}`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  /**
   * Takes somebody off a club.
   *
   * Without this a manager, once linked, was there forever: `PATCH` refuses to
   * write `managerUserIds`, so a coach who left — or one who used a leaked
   * invitation — kept full control of the club and the only remedy was deleting
   * their whole account. This is the organizer's to do, not a manager's: the
   * managers of a club should not be able to remove each other.
   */
  /**
   * Who runs one club, for the organizer who owns it.
   *
   * Deliberately its own route rather than a field on the club: the club record
   * goes to the public projection and to the manager's own overview, and an
   * email address belongs in neither. Here the caller has already had to prove
   * they run the competition the club plays in.
   */
  router.get('/admin/teams/:id/managers', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, team.organizerId)
    const byTeam = await managersOfTeams([team as Team])
    return byTeam[team.id] ?? []
  })

  /**
   * The same, for every club in one competition.
   *
   * The organizer's question is "which of these clubs has somebody running it",
   * and asking it a club at a time is twenty requests and twenty scans.
   */
  router.get('/admin/tournaments/:id/managers', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)

    const list = await teams.getMany(tournament.teamIds ?? [])
    // A club another organizer owns can be playing here; its manager's address
    // is that organizer's to show, not this one's.
    const own = (list as Team[]).filter(
      (team) => isSuperAdmin(user) || team.organizerId === tournament.organizerId,
    )
    return managersOfTeams(own)
  })

  /**
   * An organizer taking their own club under management.
   *
   * Some organizers run a club as well as the competition, and the only way in
   * was to issue themselves an invitation and open the link — a one-time token
   * emailed nowhere, used to grant a permission they already had the standing
   * to grant. This is the same write without the detour.
   *
   * It is the organizer's own test, not the club's: whoever owns the club may
   * take it on, and nobody else. A club manager pressing this on somebody
   * else's club is exactly the write `PATCH` refuses to make.
   */
  router.post('/admin/teams/:id/managers/me', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, team.organizerId)

    await linkManagerToTeam(user, team as Team)
    await record(user, {
      action: 'team.manager.self',
      entity: 'team',
      entityId: team.id,
      summary: `Took ${team.name} under their own management`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  router.delete('/admin/teams/:id/managers/:userId', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, team.organizerId)

    await unlinkManagerFromTeam(params.userId!, team as Team)
    await record(user, {
      action: 'team.manager.remove',
      entity: 'team',
      entityId: params.id!,
      summary: `Removed a manager from ${team.name}`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  router.delete('/admin/teams/:id', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    assertCanAccessOrganizer(user, team.organizerId)
    await teams.remove(params.id!)
    await record(user, {
      action: 'team.delete',
      entity: 'team',
      entityId: params.id!,
      summary: `Deleted the team ${team.name}`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  /* ---------------- players ---------------- */

  /**
   * Players live inside their team's record, but they are edited one at a time.
   * These three routes exist so the client never has to send the whole squad
   * back to save one field.
   */
  router.post('/admin/teams/:id/players', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertManagesTeam(user, team)

    const player = await teams.addPlayer(params.id!, {
      firstName: typeof ctx.body.firstName === 'string' ? ctx.body.firstName : '',
      lastName: typeof ctx.body.lastName === 'string' ? ctx.body.lastName : '',
      position: typeof ctx.body.position === 'string' ? ctx.body.position : '',
      number: typeof ctx.body.number === 'number' ? ctx.body.number : undefined,
      isPublic: ctx.body.isPublic !== false,
    })
    await record(user, {
      action: 'player.create',
      entity: 'team',
      entityId: params.id!,
      summary: `Added a player to ${team.name}`,
      organizerId: team.organizerId,
    })
    return player
  })

  router.patch('/admin/teams/:id/players/:playerId', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertManagesTeam(user, team)

    const updates = { ...ctx.body }
    // The id is the anchor for the targeted write; it is never a field to change.
    delete updates.id
    delete updates.createdAtISO

    const player = await teams.updatePlayer(params.id!, params.playerId!, updates)
    await record(user, {
      action: 'player.update',
      entity: 'team',
      entityId: params.id!,
      summary: `Edited a player of ${team.name}: ${describeFields(updates)}`,
      organizerId: team.organizerId,
    })
    return player
  })

  router.delete('/admin/teams/:id/players/:playerId', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.getOrThrow(params.id!)
    assertManagesTeam(user, team)

    await teams.removePlayer(params.id!, params.playerId!)
    await record(user, {
      action: 'player.delete',
      entity: 'team',
      entityId: params.id!,
      summary: `Removed a player from ${team.name}`,
      organizerId: team.organizerId,
    })
    return { ok: true }
  })

  /* ---------------- tournaments ---------------- */

  router.post('/admin/tournaments', async (ctx) => {
    const user = await ctx.user()
    const organizerId = resolveOrganizerId(user, ctx.body.organizerId)
    const name = requireString(ctx.body.name, 'name')
    const tournament = await tournaments.create({ ...ctx.body, name, organizerId })
    await record(user, {
      action: 'tournament.create',
      entity: 'tournament',
      entityId: (tournament as { id?: string }).id ?? '',
      summary: `Created ${name}`,
      organizerId,
    })
    return tournament
  })

  router.patch('/admin/tournaments/:id', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    await tournaments.update(params.id!, ctx.body)
    await record(user, {
      action: 'tournament.update',
      entity: 'tournament',
      entityId: params.id!,
      summary: `Edited ${tournament.name}: ${describeFields(ctx.body)}`,
      organizerId: tournament.organizerId,
    })
    return { ok: true }
  })

  router.delete('/admin/tournaments/:id', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    await tournaments.remove(params.id!)
    await record(user, {
      action: 'tournament.delete',
      entity: 'tournament',
      entityId: params.id!,
      summary: `Deleted ${tournament.name}`,
      organizerId: tournament.organizerId,
    })
    return { ok: true }
  })

  router.patch('/admin/tournaments/:tournamentId/matches/:matchId', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    await tournaments.updateMatch(params.tournamentId!, params.matchId!, ctx.body)
    await record(user, {
      action: 'match.update',
      entity: 'match',
      entityId: `${params.tournamentId}/${params.matchId}`,
      summary: describeMatchEdit(ctx.body, tournament.name),
      organizerId: tournament.organizerId,
    })
    return { ok: true }
  })

  /* ---------------- accounts (super admin only) ---------------- */

  /**
   * Creates the login for an organizer.
   *
   * The caller must supply a real password. The old version defaulted every new
   * account — and the super admin itself — to "123".
   */
  router.post('/admin/accounts', async (ctx) => {
    assertSuperAdmin(await ctx.user())
    const email = requireString(ctx.body.email, 'email').toLowerCase()
    const password = ctx.body.password
    const displayName =
      typeof ctx.body.displayName === 'string' ? ctx.body.displayName.trim() : undefined
    // A second super admin is not a luxury: the role has nobody above it to
    // reset its password, so one account means one lost password from disaster.
    const role: AuthUser['role'] = ctx.body.role === 'super_admin' ? 'super_admin' : 'organizer'
    const organizerId =
      role === 'super_admin'
        ? undefined
        : requireString(ctx.body.organizerId, 'organizerId')

    try {
      assertPasswordStrength(password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    if (await findUserByCredential(email)) {
      throw badRequest('An account with this email already exists')
    }

    const salt = generateSalt()
    const user: AuthUser = {
      id: generateId(),
      email,
      displayName,
      role,
      organizerId,
      passwordHash: await hashPassword(password as string, salt),
      salt,
      createdAt: new Date().toISOString(),
      isActive: true,
    }

    await ddb.send(new PutCommand({ TableName: TABLES.AUTH_USERS, Item: user }))
    await record(await ctx.user(), {
      action: 'account.create',
      entity: 'account',
      entityId: email,
      summary: `Created a ${role.replace('_', ' ')} account`,
      organizerId,
    })
    return toPublicUser(user)
  })

  /**
   * A reset link the super admin can pass on by hand.
   *
   * Until email is out of the SES sandbox this is how anyone but the owner of a
   * verified address gets back in — and it stays useful afterwards, for the
   * person who cannot find the message.
   */
  router.post('/admin/accounts/reset-link', async (ctx) => {
    const actor = await ctx.user()
    assertSuperAdmin(actor)
    const email = requireString(ctx.body.email, 'email').toLowerCase()

    const target = await findUserByCredential(email)
    if (!target) throw notFound('Account not found')

    const reset = await issueResetToken(target, 'admin')
    const link = `${SITE_URL}/reset-password?token=${reset.token}`
    const mail = ctx.body.send === true ? await sendPasswordReset(email, link) : { sent: false }

    await record(actor, {
      action: 'account.reset_link',
      entity: 'account',
      entityId: email,
      summary: mail.sent ? 'Sent a reset link by email' : 'Issued a reset link',
      organizerId: target.organizerId,
    })

    return { link, expiresAt: reset.expiresAt, emailed: mail.sent }
  })

  /** The record of who changed what. */
  router.get('/admin/audit', async (ctx) => {
    assertSuperAdmin(await ctx.user())
    const limit = Number(ctx.query?.limit ?? 100)
    return recent(Number.isFinite(limit) ? limit : 100)
  })

  router.post('/admin/accounts/reset-password', async (ctx) => {
    assertSuperAdmin(await ctx.user())
    const email = requireString(ctx.body.email, 'email').toLowerCase()
    const password = ctx.body.password

    try {
      assertPasswordStrength(password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    const target = await findUserByCredential(email)
    if (!target) throw notFound('Account not found')

    const salt = generateSalt()
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: target.id },
        UpdateExpression: 'SET passwordHash = :hash, salt = :salt',
        ExpressionAttributeValues: {
          ':hash': await hashPassword(password as string, salt),
          ':salt': salt,
        },
      }),
    )
    await deleteAllUserSessions(target.id)
    await record(await ctx.user(), {
      action: 'account.set_password',
      entity: 'account',
      entityId: email,
      summary: 'Set a new password directly',
      organizerId: target.organizerId,
    })
    return { ok: true }
  })

  router.delete('/admin/accounts/:email', async (ctx, params) => {
    const actor = await ctx.user()
    assertSuperAdmin(actor)
    const target = await findUserByCredential(params.email!.toLowerCase())
    if (!target) throw notFound('Account not found')

    await deleteAllUserSessions(target.id)
    await ddb.send(new DeleteCommand({ TableName: TABLES.AUTH_USERS, Key: { id: target.id } }))
    await record(actor, {
      action: 'account.delete',
      entity: 'account',
      entityId: params.email!.toLowerCase(),
      summary: 'Deleted the account',
      organizerId: target.organizerId,
    })
    return { ok: true }
  })
}

/** "name, visibility" — enough to know what was touched, without storing it. */
function describeFields(updates: Record<string, unknown>): string {
  const fields = Object.keys(updates).filter((key) => key !== 'id')
  if (fields.length === 0) return 'nothing'
  return fields.slice(0, 6).join(', ') + (fields.length > 6 ? ` and ${fields.length - 6} more` : '')
}

/** A score change is the one edit people come back to argue about. */
function describeMatchEdit(updates: Record<string, unknown>, tournamentName: string): string {
  const home = updates.homeGoals
  const away = updates.awayGoals
  if (typeof home === 'number' || typeof away === 'number') {
    return `Set the score to ${home ?? '-'}:${away ?? '-'} in ${tournamentName}`
  }
  return `Edited a match of ${tournamentName}: ${describeFields(updates)}`
}
