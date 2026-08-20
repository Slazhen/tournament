#!/usr/bin/env node
/**
 * Sets an account's password directly in DynamoDB.
 *
 * This exists because there is no longer any way to create or reset an account
 * from the browser. The old app bootstrapped a super admin with the password
 * "123" from a public page; anyone who found the endpoint could use it.
 *
 * Run it from your own machine with your own AWS credentials:
 *
 *   node scripts/set-password.mjs --user Slazhen --password 'a real password'
 *   node scripts/set-password.mjs --email org@example.com --password '...'
 *
 * Type the password inside single quotes so the shell does not expand it, and
 * remember it will land in your shell history — clear it afterwards if that
 * matters to you.
 */

import { randomBytes, pbkdf2 as pbkdf2Callback } from 'node:crypto'
import { promisify } from 'node:util'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'

const pbkdf2 = promisify(pbkdf2Callback)

const TABLE_USERS = process.env.TABLE_AUTH_USERS ?? 'football-tournaments-auth-users'
const TABLE_SESSIONS = process.env.TABLE_AUTH_SESSIONS ?? 'football-tournaments-auth-sessions'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    if (key) args[key] = argv[i + 1]
  }
  return args
}

const { user: username, email, password } = parseArgs(process.argv.slice(2))

if (!password || (!username && !email)) {
  console.error('Usage: node scripts/set-password.mjs (--user <username> | --email <email>) --password <password>')
  process.exit(1)
}

if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
  console.error('Refusing: the password must be at least 12 characters and mix letters and digits.')
  process.exit(1)
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

const lookup = username
  ? {
      IndexName: 'username-index',
      KeyConditionExpression: 'username = :value',
      ExpressionAttributeValues: { ':value': username },
    }
  : {
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :value',
      ExpressionAttributeValues: { ':value': email.toLowerCase() },
    }

const found = await ddb.send(new QueryCommand({ TableName: TABLE_USERS, ...lookup, Limit: 1 }))
const account = found.Items?.[0]

if (!account) {
  console.error(`No account found for ${username ?? email}`)
  process.exit(1)
}

// Same parameters the API uses, so the new hash verifies there.
const salt = randomBytes(32).toString('hex')
const passwordHash = (await pbkdf2(password, salt, 100_000, 64, 'sha512')).toString('hex')

await ddb.send(
  new UpdateCommand({
    TableName: TABLE_USERS,
    Key: { id: account.id },
    UpdateExpression: 'SET passwordHash = :hash, salt = :salt',
    ExpressionAttributeValues: { ':hash': passwordHash, ':salt': salt },
  }),
)

// Any session issued against the old password is void from here.
const sessions = await ddb.send(
  new QueryCommand({
    TableName: TABLE_SESSIONS,
    IndexName: 'user-sessions-index',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': account.id },
  }),
)

for (const session of sessions.Items ?? []) {
  await ddb.send(new DeleteCommand({ TableName: TABLE_SESSIONS, Key: { id: session.id } }))
}

console.log(
  `Password updated for ${account.username ?? account.email} (role: ${account.role}). ` +
    `${sessions.Items?.length ?? 0} existing session(s) revoked.`,
)
