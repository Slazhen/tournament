import type { Player, Team, Tournament } from '../types'

/**
 * Who a club has actually registered for one competition.
 *
 * A club's squad belongs to the club and travels with it; who is registered for
 * a particular competition does not. The selection lives on the competition,
 * keyed by club, and a club that is absent from it has everybody registered —
 * which is what every competition assumed before the field existed, so nothing
 * shifts underneath a club whose manager never opens the screen.
 */
export function registeredPlayers(
  tournament: Pick<Tournament, 'squads'> | null | undefined,
  team: Pick<Team, 'id' | 'players'> | null | undefined,
): Player[] {
  const players = team?.players ?? []
  if (!tournament || !team) return players

  const chosen = tournament.squads?.[team.id]
  if (!chosen) return players

  const registered = new Set(chosen)
  return players.filter((player) => registered.has(player.id))
}

/**
 * The same list, plus anyone already named in the thing being edited.
 *
 * A goal scored in March by a player taken off the squad list in April is still
 * a goal that player scored. Dropping them from the picker would leave the
 * field looking empty and invite somebody to "fix" it by picking the wrong
 * name, so they stay in the list until the record itself is changed.
 */
export function playersForPicking(
  tournament: Pick<Tournament, 'squads'> | null | undefined,
  team: Pick<Team, 'id' | 'players'> | null | undefined,
  ...alreadyNamed: Array<string | undefined>
): Player[] {
  const registered = registeredPlayers(tournament, team)
  const have = new Set(registered.map((player) => player.id))

  const extras = (team?.players ?? []).filter(
    (player) => !have.has(player.id) && alreadyNamed.includes(player.id),
  )

  return extras.length === 0 ? registered : [...registered, ...extras]
}
