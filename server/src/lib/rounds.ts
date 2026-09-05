import type { Tournament } from './types.js'

/**
 * Rounds a competition has not announced yet, and what the public gets instead.
 *
 * An organiser draws the whole season at once but does not always want it read
 * that far ahead: next week's pairings can depend on a result that has not been
 * played, or simply be theirs to announce on the day. So a round can be marked
 * hidden, and every fixture in it leaves the API as nothing but "there is a
 * game here" — no clubs, no date, no kick-off, not even an id to open.
 *
 * Two flags, because a round has two homes and neither is an entity of its own.
 * A league round is a number on the fixtures (`match.round`), so the season
 * carries `hiddenRounds`, the numbers it is keeping back. A hand-built playoff
 * round is a record, so it carries `hidden` itself.
 *
 * Redacting here rather than in the pages is the whole point: `/public/*`
 * returns tournaments to anyone who asks, and a fixture list left in the answer
 * is published whatever the page chooses to draw.
 */

type Fixture = Record<string, unknown>

const isRecord = (value: unknown): value is Fixture =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * A score counts only when it is a number. `!== undefined` counts an unplayed
 * fixture, which here would mean redacting a result the table already shows.
 */
const isPlayed = (match: Fixture): boolean =>
  typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'

/** The league rounds this season is keeping back. */
export function hiddenLeagueRounds(tournament: Tournament): Set<number> {
  const stored = (tournament as { hiddenRounds?: unknown }).hiddenRounds
  if (!Array.isArray(stored)) return new Set<number>()
  return new Set(stored.filter((round): round is number => Number.isInteger(round)))
}

/**
 * What is left of a fixture nobody may see yet: the round it belongs to, and
 * the fact that it exists.
 *
 * The id goes with everything else. Ids of hand-built rounds have been
 * assembled out of the round number and a club id — `progressive_2_0_<teamId>`
 * — so returning one would name a club the round is hiding, and a fixture the
 * public may not read has no page to be addressed at either.
 */
function redact(match: Fixture): Fixture {
  const projected: Fixture = { hidden: true }
  // The fields that say where the fixture belongs in the fixture list and
  // nothing about who is in it. Without the division and the group, a hidden
  // playoff tie of a `groups_with_divisions` season falls into Division 1 and
  // the page draws a game in a bracket it is not part of.
  for (const field of ['round', 'isPlayoff', 'playoffRound', 'division', 'groupIndex'] as const) {
    if (match[field] !== undefined) projected[field] = match[field]
  }
  return projected
}

/**
 * A fixture of a round that is being held back.
 *
 * A played one is published whatever the round says: the table, the scorers and
 * the club pages are all counted in the browser from the matches in this
 * answer, so a withheld result would not read as "not announced" — it would
 * read as a league table that is quietly wrong. `hidden` is stripped off it for
 * the same reason a redacted fixture carries one: the flag is the server's word
 * about this answer, and `POST /admin/tournaments` passes its body through, so
 * a stored one can be written onto a match today.
 */
export function publicForm(match: Fixture): Fixture {
  return isPlayed(match) ? stripHidden(match) : redact(match)
}

/**
 * One league fixture as the public reads it.
 *
 * Every fixture goes through here and not only the ones in a hidden round,
 * because `publicForm` is also what takes a stored `hidden` back off a match
 * that is not being withheld.
 */
function project(match: Fixture, hidden: Set<number>): Fixture {
  const round = Number.isInteger(match.round) ? (match.round as number) : 0
  return hidden.has(round) ? publicForm(match) : stripHidden(match)
}

/** A `hidden` nobody put there through this file is not the server's word. */
function stripHidden(match: Fixture): Fixture {
  if (match.hidden === undefined) return match
  const { hidden: _stored, ...rest } = match
  return rest
}

/** The hand-built playoff rounds, with the hidden ones' fixtures taken out. */
function projectFormat(format: Fixture): Fixture {
  const config = format.customPlayoffConfig
  if (!isRecord(config) || !Array.isArray(config.playoffRounds)) return format

  return {
    ...format,
    customPlayoffConfig: {
      ...config,
      playoffRounds: config.playoffRounds.map((round) => {
        if (!isRecord(round) || !Array.isArray(round.matches)) return round
        const held = round.hidden === true
        return {
          ...round,
          matches: round.matches.map((match) =>
            isRecord(match) ? (held ? publicForm(match) : stripHidden(match)) : match,
          ),
        }
      }),
    },
  }
}

/**
 * The season as a visitor may read it.
 *
 * Every public route that returns a tournament goes through this. `hiddenRounds`
 * and a round's own `hidden` stay in the answer on purpose: the page draws the
 * round with a row per fixture reading "TBA", and a round it was never told
 * about would simply be missing from the fixture list.
 */
export function toPublicTournament(tournament: Tournament): Tournament {
  const hidden = hiddenLeagueRounds(tournament)
  const format = tournament.format

  // `playoffBrackets` is legacy: nothing in the repository writes it and no page
  // reads it, but the records that still carry one name the fixtures by club and
  // date — the pairings this projection has just taken off `matches`. Dropped
  // rather than projected, since the only reader would be a page that does not
  // exist.
  const { playoffBrackets: _legacyBrackets, ...rest } = tournament as Tournament & {
    playoffBrackets?: unknown
  }

  return {
    ...rest,
    matches: Array.isArray(tournament.matches)
      ? tournament.matches.map((match) =>
          isRecord(match) ? project(match, hidden) : match,
        )
      : tournament.matches,
    ...(isRecord(format) ? { format: projectFormat(format) } : {}),
  }
}

export const toPublicTournaments = (list: Tournament[]): Tournament[] =>
  list.map(toPublicTournament)
