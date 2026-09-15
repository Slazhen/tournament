import { badRequest } from './http.js'

/**
 * A punishment the organiser hands down, in points.
 *
 * A competition is not only played: a club that fields somebody it should not,
 * or does not turn up, loses points for it, and until now the only way to show
 * that in this application was to type a wrong score into a match that was
 * never played. So the deduction is its own record on the season, beside the
 * fixtures rather than inside them — nothing derived from a result reads it,
 * and it moves no goal difference, no scorer tally and no appearance.
 *
 * Always a deduction. A positive `points` is how many the club loses, and
 * there is no way to write a bonus: an organiser who can add points can undo
 * anything the pitch decided, and nobody has asked for that. `reason` is not
 * optional and it is public — a table that takes three points off a club
 * without saying why is a table its readers correct in the comments.
 */
export type PointDeduction = {
  id: string
  teamId: string
  /** How many points come off. A whole number, at least one. */
  points: number
  reason: string
  createdAtISO: string
}

/** As many as one season can hold: every one of them is read on every table. */
export const MAX_DEDUCTIONS = 50

const MAX_POINTS = 99
const MAX_REASON = 200

/**
 * One deduction, read from what a screen sent.
 *
 * It returns the record rather than approving what arrived, the way
 * `readShootout` and `readGoal` do: these records are schemaless, so a body
 * attested and then stored as it came keeps whatever else was sitting on it.
 */
export function composeDeduction(
  id: string,
  body: Record<string, unknown>,
  teamIds: string[],
): PointDeduction {
  const teamId = typeof body.teamId === 'string' ? body.teamId : ''
  if (!teamId) throw badRequest('Which club is being punished?')
  if (teamIds.length === 0 || !teamIds.includes(teamId)) {
    throw badRequest('That club does not play in this competition')
  }

  const points = body.points
  if (
    typeof points !== 'number' ||
    !Number.isInteger(points) ||
    points < 1 ||
    points > MAX_POINTS
  ) {
    throw badRequest(`Points deducted must be a whole number between 1 and ${MAX_POINTS}`)
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) throw badRequest('Say why the points were deducted — it is shown on the table')
  if (reason.length > MAX_REASON) {
    throw badRequest(`That reason is longer than ${MAX_REASON} characters`)
  }

  return { id, teamId, points, reason, createdAtISO: new Date().toISOString() }
}

/**
 * The same, on a body that carries the whole list.
 *
 * `POST /admin/tournaments` passes its body through, so a season can be created
 * with anything at all under this key while the routes that write one deduction
 * at a time refuse it. A validation that runs on the update and not on the
 * create has not been done — which is exactly how a colour of any shape went on
 * being stored here after the update route started refusing it.
 */
export function assertDeductionsInBody(body: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(body, 'pointDeductions')) return

  const list = body.pointDeductions
  // Nothing rather than a stored null: `null` is how a field is cleared here,
  // and a null left under this key is a value the append has to replace rather
  // than extend.
  if (list === undefined || list === null) {
    delete body.pointDeductions
    return
  }
  if (!Array.isArray(list)) throw badRequest('pointDeductions must be a list')
  if (list.length > MAX_DEDUCTIONS) {
    throw badRequest(`That is as many deductions as one season can hold (${MAX_DEDUCTIONS})`)
  }

  // The club list is the body's own, because the season does not exist yet. A
  // body that names no clubs can hold no punishments either: checking a club
  // against a list made from that same club is a check that passes for any id
  // in the system, including another organiser's.
  const teamIds = Array.isArray(body.teamIds)
    ? body.teamIds.filter((id): id is string => typeof id === 'string')
    : []

  const seen = new Set<string>()
  body.pointDeductions = list.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw badRequest('Each deduction must be a record')
    }
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : ''
    // The id is what the DELETE route addresses this record by, in a URL path
    // segment, and two deductions sharing one would be removed one call at a
    // time with both answering ok.
    if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
      throw badRequest('Each deduction needs an id of its own')
    }
    if (seen.has(id)) throw badRequest('Two deductions cannot share an id')
    seen.add(id)

    const composed = composeDeduction(id, record, teamIds)
    const stamped = record.createdAtISO
    const createdAtISO =
      typeof stamped === 'string' && !Number.isNaN(Date.parse(stamped))
        ? stamped
        : composed.createdAtISO
    return { ...composed, createdAtISO }
  })
}
