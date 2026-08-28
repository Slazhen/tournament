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
 * down to the ones registered for this competition when a registration exists.
 * When none exists the answer is the organiser's to decide — everybody in an
 * ordinary competition, which is what every competition assumed before `squads`
 * was invented, and nobody in a strict one, where being entered is what lets a
 * player play at all.
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
  // `=== true`, not truthiness: the record is schemaless, and a stray value in
  // this field must not be able to close a competition nobody meant to close.
  const chosen = squads?.[team.id]
  if (!Array.isArray(chosen)) {
    return tournament.squadsStrict === true ? new Set<string>() : new Set(ids)
  }

  const registered = new Set(chosen.filter((id): id is string => typeof id === 'string'))
  return new Set(ids.filter((id) => registered.has(id)))
}

/**
 * Who may be named on one side of one match: the players registered for the
 * competition, plus anyone already stored on that teamsheet.
 *
 * The second half is what keeps a registration from eating history. An entry
 * can be narrowed after a match has been played — a club drops a player, an
 * organiser corrects a list — and the appearances of everyone dropped exist
 * nowhere but that teamsheet. Without this, the next save of that match, made
 * by somebody who only wanted to add a substitute, would quietly file it
 * without them.
 */
export function nameableInMatch(
  tournament: Tournament,
  team: Team,
  match: unknown,
  side: Side,
): Set<string> {
  const allowed = registeredPlayerIds(tournament, team)

  const lineups = (match as { lineups?: Record<string, unknown> } | null)?.lineups
  const stored = (lineups?.[side] as { starting?: unknown } | undefined)?.starting
  for (const id of Array.isArray(stored) ? stored : []) {
    if (typeof id === 'string') allowed.add(id)
  }

  return allowed
}

/**
 * The players the caller asked for who are in this club but may not be named.
 *
 * An id that belongs to no club at all stays out of this: it is a stale or
 * hand-made value, and refusing the whole save over one would cost an honest
 * caller their teamsheet. A real player of this club who is not registered is
 * the opposite — somebody looking at a screen that has gone out of date, who
 * needs to be told rather than quietly given a teamsheet without them.
 */
export function refusedByRegistration(
  requested: unknown,
  allowed: Set<string>,
  squad: Set<string>,
): string[] {
  const refused = new Set<string>()
  for (const id of Array.isArray(requested) ? requested : []) {
    if (typeof id === 'string' && squad.has(id) && !allowed.has(id)) refused.add(id)
  }
  return [...refused]
}

/**
 * The teamsheet as it will be stored: the ids the caller sent, in the order
 * they sent them, with anything unknown or repeated dropped.
 *
 * Filtered rather than rejected, because by the time this runs the ids that
 * would have been worth refusing have been refused above; what is left to drop
 * is an id belonging to no club, which is a hand-made request rather than a
 * mistake a manager can make on screen.
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
