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

/** The fixture with this id, wherever the competition keeps it. */
export function findMatch(
  tournament: Tournament | null | undefined,
  matchId: string | undefined,
): Match | undefined {
  if (!matchId) return undefined
  return allMatches(tournament).find((match) => match.id === matchId)
}

/**
 * Applies a change to one fixture, wherever the competition keeps it.
 *
 * The store holds a season as the API returned it, so a screen showing a
 * hand-built playoff match is showing a record inside `format`, not one in
 * `matches`. A local update that looked only in `matches` left the screen
 * showing the old score until the next reload, and — worse — the code that did
 * the looking used to write the whole array or the whole format object back.
 *
 * The tournament is returned unchanged when it holds no such fixture, so a
 * caller can use the result without checking.
 */
export function applyMatchUpdate(
  tournament: Tournament,
  matchId: string,
  change: (match: Match) => Match,
): Tournament {
  const matches = tournament.matches ?? []
  if (matches.some((match) => match.id === matchId)) {
    return {
      ...tournament,
      matches: matches.map((match) => (match.id === matchId ? change(match) : match)),
    }
  }

  const config = tournament.format?.customPlayoffConfig
  const rounds = config?.playoffRounds
  if (!config || !Array.isArray(rounds)) return tournament

  let found = false
  const updated = rounds.map((round) => {
    const inRound = round.matches
    if (!Array.isArray(inRound) || !inRound.some((match) => match.id === matchId)) return round
    found = true
    return {
      ...round,
      // A playoff fixture is a match with both clubs still optional, which is
      // the one thing `Match` will not say. The change itself only ever touches
      // fields the two shapes share.
      matches: inRound.map((match) =>
        match.id === matchId
          ? { ...(change(match as Match) as typeof match), id: match.id }
          : match,
      ),
    }
  })
  if (!found) return tournament

  return {
    ...tournament,
    format: {
      ...tournament.format!,
      customPlayoffConfig: { ...config, playoffRounds: updated },
    },
  }
}

/** A score counts only when it is a number: `!== undefined` counts unplayed fixtures. */
export const isPlayed = (match: Pick<Match, 'homeGoals' | 'awayGoals'>): boolean =>
  typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number'

/**
 * What a fixture's round is called.
 *
 * League rounds are stored from zero — `generateRoundRobinSchedule` counts from
 * zero and every generator since has followed it — while a playoff round is
 * stored from one. The fixture list adds the one and the two match screens did
 * not, so a game the season page called Round 2 called itself Round 1 once it
 * was opened. Both screens read the name from here now, because two places to
 * write it is two places to get the offset wrong.
 */
export function roundLabel(match: Pick<Match, 'round' | 'isPlayoff' | 'playoffRound'>): string {
  if (match.isPlayoff) return `Playoff round ${match.playoffRound ?? 1}`
  return `Round ${(match.round ?? 0) + 1}`
}

/**
 * Which side the player who put the ball in the net turns out for.
 *
 * `goal.team` is the side the goal counts for, because that is what the score
 * is worked out from. An own goal is the one case where the scorer plays for
 * the other side, and every screen that resolves a name against a squad has to
 * flip it — so the flip lives here rather than in each of them.
 */
export const scorerSide = (goal: {
  team: 'home' | 'away'
  type?: 'goal' | 'penalty' | 'own_goal'
}): 'home' | 'away' =>
  goal.type === 'own_goal' ? (goal.team === 'home' ? 'away' : 'home') : goal.team

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
      // The scorer's own club, which for an own goal is not the club the goal
      // counted for: crediting the appearance to the other side put a player in
      // a squad they have never played for.
      const teamId = sideTeamId(scorerSide(goal))

      if (goal.playerId) {
        const record = of(goal.playerId, teamId)
        if (goal.type !== 'own_goal') record.goals++
        if (!appeared.has(goal.playerId)) {
          record.played++
          appeared.add(goal.playerId)
        }
      }

      // An own goal has no assist. Anything stored in that field is left over
      // from before the form stopped offering one, and crediting it would hand
      // somebody an assist for a goal against their own club.
      if (goal.assistPlayerId && goal.type !== 'own_goal') {
        const record = of(goal.assistPlayerId, sideTeamId(goal.team))
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

export type TeamFixture = { match: Match; tournament: Tournament }

/**
 * A club's most recent result and its next fixture, across every competition it
 * plays in.
 *
 * A match counts as still to come while it has no score, whatever its date: a
 * result nobody has typed in yet is the club's next match until somebody does,
 * and calling it "played" because the day has passed would leave a club with
 * nothing to show all week.
 *
 * Both are chosen by kick-off time where there is one. A season is dated a
 * round at a time, so it can hold fixtures with no date at all: those go to the
 * back of the queue rather than to the front of it, and when nothing is dated
 * the order the season stores its matches in is the only ordering there is.
 */
export function lastAndNextFor(
  tournaments: Tournament[],
  teamId: string,
): { last: TeamFixture | null; next: TeamFixture | null } {
  const played: Array<TeamFixture & { time: number | null }> = []
  const upcoming: Array<TeamFixture & { time: number }> = []

  for (const tournament of tournaments) {
    for (const match of allMatches(tournament)) {
      if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) continue

      const at = match.dateISO ? new Date(match.dateISO).getTime() : Number.NaN
      const time = Number.isNaN(at) ? null : at

      if (isPlayed(match)) played.push({ match, tournament, time })
      else upcoming.push({ match, tournament, time: time ?? Number.POSITIVE_INFINITY })
    }
  }

  upcoming.sort((a, b) => a.time - b.time)

  const dated = played.filter((one) => one.time !== null)
  const last = dated.length
    ? dated.reduce((latest, one) => ((one.time as number) > (latest.time as number) ? one : latest))
    : played[played.length - 1]

  return {
    last: last ? { match: last.match, tournament: last.tournament } : null,
    next: upcoming.length
      ? { match: upcoming[0].match, tournament: upcoming[0].tournament }
      : null,
  }
}
