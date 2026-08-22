import { ddb, PutCommand, QueryCommand } from './ddb.js'
import { TABLES } from './env.js'
import { generateId } from './passwords.js'
import type { AuditEntry, AuthUser } from './types.js'

/**
 * The record of who changed what.
 *
 * A super admin can edit any organizer's tournament, and until now that was
 * indistinguishable from the organizer doing it themselves — which makes any
 * dispute about a changed result unanswerable. Every write now leaves a line.
 *
 * It is deliberately a summary, not a copy of the document: tournaments carry
 * every match they have, and storing before-and-after would multiply the size
 * of the database by the number of edits.
 */
export async function record(
  actor: AuthUser,
  entry: {
    action: string
    entity: string
    entityId: string
    summary?: string
    organizerId?: string
  },
): Promise<void> {
  const item: AuditEntry = {
    pk: 'log',
    at: `${new Date().toISOString()}#${generateId().slice(0, 8)}`,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    ...entry,
  }

  try {
    await ddb.send(new PutCommand({ TableName: TABLES.AUDIT, Item: item }))
  } catch (error) {
    // A failed audit write must never fail the request that caused it: losing a
    // log line is bad, losing an organizer's edit is worse.
    console.error('Audit write failed', error)
  }
}

/** The most recent entries, newest first. */
export async function recent(limit = 100): Promise<AuditEntry[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.AUDIT,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'log' },
      ScanIndexForward: false,
      Limit: Math.min(Math.max(limit, 1), 500),
    }),
  )
  return (result.Items ?? []) as AuditEntry[]
}
