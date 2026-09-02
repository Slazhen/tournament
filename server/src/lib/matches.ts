import type { Tournament } from './types.js'

/**
 * Where one fixture sits inside a tournament record.
 *
 * A competition keeps its matches in two places. The generated draw and the
 * generated brackets are in `matches`; a round the organiser builds by hand —
 * which is every round of a `progressive_elimination` season — lives inside
 * `format.customPlayoffConfig.playoffRounds`. The routes that write one match
 * looked only in the first, so a playoff fixture had no result route, no
 * teamsheet route and no organiser's match screen: its score was edited by
 * rewriting the whole `format` object from the browser's copy, on every
 * keystroke.
 *
 * This does not move them. Two homes for one kind of record is a design problem
 * and moving them is a migration of live data; being able to find a match in
 * either place is what the writes actually need.
 */
export type MatchLocation = {
  /** The stored record, so a caller can merge onto it or read its teamsheet. */
  match: Record<string, unknown>
  /** The document path of that record, written with the aliases below. */
  path: string
  /**
   * Every alias `path` uses. Merge it into `ExpressionAttributeNames`.
   *
   * `format` and `matches` are both DynamoDB reserved words, and a path
   * assembled here is invisible to `expressions.test.ts` — a `${…}` is a value
   * as far as that check is concerned — so every segment is aliased whether it
   * needs to be or not.
   */
  names: Record<string, string>
}

const idOf = (value: unknown): unknown =>
  value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined

/**
 * The fixture with this id, wherever the competition stores it.
 *
 * Null when two fixtures carry the same id, and not the first of them. Ids of
 * hand-built rounds have been generated from the round number and the position
 * in it (`progressive_2_0_<teamId>`), and deleting a round does not renumber
 * the ones after it, so a competition can end up holding the id twice. Writing
 * to whichever came first would put a result or a teamsheet on the wrong match
 * and report success; a route that cannot tell them apart should refuse.
 */
export function locateMatch(tournament: Tournament, matchId: string): MatchLocation | null {
  const found: MatchLocation[] = []

  const matches = Array.isArray(tournament.matches) ? tournament.matches : []
  matches.forEach((match, index) => {
    if (idOf(match) !== matchId) return
    found.push({
      match: match as Record<string, unknown>,
      path: `#matches[${index}]`,
      names: { '#matches': 'matches' },
    })
  })

  const format = tournament.format as Record<string, unknown> | undefined
  const config = format?.customPlayoffConfig as Record<string, unknown> | undefined
  const rounds = config?.playoffRounds

  if (Array.isArray(rounds)) {
    rounds.forEach((round, roundIndex) => {
      const inRound = (round as { matches?: unknown } | null)?.matches
      if (!Array.isArray(inRound)) return

      inRound.forEach((match, position) => {
        if (idOf(match) !== matchId) return
        found.push({
          match: match as Record<string, unknown>,
          path: `#format.#playoffConfig.#playoffRounds[${roundIndex}].#matches[${position}]`,
          names: {
            '#format': 'format',
            '#playoffConfig': 'customPlayoffConfig',
            '#playoffRounds': 'playoffRounds',
            '#matches': 'matches',
          },
        })
      })
    })
  }

  return found.length === 1 ? found[0] : null
}
