import type { Match, Tournament } from '../types'

/**
 * Every match a tournament holds, wherever it is stored.
 *
 * Rounds built by hand live inside `format.customPlayoffConfig`, not in
 * `matches`. Anything that reads only `tournament.matches` therefore stops at
 * the league phase: the scorer list missed every playoff goal and a link to a
 * playoff match answered "Match not found".
 */
export function allMatches(tournament: Tournament | null | undefined): Match[] {
  const matches: Match[] = [...((tournament?.matches as Match[] | undefined) ?? [])]

  const rounds = tournament?.format?.customPlayoffConfig?.playoffRounds
  if (tournament?.format?.mode === 'league_custom_playoff' && Array.isArray(rounds)) {
    rounds.forEach((round: any) => {
      if (!Array.isArray(round?.matches)) return
      round.matches.forEach((match: Match) => {
        matches.push({
          ...match,
          isPlayoff: true,
          isElimination: match.isElimination || round.isElimination || false,
          playoffRound: round.roundNumber || 0,
        })
      })
    })
  }

  return matches
}

/** A score counts only when it is a number: `!== undefined` counts unplayed fixtures. */
export const isPlayed = (match: Pick<Match, 'homeGoals' | 'awayGoals'>): boolean =>
  typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'

export type PlayerRecord = {
  playerId: string
  /** The club the goals were scored for, so a name can be resolved against it. */
  teamId?: string
  played: number
  goals: number
  assists: number
}

/**
 * What each player did across a set of matches.
 *
 * Two sources, because they are filled in at different times and by different
 * people. Goals and assists come from the goal events, which is the only place
 * they exist. Appearances come from the lineup, which is the only record that a
 * player was on the pitch at all — a club whose organiser never fills the
 * lineup in has no appearances to show, and inventing them from the squad list
 * would credit a match to everyone who was injured that week.
 *
 * A player credited with a goal or an assist is counted as having played even
 * when the lineup is empty: they were demonstrably there.
 *
 * An own goal is left out of the scorer's tally. It changed the score, but the
 * top-scorer table is not the place it belongs.
 */
export function playerRecords(matches: Match[]): Map<string, PlayerRecord> {
  const records = new Map<string, PlayerRecord>()

  const of = (playerId: string, teamId?: string): PlayerRecord => {
    let record = records.get(playerId)
    if (!record) {
      record = { playerId, teamId, played: 0, goals: 0, assists: 0 }
      records.set(playerId, record)
    }
    if (!record.teamId && teamId) record.teamId = teamId
    return record
  }

  for (const match of matches) {
    if (!isPlayed(match)) continue

    const sideTeamId = (side: 'home' | 'away') =>
      side === 'home' ? match.homeTeamId : match.awayTeamId

    // Everyone the lineup names as having started.
    for (const side of ['home', 'away'] as const) {
      const lineup = match.lineups?.[side]
      for (const playerId of lineup?.starting ?? []) {
        of(playerId, sideTeamId(side)).played++
      }
    }

    const appeared = new Set<string>(
      [...(match.lineups?.home?.starting ?? []), ...(match.lineups?.away?.starting ?? [])],
    )

    for (const goal of match.goals ?? []) {
      const teamId = sideTeamId(goal.team)

      if (goal.playerId) {
        const record = of(goal.playerId, teamId)
        if (goal.type !== 'own_goal') record.goals++
        if (!appeared.has(goal.playerId)) {
          record.played++
          appeared.add(goal.playerId)
        }
      }

      if (goal.assistPlayerId) {
        const record = of(goal.assistPlayerId, teamId)
        record.assists++
        if (!appeared.has(goal.assistPlayerId)) {
          record.played++
          appeared.add(goal.assistPlayerId)
        }
      }
    }
  }

  return records
}

/** One player's totals across a set of matches. */
export function recordOf(matches: Match[], playerId: string): PlayerRecord {
  return (
    playerRecords(matches).get(playerId) ?? { playerId, played: 0, goals: 0, assists: 0 }
  )
}

export type MatchCard = NonNullable<Match['cards']>[number]
export type CardType = MatchCard['type']

/** What a booking is called, in the one place both match screens read it from. */
export const cardLabel = (type: CardType): string =>
  type === 'red' ? 'Red card' : type === 'second_yellow' ? 'Second yellow' : 'Yellow card'

/**
 * How many of each colour each side was shown.
 *
 * Derived from the events rather than stored beside them: the statistics table
 * used to hold its own `yellowCards` and `redCards`, which is a second place to
 * write the same fact and so a second answer to disagree with the first.
 *
 * A second yellow counts in both columns. The player was booked, and the side
 * played the rest of the match a man short; a table that showed it in only one
 * of the two would be wrong about the other.
 */
export function cardTotals(match: Pick<Match, 'cards'>): {
  home: { yellow: number; red: number }
  away: { yellow: number; red: number }
} {
  const totals = {
    home: { yellow: 0, red: 0 },
    away: { yellow: 0, red: 0 },
  }

  for (const card of match.cards ?? []) {
    const side = totals[card.team === 'away' ? 'away' : 'home']
    if (card.type === 'yellow' || card.type === 'second_yellow') side.yellow++
    if (card.type === 'red' || card.type === 'second_yellow') side.red++
  }

  return totals
}

/**
 * What a statistic nobody entered looks like.
 *
 * Zero is a claim — no shots at all, no corners at all, and for possession it
 * says the ball belonged to neither side. The table appears as soon as one
 * number has been typed, so every other row has to be able to say nothing. Both
 * match screens read it from here, because they used to disagree: the public
 * page printed possession as 0% and the organiser's as 50%.
 */
export const NO_STAT = '-'

export const statValue = (value: number | undefined): number | string =>
  typeof value === 'number' ? value : NO_STAT
