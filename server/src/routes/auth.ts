import { ddb, QueryCommand, UpdateCommand } from '../lib/ddb.js'
import { SITE_URL, TABLES } from '../lib/env.js'
import { badRequest, unauthorized } from '../lib/http.js'
import { consumeResetToken, issueResetToken } from '../lib/resets.js'
import { sendPasswordReset } from '../lib/mail.js'
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

/**
 * The login is the email address, and only the email address.
 *
 * Accounts could also sign in with a username, which meant two ways into the
 * same account, two indexes to keep honest and two places for a mistake to
 * hide. Old accounts keep their username as a label; it no longer opens a door.
 */
export async function findUserByCredential(credential: string): Promise<AuthUser | null> {
  const email = credential.toLowerCase().trim()
  if (!email.includes('@')) return null
  return findUserByEmail(email)
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
  /**
   * Starts a password reset.
   *
   * The answer is the same whether or not the address is registered: telling a
   * stranger which emails have accounts is a gift to whoever is guessing.
   */
  router.post('/auth/forgot', async (ctx) => {
    const email = typeof ctx.body.email === 'string' ? ctx.body.email.toLowerCase().trim() : ''
    if (!email.includes('@')) throw badRequest('A valid email address is required')

    const user = await findUserByEmail(email)
    if (user) {
      const reset = await issueResetToken(user, 'self')
      await sendPasswordReset(email, `${SITE_URL}/reset-password?token=${reset.token}`)
    }

    return { ok: true }
  })

  /** Finishes it: the link, plus the new password. */
  router.post('/auth/reset', async (ctx) => {
    const token = typeof ctx.body.token === 'string' ? ctx.body.token : ''
    const password = ctx.body.password

    try {
      assertPasswordStrength(password)
    } catch (error) {
      throw badRequest((error as Error).message)
    }

    const reset = await consumeResetToken(token)
    if (!reset) throw badRequest('This link has expired or has already been used')

    const user = await getUserById(reset.userId)
    if (!user || !user.isActive) throw badRequest('This account is no longer active')

    const salt = generateSalt()
    const passwordHash = await hashPassword(password as string, salt)

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.AUTH_USERS,
        Key: { id: user.id },
        UpdateExpression: 'SET passwordHash = :hash, salt = :salt',
        ExpressionAttributeValues: { ':hash': passwordHash, ':salt': salt },
      }),
    )

    // Whoever was signed in with the old password is signed out. A reset is
    // most often used because someone else might have had the account.
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
