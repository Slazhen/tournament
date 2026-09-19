import { badRequest } from './http.js'
import { activePlayerIds } from './players.js'
import type { Tournament } from './types.js'

/**
 * Entering a club in a competition, decided in one place.
 *
 * Two callers write this: the club's own manager and the organiser running the
 * competition. They have different permissions and different deadlines, but the
 * meaning of the list they save is the competition's, not the caller's, so it
 * is settled here rather than twice — the same reason `sideOfTeam` lives beside
 * this file rather than in the two routes that call it.
 *
 * Kept free of any database access so that both routes can do their own reads,
 * their own conditions and their own audit lines around it.
 */

/**
 * The ids of the players the club actually has, as strings.
 *
 * Archived players are not among them, which is what keeps "everyone is in"
 * from quietly re-entering somebody the club took off its books — and, in a
 * strict competition, from storing their id in an entry that is the thing
 * letting a player play.
 */
export const squadPlayerIds = activePlayerIds

export type SquadChoice = {
  /** Who the caller has entered, after unknown and repeated ids are dropped. */
  playerIds: string[]
  /** What to store: null removes the entry and leaves the competition's default to speak. */
  store: string[] | null
  /** Whether that is the club's whole squad, for the audit line and the reply. */
  all: boolean
}

/**
 * What the caller asked for, turned into what gets stored.
 *
 * The ids are filtered against the club's real squad rather than rejected: an
 * id from outside it is a hand-made request, and refusing the whole save would
 * cost an honest caller their entry over one stale name.
 *
 * The interesting part is the empty entry. In an ordinary competition "everyone
 * is in" is stored as no entry at all, because the two are the same statement
 * and storing the weaker one keeps a club that signs somebody next week from
 * quietly being a player short. In a strict competition they are different
 * statements — an entry is what lets a player play, so the list has to be
 * stored exactly as it was saved, and a signing made after the deadline stays
 * out until somebody enters them.
 */
export function chooseSquad(
  requested: unknown,
  known: Set<string>,
  strict: boolean,
): SquadChoice {
  const seen = new Set<string>()
  const playerIds: string[] = []
  for (const id of Array.isArray(requested) ? requested : []) {
    if (typeof id !== 'string' || seen.has(id) || !known.has(id)) continue
    seen.add(id)
    playerIds.push(id)
  }

  const all = playerIds.length === known.size
  return { playerIds, store: !strict && all ? null : playerIds, all }
}

/** Whether this competition's rules are the strict ones. Written once, read from route and client alike. */
export const isStrict = (tournament: Tournament): boolean => tournament.squadsStrict === true

/**
 * The largest squad limit a competition may set.
 *
 * A ceiling on the field rather than a recommendation: ninety-nine is the
 * highest shirt number this application accepts, so a limit above it is a limit
 * on nothing, and a number with no ceiling at all is a field somebody types a
 * date into.
 */
export const MAX_SQUAD_LIMIT = 99

/**
 * How many players this competition lets one club register, or null for no cap.
 *
 * Read the way `isStrict` is, and for the same reason: `POST
 * /admin/tournaments` passes its body through, so anything at all can be
 * sitting under this key, and a stray value must not become a rule that refuses
 * every entry in the season. Anything that is not a whole number in range reads
 * as no limit, which is what every competition meant before the field existed.
 */
export function squadLimitOf(tournament: Tournament): number | null {
  const limit = tournament.squadLimit
  if (typeof limit !== 'number' || !Number.isInteger(limit)) return null
  return limit >= 1 && limit <= MAX_SQUAD_LIMIT ? limit : null
}

/**
 * The limit an organiser asked for, read off a request body.
 *
 * Null is how it is taken off again, the same convention as every other
 * clearable field here. A bad shape is refused rather than ignored: this one
 * arrives from a form with a number in it, and silently storing nothing would
 * leave the organiser looking at a competition they believe they have capped.
 */
export function readSquadLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SQUAD_LIMIT
  ) {
    throw badRequest(`A squad limit is a whole number between 1 and ${MAX_SQUAD_LIMIT}`)
  }
  return value
}

/**
 * Refuses an entry longer than the competition allows.
 *
 * It binds both people who may write an entry, the club's manager and the
 * organiser, which is the one way it differs from `squadsLocked`. That is a
 * deadline the organiser sets for the managers and keeps a key to; this is a
 * rule of the competition, and an organiser who needs a nineteenth player
 * raises the number rather than working round it — otherwise "eighteen players
 * per club" means eighteen for everybody except the person who wrote it down.
 *
 * A club already over the limit when it was set keeps its entry: nothing here
 * rewrites what a club registered, and the screens mark it. What it cannot do
 * is save again without coming down to the limit, which is the only moment this
 * rule can be applied without deciding for somebody else who gets cut.
 */
export function assertWithinSquadLimit(count: number, tournament: Tournament): void {
  const limit = squadLimitOf(tournament)
  if (limit === null || count <= limit) return
  throw badRequest(
    `This competition registers at most ${limit} players per club, and that entry names ${count}`,
  )
}

/**
 * The same, on a body that carries the field itself.
 *
 * `POST /admin/tournaments` passes its body through and the `PATCH` refuses the
 * field outright, so this is the only way a season can be created carrying one
 * — the same arrangement as `assertDeductionsInBody`, and written because a
 * validation that runs on the update and not on the create has not been done.
 *
 * A limit under the open rule is a rule that does not hold: a club absent from
 * `squads` plays its whole squad whatever number is stored beside it. So a
 * season created with a limit has to be created with the registration list on,
 * rather than with a cap that quietly means nothing.
 */
export function assertSquadLimitInBody(body: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(body, 'squadLimit')) return

  const limit = readSquadLimit(body.squadLimit)
  if (limit === null) {
    delete body.squadLimit
    return
  }
  if (body.squadsStrict !== true) {
    throw badRequest(
      'A squad limit only holds where the competition registers its players — set squadsStrict as well',
    )
  }
  body.squadLimit = limit
}
