import type { Tournament, Match } from '../types'
import { calculateTeamStandings, sortTeamsByStandings } from './schedule'

/**
 * The "play on, drop one" system.
 *
 * One organiser runs their season like this and had to build every week by
 * hand: a single round robin, and then, week after week, the surviving teams
 * are paired off by their position in the table — everyone keeps playing, every
 * result still counts towards the same table — except that the bottom pair play
 * for their life and the loser is out. It ends when two teams are left and they
 * meet in the final.
 *
 * Nothing here writes anything: the admin screen shows the round it would add,
 * and the pairs and elimination flags stay editable afterwards, because no
 * generator survives contact with a real fixture list.
 */

export const PROGRESSIVE_PRESET = 'progressive_elimination'

export type PlayoffRoundConfig = NonNullable<
  NonNullable<Tournament['format']>['customPlayoffConfig']
>['playoffRounds']

type RoundConfig = NonNullable<PlayoffRoundConfig>[number]

const played = (match: { homeGoals?: number; awayGoals?: number }) =>
  typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'

/** Every match of the tournament, league and hand-built rounds alike. */
export function allMatches(tournament: Tournament): Match[] {
  const matches: Match[] = [...(tournament.matches || [])]

  for (const round of tournament.format?.customPlayoffConfig?.playoffRounds || []) {
    for (const match of round.matches || []) {
      matches.push({
        ...(match as Match),
        isPlayoff: true,
        isElimination: (match as Match).isElimination || false,
      })
    }
  }

  return matches
}

/** Teams that have lost an elimination game. */
export function eliminatedTeams(tournament: Tournament): Set<string> {
  const out = new Set<string>()

  for (const match of allMatches(tournament)) {
    if (!match.isElimination || !played(match)) continue
    if (!match.homeTeamId || !match.awayTeamId || match.homeTeamId === match.awayTeamId) continue
    if (match.homeGoals! > match.awayGoals!) out.add(match.awayTeamId)
    else if (match.homeGoals! < match.awayGoals!) out.add(match.homeTeamId)
  }

  return out
}

/** The table as it stands, best first — league and playoff results together. */
export function currentStandings(tournament: Tournament): string[] {
  const matches = allMatches(tournament)
  const standings = (tournament.teamIds || []).map((teamId) =>
    calculateTeamStandings(matches, teamId),
  )
  return sortTeamsByStandings(standings).map((standing) => standing.teamId)
}

export type NextRoundPlan = {
  /** The round that would be added, ready to be edited. */
  round: RoundConfig | null
  /** Teams still in the tournament, in table order. */
  survivors: string[]
  /** Set when no round can be generated. */
  reason?: string
  /** The team sitting this week out, when the count is odd. */
  resting?: string
}

export type NextRoundOptions = {
  /** Day of the round, as yyyy-mm-dd. Defaults to a week after the last one. */
  date?: string
  /** First kick-off, as HH:mm. */
  firstKickOff?: string
  /** Minutes between kick-offs. */
  slotMinutes?: number
  /** How many of the bottom pairs play for elimination. */
  eliminations?: number
}

const pad = (value: number) => String(value).padStart(2, '0')

const addMinutes = (time: string, minutes: number): string => {
  const [hours, mins] = time.split(':').map(Number)
  const total = (hours || 0) * 60 + (mins || 0) + minutes
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`
}

/** A week after the last round that has a date, or today. */
function defaultDate(tournament: Tournament): string {
  const dates = allMatches(tournament)
    .map((match) => match.dateISO)
    .filter(Boolean)
    .map((iso) => new Date(iso as string).getTime())
    .filter((time) => !Number.isNaN(time))

  const last = dates.length > 0 ? Math.max(...dates) : Date.now()
  const next = new Date(last + 7 * 24 * 60 * 60 * 1000)
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
}

/**
 * Works out the next week of this system.
 *
 * With an odd number of teams left the leader sits out — they earned it, and
 * somebody has to. Everyone else is paired straight down the table, and the
 * bottom pair is the one that matters.
 */
export function planNextProgressiveRound(
  tournament: Tournament,
  options: NextRoundOptions = {},
): NextRoundPlan {
  const existingRounds = tournament.format?.customPlayoffConfig?.playoffRounds || []
  const ranked = currentStandings(tournament)
  const eliminated = eliminatedTeams(tournament)
  const survivors = ranked.filter((teamId) => !eliminated.has(teamId))

  const unfinished = allMatches(tournament).filter((match) => !played(match)).length
  if (unfinished > 0) {
    return {
      round: null,
      survivors,
      reason: `${unfinished} ${unfinished === 1 ? 'match has' : 'matches have'} no result yet. The pairings follow the table, so it has to be up to date first.`,
    }
  }

  if (survivors.length < 2) {
    return { round: null, survivors, reason: 'The tournament is over — one team is left.' }
  }

  const date = options.date || defaultDate(tournament)
  const dateISO = new Date(`${date}T00:00:00.000Z`).toISOString()
  const slot = options.slotMinutes ?? 45
  let kickOff = options.firstKickOff || '19:00'

  // The league rounds are numbered from 1, and this system carries straight on
  // from them: after nine league rounds the next week is "Round 10".
  const leagueRounds = new Set(
    (tournament.matches || []).filter((match) => !match.isPlayoff).map((match) => match.round ?? 0),
  )
  const roundNumber = existingRounds.length + 1
  const label = leagueRounds.size + roundNumber

  const isFinal = survivors.length === 2
  const resting = !isFinal && survivors.length % 2 === 1 ? survivors[0] : undefined
  const playing = resting ? survivors.slice(1) : survivors

  const pairs: Array<[string, string]> = []
  for (let index = 0; index + 1 < playing.length; index += 2) {
    pairs.push([playing[index], playing[index + 1]])
  }

  const eliminations = isFinal ? 0 : Math.max(0, Math.min(options.eliminations ?? 1, pairs.length))

  const matches = pairs.map((pair, index) => {
    const match = {
      id: `progressive_${roundNumber}_${index}_${pair[0]}`,
      homeTeamId: pair[0],
      awayTeamId: pair[1],
      dateISO,
      time: kickOff,
      // The games that decide who leaves are the ones at the bottom.
      isElimination: index >= pairs.length - eliminations,
    }
    kickOff = addMinutes(kickOff, slot)
    return match
  })

  const round = {
    name: isFinal ? `Round ${label} Final` : `Round ${label}`,
    description: isFinal
      ? 'Grand Final'
      : resting
        ? 'Top team rests this round'
        : '',
    roundNumber,
    quantityOfGames: matches.length,
    matches,
  } as RoundConfig

  return { round, survivors, resting }
}
