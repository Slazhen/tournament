import { ddb, PutCommand, QueryCommand } from './ddb.js'
import { TABLES } from './env.js'
import { badRequest } from './http.js'
import { generateId } from './passwords.js'
import type { AuditEntry, AuthUser, UserRole } from './types.js'

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

/**
 * Kinds of event, as the log screen offers them.
 *
 * An action is `<thing>.<verb>` and the groups are prefixes of it, so a new
 * action lands in a group without anybody remembering to add it here. `squad`
 * sits with entries rather than with clubs because a registration is the
 * competition's record, not the club's.
 */
export const AUDIT_GROUPS = {
  competitions: ['tournament.', 'playoffRound.', 'round.'],
  matches: ['match.', 'goal.', 'lineup.'],
  // `merge` is written by scripts/merge-teams.mjs, bare, on the club it kept.
  clubs: ['team.', 'player.', 'club.', 'merge'],
  entries: ['entry.', 'squad.'],
  organizers: ['organizer.'],
  accounts: ['account.'],
} as const

export type AuditGroup = keyof typeof AUDIT_GROUPS

const ROLES: readonly UserRole[] = ['super_admin', 'organizer', 'team_manager']

export type AuditFilter = {
  organizerId?: string
  tournamentId?: string
  actorId?: string
  /** Part of the author's address, lower-cased. */
  email?: string
  role?: UserRole
  group?: AuditGroup
  action?: string
  /** ISO timestamps; `from` inclusive, `to` exclusive. */
  from?: string
  to?: string
}

export type AuditPage = {
  entries: AuditEntry[]
  /** Where the next page starts, absent when the log has been read to the end. */
  cursor?: string
  /**
   * The oldest moment this request looked at. A filtered page can come back
   * short because the read budget ran out rather than because nothing older
   * matches, and the screen has to be able to say which.
   */
  searchedTo?: string
}

/** Page size, and how much of the log one request may read to fill it. */
const MAX_LIMIT = 200
const READ_PAGE = 250
const READ_BUDGET = 2500
/** A second bound on the loop, which must not rest on DynamoDB's counters alone. */
const MAX_QUERIES = 20

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/
/**
 * Wider than a record id: a script writes its lines as `script:<name>`, and the
 * screen offers every author on it as a filter. The value is bound, never
 * spliced, so the pattern is about refusing nonsense and not about safety.
 */
const ACTOR_PATTERN = /^[A-Za-z0-9_:.-]{1,100}$/
const ACTION_PATTERN = /^[A-Za-z_]+(\.[A-Za-z_]+)*$/

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw badRequest(`${name} must be a string`)
  return value.trim() || undefined
}

function optionalId(value: unknown, name: string, pattern = ID_PATTERN): string | undefined {
  const text = optionalString(value, name)
  if (text !== undefined && !pattern.test(text)) throw badRequest(`${name} is not an id`)
  return text
}

function optionalInstant(value: unknown, name: string): string | undefined {
  const text = optionalString(value, name)
  if (text === undefined) return undefined
  // Normalised rather than passed through: the value becomes a bound of a
  // string comparison against stored ISO timestamps, so "2026-09-01" and
  // "2026-09-01T00:00:00.000Z" must be the same thing by the time it is used.
  const time = Date.parse(text)
  if (!Number.isFinite(time)) throw badRequest(`${name} is not a date`)
  return new Date(time).toISOString()
}

/** Turns a query string into a filter, refusing anything it cannot read. */
export function parseAuditFilter(query: Record<string, unknown>): AuditFilter {
  const filter: AuditFilter = {
    organizerId: optionalId(query.organizerId, 'organizerId'),
    tournamentId: optionalId(query.tournamentId, 'tournamentId'),
    actorId: optionalId(query.actorId, 'actorId', ACTOR_PATTERN),
    from: optionalInstant(query.from, 'from'),
    to: optionalInstant(query.to, 'to'),
  }

  const email = optionalString(query.email, 'email')
  if (email !== undefined) {
    if (email.length > 200) throw badRequest('email is too long')
    // Addresses are stored lower-cased and `contains` is case-sensitive.
    filter.email = email.toLowerCase()
  }

  const role = optionalString(query.role, 'role')
  if (role !== undefined) {
    if (!ROLES.includes(role as UserRole)) throw badRequest('Unknown role')
    filter.role = role as UserRole
  }

  const group = optionalString(query.group, 'group')
  if (group !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(AUDIT_GROUPS, group)) throw badRequest('Unknown kind of event')
    filter.group = group as AuditGroup
  }

  const action = optionalString(query.action, 'action')
  if (action !== undefined) {
    if (action.length > 60 || !ACTION_PATTERN.test(action)) throw badRequest('Unknown action')
    filter.action = action
  }

  if (filter.from && filter.to && filter.from >= filter.to) {
    throw badRequest('The start of the range must be before its end')
  }

  for (const key of Object.keys(filter) as (keyof AuditFilter)[]) {
    if (filter[key] === undefined) delete filter[key]
  }
  return filter
}

/**
 * The parts of the query the filter decides.
 *
 * Every attribute name is aliased: `action` and `at` are both DynamoDB reserved
 * words, and `server/tests/expressions.test.ts` reads this file.
 */
export function buildAuditQuery(filter: AuditFilter): {
  KeyConditionExpression: string
  FilterExpression?: string
  ExpressionAttributeNames: Record<string, string>
  ExpressionAttributeValues: Record<string, unknown>
} {
  const names: Record<string, string> = { '#pk': 'pk' }
  const values: Record<string, unknown> = { ':pk': 'log' }
  let key = '#pk = :pk'

  // The time range is the sort key, so it narrows what is read and not only
  // what is returned. An `at` is "<iso>#<suffix>", which sorts after the bare
  // "<iso>": `from` therefore includes its own millisecond and `to` excludes
  // its own, which is the half-open range the screen asks for.
  if (filter.from || filter.to) {
    names['#at'] = 'at'
    if (filter.from && filter.to) {
      key += ' AND #at BETWEEN :from AND :to'
      values[':from'] = filter.from
      values[':to'] = filter.to
    } else if (filter.from) {
      key += ' AND #at >= :from'
      values[':from'] = filter.from
    } else {
      key += ' AND #at < :to'
      values[':to'] = filter.to
    }
  }

  const clauses: string[] = []

  if (filter.organizerId) {
    names['#organizerId'] = 'organizerId'
    values[':organizerId'] = filter.organizerId
    clauses.push('#organizerId = :organizerId')
  }

  // A competition is named by the line in two shapes: the tournament itself, or
  // "<tournamentId>/<matchId>" for anything written to one fixture.
  if (filter.tournamentId) {
    names['#entity'] = 'entity'
    names['#entityId'] = 'entityId'
    values[':tournamentEntity'] = 'tournament'
    values[':matchEntity'] = 'match'
    values[':tournamentId'] = filter.tournamentId
    values[':matchPrefix'] = `${filter.tournamentId}/`
    clauses.push(
      '((#entity = :tournamentEntity AND #entityId = :tournamentId) OR ' +
        '(#entity = :matchEntity AND begins_with(#entityId, :matchPrefix)))',
    )
  }

  if (filter.actorId) {
    names['#actorId'] = 'actorId'
    values[':actorId'] = filter.actorId
    clauses.push('#actorId = :actorId')
  }

  if (filter.email) {
    names['#actorEmail'] = 'actorEmail'
    values[':email'] = filter.email
    clauses.push('contains(#actorEmail, :email)')
  }

  if (filter.role) {
    names['#actorRole'] = 'actorRole'
    values[':role'] = filter.role
    clauses.push('#actorRole = :role')
  }

  if (filter.group) {
    names['#action'] = 'action'
    const prefixes = AUDIT_GROUPS[filter.group].map((prefix, index) => {
      values[`:group${index}`] = prefix
      return `begins_with(#action, :group${index})`
    })
    clauses.push(`(${prefixes.join(' OR ')})`)
  }

  if (filter.action) {
    names['#action'] = 'action'
    values[':action'] = filter.action
    clauses.push('#action = :action')
  }

  return {
    KeyConditionExpression: key,
    FilterExpression: clauses.length > 0 ? clauses.join(' AND ') : undefined,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }
}

/**
 * A cursor is the sort key of the last line handed out. It is opaque to the
 * browser but not secret: this route is the super admin's alone, and the
 * partition key is never taken from it.
 */
export function encodeCursor(at: string): string {
  return Buffer.from(at, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: unknown): string | undefined {
  if (cursor === undefined || cursor === null || cursor === '') return undefined
  if (typeof cursor !== 'string' || cursor.length > 200) throw badRequest('Bad cursor')
  const at = Buffer.from(cursor, 'base64url').toString('utf8')
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z(#[A-Za-z0-9]*)?$/.test(at)) throw badRequest('Bad cursor')
  return at
}

/**
 * One page of the log, newest first, with the filter applied.
 *
 * DynamoDB applies `Limit` before `FilterExpression`, so a filtered query asked
 * for a hundred lines can return none while there are matches further back.
 * This reads page after page until the answer is full or the budget is spent,
 * and when it stops part-way through a page it hands out the last line it
 * returned as the cursor — not the page's own `LastEvaluatedKey` — or the
 * lines after it on that page would never be shown.
 */
export async function search(
  filter: AuditFilter,
  options: { limit?: number; cursor?: string } = {},
): Promise<AuditPage> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 100) || 100, 1), MAX_LIMIT)
  const query = buildAuditQuery(filter)
  const entries: AuditEntry[] = []

  let startAt = options.cursor
  let read = 0
  let queries = 0
  let searchedTo: string | undefined

  // DynamoDB refuses a start key outside the key condition with a validation
  // error, which would reach the screen as a 500. A cursor from before the
  // range was changed has nothing left to find inside it.
  if (startAt && ((filter.from && startAt < filter.from) || (filter.to && startAt >= filter.to))) {
    return { entries }
  }

  while (read < READ_BUDGET && queries < MAX_QUERIES) {
    queries += 1
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLES.AUDIT,
        ...query,
        ScanIndexForward: false,
        Limit: Math.min(READ_PAGE, READ_BUDGET - read),
        ExclusiveStartKey: startAt ? { pk: 'log', at: startAt } : undefined,
      }),
    )
    read += result.ScannedCount || 1

    for (const item of (result.Items ?? []) as AuditEntry[]) {
      entries.push(item)
      if (entries.length === limit) {
        return { entries, cursor: encodeCursor(item.at), searchedTo: item.at }
      }
    }

    const last = result.LastEvaluatedKey?.at
    if (typeof last !== 'string') return { entries, searchedTo: undefined }
    startAt = last
    searchedTo = last
  }

  return { entries, cursor: startAt ? encodeCursor(startAt) : undefined, searchedTo }
}
