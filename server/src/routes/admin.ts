import { ddb, PutCommand, DeleteCommand, UpdateCommand } from '../lib/ddb.js'
import { TABLES } from '../lib/env.js'
import { badRequest, notFound } from '../lib/http.js'
import { assertCanAccessOrganizer, assertSuperAdmin, isSuperAdmin } from '../lib/auth.js'
import {
  assertPasswordStrength,
  generateId,
  generateSalt,
  hashPassword,
} from '../lib/passwords.js'
import { deleteAllUserSessions } from '../lib/sessions.js'
import { toPublicUser, type AuthUser } from '../lib/types.js'
import { organizers, teams, tournaments } from '../repos.js'
import { findUserByCredential } from './auth.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'

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

export function registerAdminRoutes(router: Router<RequestContext>): void {
  /* ---------------- listings (include private data) ---------------- */

  router.get('/admin/organizers', async (ctx) => {
    const user = await ctx.user()
    const all = await organizers.list()
    return isSuperAdmin(user) ? all : all.filter((o) => o.id === user.organizerId)
  })

  router.get('/admin/teams', async (ctx) => {
    const user = await ctx.user()
    if (isSuperAdmin(user)) return teams.listAll()
    return teams.listByOrganizer(user.organizerId ?? '')
  })

  router.get('/admin/tournaments', async (ctx) => {
    const user = await ctx.user()
    if (isSuperAdmin(user)) return tournaments.listAll()
    return tournaments.listByOrganizer(user.organizerId ?? '')
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

  router.delete('/admin/organizers/:id', async (ctx, params) => {
    assertSuperAdmin(await ctx.user())
    await organizers.remove(params.id!)
    return { ok: true }
  })

  /* ---------------- teams ---------------- */

  router.post('/admin/teams', async (ctx) => {
    const user = await ctx.user()
    const organizerId = resolveOrganizerId(user, ctx.body.organizerId)
    const name = requireString(ctx.body.name, 'name')
    return teams.create({ ...ctx.body, name, organizerId })
  })

  router.patch('/admin/teams/:id', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    assertCanAccessOrganizer(user, team.organizerId)
    // A team cannot be moved to another organizer by a non-super-admin.
    const updates = { ...ctx.body }
    if (!isSuperAdmin(user)) delete updates.organizerId
    await teams.update(params.id!, updates)
    return { ok: true }
  })

  router.delete('/admin/teams/:id', async (ctx, params) => {
    const user = await ctx.user()
    const team = await teams.get(params.id!)
    if (!team) throw notFound('Team not found')
    assertCanAccessOrganizer(user, team.organizerId)
    await teams.remove(params.id!)
    return { ok: true }
  })

  /* ---------------- tournaments ---------------- */

  router.post('/admin/tournaments', async (ctx) => {
    const user = await ctx.user()
    const organizerId = resolveOrganizerId(user, ctx.body.organizerId)
    const name = requireString(ctx.body.name, 'name')
    return tournaments.create({ ...ctx.body, name, organizerId })
  })

  router.patch('/admin/tournaments/:id', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    await tournaments.update(params.id!, ctx.body)
    return { ok: true }
  })

  router.delete('/admin/tournaments/:id', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.id!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    await tournaments.remove(params.id!)
    return { ok: true }
  })

  router.patch('/admin/tournaments/:tournamentId/matches/:matchId', async (ctx, params) => {
    const user = await ctx.user()
    const tournament = await tournaments.getOrThrow(params.tournamentId!)
    assertCanAccessOrganizer(user, tournament.organizerId)
    await tournaments.updateMatch(params.tournamentId!, params.matchId!, ctx.body)
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
    const organizerId = requireString(ctx.body.organizerId, 'organizerId')
    const password = ctx.body.password

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
      role: 'organizer',
      organizerId,
      passwordHash: await hashPassword(password as string, salt),
      salt,
      createdAt: new Date().toISOString(),
      isActive: true,
    }

    await ddb.send(new PutCommand({ TableName: TABLES.AUTH_USERS, Item: user }))
    return toPublicUser(user)
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
    return { ok: true }
  })

  router.delete('/admin/accounts/:email', async (ctx, params) => {
    assertSuperAdmin(await ctx.user())
    const target = await findUserByCredential(params.email!.toLowerCase())
    if (!target) throw notFound('Account not found')

    await deleteAllUserSessions(target.id)
    await ddb.send(new DeleteCommand({ TableName: TABLES.AUTH_USERS, Key: { id: target.id } }))
    return { ok: true }
  })
}
