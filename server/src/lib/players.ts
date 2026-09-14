import type { Team } from './types.js'

/**
 * Whether a player has been taken off the club's books.
 *
 * A player is archived rather than deleted, and the reason is that the element
 * inside `players` is the only place their name lives. Every goal, every card
 * and every teamsheet in the system names a player by id and by nothing else,
 * so deleting the record left all of that where it was and made it anonymous:
 * "Former player" in the scorer table, "Unknown player" on the match page, and
 * nothing anywhere to put the name back. Archiving takes the player out of the
 * squad, out of every entry and out of every picker, and keeps the one thing
 * the history needs.
 */
export function isArchivedPlayer(player: unknown): boolean {
  if (!player || typeof player !== 'object') return false
  const archivedAt = (player as { archivedAt?: unknown }).archivedAt
  return typeof archivedAt === 'string' && archivedAt !== ''
}

/**
 * The ids of the players a club still has.
 *
 * A hole is dropped as it is everywhere else — `null` sits in `players` on
 * records from the browser-side era — and so is anyone archived. Every question
 * about who may be entered in a competition or named on a teamsheet starts
 * here, so an archived player cannot be added to either. Anyone already on a
 * teamsheet stays on it: that is `nameableInMatch`'s union and not this
 * function's business, and it is what keeps archiving from eating an
 * appearance.
 *
 * `allPlayerIds` above is the club's whole list, archive included. It is what
 * `refusedByRegistration` is given, so that a screen naming somebody the club
 * has archived is told to reload rather than quietly filed without them.
 */
export function allPlayerIds(team: Team): Set<string> {
  const players = Array.isArray(team.players) ? team.players : []
  return new Set(
    players
      .map((player) =>
        player && typeof player === 'object' ? (player as { id?: unknown }).id : undefined,
      )
      .filter((id): id is string => typeof id === 'string'),
  )
}

export function activePlayerIds(team: Team): Set<string> {
  const players = Array.isArray(team.players) ? team.players : []
  return new Set(
    players
      .filter((player) => Boolean(player) && typeof player === 'object' && !isArchivedPlayer(player))
      .map((player) => (player as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string'),
  )
}
