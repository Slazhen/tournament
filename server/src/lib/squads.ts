import type { Team, Tournament } from './types.js'

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

/** The ids of the players the club actually has, as strings. */
export function squadPlayerIds(team: Team): Set<string> {
  const players = Array.isArray(team.players) ? team.players : []
  return new Set(
    players
      .map((player) =>
        player && typeof player === 'object' ? (player as { id?: unknown }).id : undefined,
      )
      .filter((id): id is string => typeof id === 'string'),
  )
}

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
