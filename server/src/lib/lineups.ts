import type { Team, Tournament } from './types.js'

export type Side = 'home' | 'away'

/**
 * Which side of a fixture a club is playing on, or null if it is not in it.
 *
 * The side is worked out from the fixture rather than taken from the request.
 * A manager may only write their own half of a match, so letting the caller
 * name the side would be letting them name somebody else's — the club id is
 * the thing their permissions were checked against, and this turns it into a
 * position in the record.
 */
export function sideOfTeam(match: unknown, teamId: string): Side | null {
  if (!match || typeof match !== 'object') return null
  const { homeTeamId, awayTeamId } = match as { homeTeamId?: unknown; awayTeamId?: unknown }
  if (homeTeamId === teamId) return 'home'
  if (awayTeamId === teamId) return 'away'
  return null
}

/**
 * Who this club is allowed to name in this competition.
 *
 * The same rule as `src/utils/squads.ts` on the site, kept here because the
 * server cannot take the browser's word for it: the club's own players, cut
 * down to the ones registered for this competition when a registration exists,
 * and everybody when it does not — which is what every competition assumed
 * before `squads` was invented.
 *
 * Starting from the club's players rather than from the stored registration
 * also drops anyone released since it was saved, so a squad list nobody has
 * revisited cannot put a player who has left back on a teamsheet.
 */
export function registeredPlayerIds(tournament: Tournament, team: Team): Set<string> {
  const players = Array.isArray(team.players) ? team.players : []
  const ids = players
    .map((player) =>
      player && typeof player === 'object' ? (player as { id?: unknown }).id : undefined,
    )
    .filter((id): id is string => typeof id === 'string')

  const squads =
    tournament.squads && typeof tournament.squads === 'object'
      ? (tournament.squads as Record<string, unknown>)
      : undefined
  const chosen = squads?.[team.id]
  if (!Array.isArray(chosen)) return new Set(ids)

  const registered = new Set(chosen.filter((id): id is string => typeof id === 'string'))
  return new Set(ids.filter((id) => registered.has(id)))
}

/**
 * The teamsheet as it will be stored: the ids the caller sent, in the order
 * they sent them, with anything unknown or repeated dropped.
 *
 * Filtered rather than rejected. The picker only ever offers registered
 * players, so an id outside the list is a hand-made request rather than a
 * mistake a manager can make on screen, and refusing the whole save would cost
 * an honest caller their teamsheet over one stale id.
 */
export function pickLineup(requested: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(requested)) return []

  const seen = new Set<string>()
  const chosen: string[] = []
  for (const id of requested) {
    if (typeof id !== 'string' || seen.has(id) || !allowed.has(id)) continue
    seen.add(id)
    chosen.push(id)
  }
  return chosen
}
