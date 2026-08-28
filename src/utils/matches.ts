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
