#!/usr/bin/env node
/**
 * Every account in the system, printed as a table.
 *
 * There is no screen for this yet, and "who can sign in, and as what" is a
 * question worth being able to answer without guessing. Run it from your own
 * machine with your own AWS credentials:
 *
 *   node scripts/list-users.mjs
 *
 * Password hashes and salts are deliberately not fetched, let alone printed.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_USERS = process.env.TABLE_AUTH_USERS ?? 'football-tournaments-auth-users'
const TABLE_ORGANIZERS = process.env.TABLE_ORGANIZERS ?? 'football-tournaments-organizers'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

async function scanAll(TableName, ProjectionExpression, ExpressionAttributeNames) {
  const items = []
  let ExclusiveStartKey
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName,
        ProjectionExpression,
        ExpressionAttributeNames,
        ExclusiveStartKey,
      }),
    )
    items.push(...(page.Items ?? []))
    ExclusiveStartKey = page.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return items
}

const users = await scanAll(
  TABLE_USERS,
  'id, email, username, displayName, #role, organizerId, isActive, createdAt, teamIds',
  { '#role': 'role' },
)

const organizers = await scanAll(TABLE_ORGANIZERS, 'id, #name', { '#name': 'name' })
const organizerName = Object.fromEntries(organizers.map((o) => [o.id, o.name]))

const order = { super_admin: 0, organizer: 1, team_manager: 2 }
users.sort(
  (a, b) =>
    (order[a.role] ?? 9) - (order[b.role] ?? 9) || (a.email ?? '').localeCompare(b.email ?? ''),
)

const rows = users.map((user) => ({
  email: user.email ?? '—',
  name: user.displayName ?? user.username ?? '—',
  role: user.role ?? '(none)',
  belongsTo:
    user.role === 'team_manager'
      ? `${(user.teamIds ?? []).length} club(s)`
      : (organizerName[user.organizerId] ?? user.organizerId ?? '—'),
  active: user.isActive === false ? 'DISABLED' : 'yes',
  created: (user.createdAt ?? '').slice(0, 10),
}))

console.table(rows)

const superAdmins = users.filter((user) => user.role === 'super_admin')
console.log(`\n${users.length} account(s), ${superAdmins.length} super admin(s).`)

if (superAdmins.length === 0) {
  console.log('No super admin exists. Nobody can create accounts or reset passwords.')
} else {
  console.log(`Super admins: ${superAdmins.map((user) => user.email).join(', ')}`)
  if (superAdmins.length === 1) {
    console.log('Only one. The role has nobody above it to reset its password — make a second.')
  }
}

const noRole = users.filter((user) => !user.role)
if (noRole.length > 0) {
  console.log(
    `\n${noRole.length} account(s) have no role at all and cannot pass any permission check: ` +
      noRole.map((user) => user.email ?? user.id).join(', '),
  )
}
