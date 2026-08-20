import { ddb, DeleteCommand, GetCommand, PutCommand, QueryCommand } from './ddb.js'
import { SESSION_TTL_MS, TABLES } from './env.js'
import { generateId, generateToken } from './passwords.js'
import type { AuthSession, AuthUser } from './types.js'

export async function createSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<AuthSession> {
  const session: AuthSession = {
    id: generateId(),
    userId,
    token: generateToken(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
    userAgent,
    ipAddress,
  }

  await ddb.send(new PutCommand({ TableName: TABLES.AUTH_SESSIONS, Item: session }))
  return session
}

export function isExpired(session: AuthSession): boolean {
  return new Date(session.expiresAt).getTime() < Date.now()
}

export async function findSessionByToken(token: string): Promise<AuthSession | null> {
  if (!token) return null

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.AUTH_SESSIONS,
      IndexName: 'token-index',
      KeyConditionExpression: '#token = :token',
      ExpressionAttributeNames: { '#token': 'token' },
      ExpressionAttributeValues: { ':token': token },
      Limit: 1,
    }),
  )

  const session = result.Items?.[0] as AuthSession | undefined
  if (!session) return null

  // An expired row is deleted on sight rather than just ignored, so stale
  // sessions do not sit in the table forever waiting to be stolen.
  if (isExpired(session)) {
    await deleteSessionById(session.id)
    return null
  }

  return session
}

export async function deleteSessionById(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.AUTH_SESSIONS, Key: { id } }))
}

export async function deleteSessionByToken(token: string): Promise<void> {
  const session = await findSessionByToken(token)
  if (session) await deleteSessionById(session.id)
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.AUTH_SESSIONS,
      IndexName: 'user-sessions-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }),
  )

  await Promise.all(
    (result.Items ?? []).map((item) => deleteSessionById((item as AuthSession).id)),
  )
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const result = await ddb.send(new GetCommand({ TableName: TABLES.AUTH_USERS, Key: { id } }))
  return (result.Item as AuthUser | undefined) ?? null
}
