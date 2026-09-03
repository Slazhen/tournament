import type { Player, Team, Tournament } from '../types'
import { byShirtNumber } from './players'

/** Everything about a competition these functions need. */
type SquadRules = Pick<Tournament, 'squads' | 'squadsStrict'>

/**
 * Whether this club has been entered in this competition at all.
 *
 * Absent is not the same as empty, and only one of the two is a decision
 * somebody made: an empty list is a manager who ticked nobody, absence is a
 * manager who has not opened the screen. The two look identical to
 * `registeredPlayers` under a strict competition — both mean nobody may play —
 * but a screen that cannot tell them apart cannot ask the right club to act.
 */
export function hasSquadEntry(
  tournament: SquadRules | null | undefined,
  teamId: string | undefined,
): boolean {
  if (!tournament || !teamId) return false
  return Array.isArray(tournament.squads?.[teamId])
}

/**
 * Who a club has actually registered for one competition.
 *
 * A club's squad belongs to the club and travels with it; who is registered for
 * a particular competition does not. The selection lives on the competition,
 * keyed by club, and what a club absent from it means is the organiser's
 * choice: in an ordinary competition everybody is registered — which is what
 * every competition assumed before the field existed, so nothing shifts
 * underneath a club whose manager never opens the screen — and in a strict one
 * nobody is, because there the entry is the thing that lets a player play.
 *
 * The list is filtered from the club's current players either way, so a player
 * released since the entry was saved cannot come back through a stale id.
 */
export function registeredPlayers(
  tournament: SquadRules | null | undefined,
  team: Pick<Team, 'id' | 'players'> | null | undefined,
): Player[] {
  const players = team?.players ?? []
  if (!tournament || !team) return players

  const chosen = tournament.squads?.[team.id]
  if (!Array.isArray(chosen)) return tournament.squadsStrict === true ? [] : players

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
  tournament: SquadRules | null | undefined,
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

/**
 * The squad as one competition knew it: who is registered, plus anyone who
 * actually played for the club in it.
 *
 * The union is not decoration. An entry can be narrowed while a season is under
 * way — a player released in April is off the April list and still scored in
 * March — so the entry alone would drop a name the same page's own scorer table
 * still carries, and a visitor would be left looking for a player who is
 * demonstrably there. It is the rule the teamsheet already follows, for the
 * same reason: `nameableInMatch` on the server, `playersForPicking` here.
 *
 * `appeared` is worked out from the matches of that competition and nothing
 * else, so a player who only ever turned out for the club elsewhere does not
 * join this list.
 */
export function squadInTournament(
  tournament: SquadRules | null | undefined,
  team: Pick<Team, 'id' | 'players'> | null | undefined,
  appeared: string[],
): Player[] {
  return playersForPicking(tournament, team, ...appeared)
}

/**
 * Who this club named for this match, plus anyone already on the record being
 * edited.
 *
 * A goal or a booking is entered against the teamsheet and not against the
 * competition's registration: the person typing it in has the sheet in front of
 * them, and a picker holding every registered player is how the wrong name is
 * chosen. Anyone already named on the event stays in the list whatever the
 * sheet says — goals recorded before this rule, and sheets corrected after the
 * match, must not silently empty the field that names the scorer.
 *
 * An empty answer means nobody has filled the sheet in. The screens say so and
 * link to it rather than falling back to the whole squad, because falling back
 * is how the sheet stays empty.
 */
export function playersNamedInMatch(
  team: Pick<Team, 'players'> | null | undefined,
  lineup: { starting?: string[]; substitutes?: string[] } | null | undefined,
  ...alreadyNamed: Array<string | undefined>
): Player[] {
  const players = team?.players ?? []
  const named = new Set([...(lineup?.starting ?? []), ...(lineup?.substitutes ?? [])])

  const sheet = players.filter((player) => named.has(player.id)).sort(byShirtNumber)
  const extras = players.filter(
    (player) => !named.has(player.id) && alreadyNamed.includes(player.id),
  )

  return extras.length === 0 ? sheet : [...sheet, ...extras]
}
