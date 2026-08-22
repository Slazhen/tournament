import { ddb, DeleteCommand, GetCommand, PutCommand } from './ddb.js'
import { RESET_TTL_MS, TABLES } from './env.js'
import { generateToken } from './passwords.js'

/**
 * Password-reset tokens.
 *
 * A reset link is a password that arrives by email, so it behaves like one:
 * random, single use, and dead within the hour. The row carries a TTL as well,
 * so DynamoDB removes what the code has not.
 */

export type ResetToken = {
  token: string
  userId: string
  email: string
  expiresAt: string
  /** Epoch seconds, for the table's TTL. */
  expiresAtEpoch: number
  createdAt: string
  /** Who asked: the person themselves, or a super admin issuing a link by hand. */
  issuedBy: 'self' | 'admin'
}

export async function issueResetToken(
  user: { id: string; email?: string },
  issuedBy: 'self' | 'admin',
): Promise<ResetToken> {
  const expires = new Date(Date.now() + RESET_TTL_MS)

  const item: ResetToken = {
    token: generateToken(),
    userId: user.id,
    email: user.email ?? '',
    expiresAt: expires.toISOString(),
    expiresAtEpoch: Math.floor(expires.getTime() / 1000),
    createdAt: new Date().toISOString(),
    issuedBy,
  }

  await ddb.send(new PutCommand({ TableName: TABLES.PASSWORD_RESETS, Item: item }))
  return item
}

/**
 * Reads a token and deletes it in the same breath, so a link cannot be used
 * twice even if two requests arrive together.
 */
export async function consumeResetToken(token: string): Promise<ResetToken | null> {
  if (!token) return null

  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.PASSWORD_RESETS, Key: { token } }),
  )
  const found = result.Item as ResetToken | undefined
  if (!found) return null

  await ddb.send(new DeleteCommand({ TableName: TABLES.PASSWORD_RESETS, Key: { token } }))

  if (new Date(found.expiresAt).getTime() < Date.now()) return null
  return found
}
