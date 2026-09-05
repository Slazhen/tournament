import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

/**
 * One document client for the whole Lambda. Credentials come from the function's
 * execution role, so there is nothing to configure here.
 */
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

export { BatchGetCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand }

/**
 * Reads an entire table, following pagination to the end.
 *
 * `fields` narrows what comes back. A scan with no projection pulls every
 * attribute of every row into Lambda memory, which on the accounts table means
 * every password hash and salt — read to find one display name, and read on a
 * path an organiser can trigger. Nothing goes out, because the routes project
 * what they return; the point is not holding it in the first place. The names
 * are aliased, since an ordinary word like `name` or `status` is a reserved
 * word in an expression.
 */
export async function scanAll<T>(tableName: string, fields?: readonly string[]): Promise<T[]> {
  const items: T[] = []
  let lastEvaluatedKey: Record<string, unknown> | undefined

  const projection = fields?.length
    ? {
        ProjectionExpression: fields.map((field) => `#${field}`).join(', '),
        ExpressionAttributeNames: Object.fromEntries(fields.map((field) => [`#${field}`, field])),
      }
    : {}

  do {
    const result = await ddb.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastEvaluatedKey, ...projection }),
    )
    if (result.Items) items.push(...(result.Items as T[]))
    lastEvaluatedKey = result.LastEvaluatedKey
  } while (lastEvaluatedKey)

  return items
}

/**
 * Every row a query matches, not just the first megabyte of them.
 *
 * A Query stops at 1 MB and says so only in `LastEvaluatedKey`. The
 * `organizerId-index` reads project the whole record — and a tournament carries
 * all of its matches — so one organizer's second season can already fall off
 * the end of the first page. A listing that quietly loses rows is bad; deleting
 * an organizer from one is worse, because whatever the query missed becomes an
 * orphan nobody can reach.
 */
export async function queryAll<T>(input: {
  TableName: string
  IndexName?: string
  KeyConditionExpression: string
  ExpressionAttributeValues: Record<string, unknown>
}): Promise<T[]> {
  const items: T[] = []
  let lastEvaluatedKey: Record<string, unknown> | undefined

  do {
    const result = await ddb.send(
      new QueryCommand({ ...input, ExclusiveStartKey: lastEvaluatedKey }),
    )
    if (result.Items) items.push(...(result.Items as T[]))
    lastEvaluatedKey = result.LastEvaluatedKey
  } while (lastEvaluatedKey)

  return items
}

/** Fetches many items by primary key, in the 100-key batches DynamoDB allows. */
export async function batchGetByIds<T>(tableName: string, ids: string[]): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return []

  const items: T[] = []
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    let keys = chunk.map((id) => ({ id }))

    // BatchGetItem may return only part of a batch; the rest comes back as
    // UnprocessedKeys and has to be retried or those items silently go missing.
    while (keys.length > 0) {
      const result = await ddb.send(
        new BatchGetCommand({ RequestItems: { [tableName]: { Keys: keys } } }),
      )
      const returned = result.Responses?.[tableName] as T[] | undefined
      if (returned) items.push(...returned)
      keys = (result.UnprocessedKeys?.[tableName]?.Keys ?? []) as { id: string }[]
    }
  }

  return items
}

/**
 * Builds a DynamoDB UPDATE expression from a partial object.
 *
 * Every attribute name is aliased through ExpressionAttributeNames because
 * DynamoDB reserves a long list of words (including `location`, `format`,
 * `matches` and `status`, all of which this schema uses).
 */
export function buildUpdate(updates: Record<string, unknown>, immutable: string[] = ['id']) {
  const setParts: string[] = []
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}
  let index = 0

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue
    if (immutable.includes(key)) continue
    const nameKey = `#u${index}`
    const valueKey = `:u${index}`
    names[nameKey] = key
    values[valueKey] = value
    setParts.push(`${nameKey} = ${valueKey}`)
    index++
  }

  if (setParts.length === 0) return null

  return {
    UpdateExpression: `SET ${setParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }
}
