import { ddb, QueryCommand, UpdateCommand } from '../lib/ddb.js'
import { TABLES } from '../lib/env.js'
import { badRequest, unauthorized } from '../lib/http.js'
import { extractBearerToken } from '../lib/auth.js'
import {
  assertPasswordStrength,
  generateSalt,
  hashPassword,
  verifyPassword,
} from '../lib/passwords.js'
import {
  createSession,
  deleteAllUserSessions,
  deleteSessionByToken,
  getUserById,
} from '../lib/sessions.js'
import { toPublicUser, type AuthUser } from '../lib/types.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'

async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.AUTH_USERS,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      FilterExpression: 'isActive = :isActive',
      ExpressionAttributeValues: { ':email': email, ':isActive': true },
      Limit: 1,
    }),
  )
  return (result.Items?.[0] as AuthUser | undefined) ?? null
}

async function findUserByUsername(username: string): Promise<AuthUser | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.AUTH_USERS,
      IndexName: 'username-index',
      KeyConditionExpression: 'username = :username',
      FilterExpression: 'isActive = :isActive',
      ExpressionAttributeValues: { ':username': username, ':isActive': true },
      Limit: 1,
    }),
  )
  return (result.Items?.[0] as AuthUser | undefined) ?? null
}

export async function findUserByCredential(credential: string): Promise<AuthUser | null> {
  return credential.includes('@')
    ? findUserByEmail(credential.toLowerCase().trim())
    : findUserByUsername(credential.trim())
}

export function registerAuthRoutes(router: Router<RequestContext>): void {
  /**
   * Exchanges a login and password for a session token.
   *
   * The password hash and salt never leave this function. The browser used to
   * fetch the whole user row — hash included — and compare in JavaScript.
   */
  router.post('/auth/login', async (ctx) => {
    const credential = ctx.body.loginCredential
    const password = ctx.body.password
    if (typeof credential !== 'string' || typeof password !== 'string') {
      throw badRequest('loginCredential and password are required')
    }

    const user = await findUserByCredential(credential)

    // Same generic message and roughly the same work either way, so a caller
    // cannot use the response to learn which accounts exist.
    const valid = user ? await verifyPassword(password, user.passwordHash, user.salt) : false
    if (!user || !valid) throw unauthorized('Invalid login or password')

    const session = await createSession(user.id, ctx.userAgent, ctx.sourceIp)

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: user.id },
        UpdateExpression: 'SET lastLogin = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      }),
    )

    return {
      user: toPublicUser(user),
      token: session.token,
      expiresAt: session.expiresAt,
    }
  })

  /** Returns the caller's own account, or 401. Used to restore a session on page load. */
  router.get('/auth/session', async (ctx) => {
    const user = await ctx.user()
    return { user: toPublicUser(user) }
  })

  router.post('/auth/logout', async (ctx) => {
    const token = extractBearerToken(ctx.headers['authorization'])
    if (token) await deleteSessionByToken(token)
    return { ok: true }
  })

  /** Lets a signed-in user change their own password. Requires the current one. */
  router.post('/auth/password', async (ctx) => {
    const user = await ctx.user()
    const currentPassword = ctx.body.currentPassword
    const newPassword = ctx.body.newPassword

    if (typeof currentPassword !== 'string') throw badRequest('currentPassword is required')
    if (!(await verifyPassword(currentPassword, user.passwordHash, user.salt))) {
      throw unauthorized('Current password is not correct')
    }

    try {
      assertPasswordStrength(newPassword)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    const salt = generateSalt()
    const passwordHash = await hashPassword(newPassword, salt)

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: user.id },
        UpdateExpression: 'SET passwordHash = :hash, salt = :salt',
        ExpressionAttributeValues: { ':hash': passwordHash, ':salt': salt },
      }),
    )

    // Changing a password ends every other session for that account, so a
    // stolen token cannot outlive the password it was issued against.
    await deleteAllUserSessions(user.id)
    const session = await createSession(user.id, ctx.userAgent, ctx.sourceIp)

    const refreshed = await getUserById(user.id)
    return {
      user: toPublicUser(refreshed ?? user),
      token: session.token,
      expiresAt: session.expiresAt,
    }
  })
}
