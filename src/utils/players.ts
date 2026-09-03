import type { Player } from '../types'

/**
 * A player as the person typing in a match sheet sees them.
 *
 * The shirt number comes first because that is what the sheet in front of them
 * is ordered by: somebody reading "9" off a scoresheet should not have to know
 * the name to find the row.
 */
export function playerLabel(
  player: Pick<Player, 'firstName' | 'lastName' | 'number'>,
): string {
  const name = `${player.firstName} ${player.lastName}`.trim()
  return typeof player.number === 'number' ? `${player.number} ${name}` : name
}

/**
 * Squad order: by shirt number where there is one, everybody else after them by
 * surname. A comparator, so nothing here sorts an array it does not own.
 */
export function byShirtNumber(a: Player, b: Player): number {
  const one = typeof a.number === 'number' ? a.number : Number.POSITIVE_INFINITY
  const two = typeof b.number === 'number' ? b.number : Number.POSITIVE_INFINITY
  if (one !== two) return one - two
  return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
}
