import type { Match, Tournament } from '../types'
import {
  generateRoundRobinSchedule,
  generatePlayoffBrackets,
  createPlayoffMatches,
  generateSwissEliminationSchedule,
  generateGroupsWithDivisionsSchedule,
  generateKnockoutSchedule,
} from './schedule'

type Format = NonNullable<Tournament['format']>

/**
 * Builds the fixture list for a set of teams and a format.
 *
 * Extracted so that creating a tournament and changing its teams later go
 * through exactly the same code — the two used to be able to drift apart.
 */
export function generateFixtures(teamIds: string[], format: Format): Match[] {
  const legs = format.rounds || 1

  switch (format.mode) {
    case 'league':
      return generateRoundRobinSchedule(teamIds, legs)

    case 'knockout':
      return generateKnockoutSchedule(teamIds)

    case 'league_playoff':
      return createPlayoffMatches(generatePlayoffBrackets(teamIds))

    case 'swiss_elimination': {
      const swiss = generateSwissEliminationSchedule(teamIds)
      return [...swiss.leagueMatches, ...swiss.eliminationMatches]
    }

    case 'league_custom_playoff':
      // The playoff rounds are built by hand afterwards.
      return generateRoundRobinSchedule(teamIds, legs)

    case 'groups_with_divisions': {
      const config = format.groupsWithDivisionsConfig
      if (!config) return []
      return generateGroupsWithDivisionsSchedule(teamIds, {
        numberOfGroups: config.numberOfGroups,
        teamsPerGroup: config.teamsPerGroup,
        groupRounds: config.groupRounds,
        existingGroups: config.groups,
      }).matches
    }

    default:
      return []
  }
}

export const hasResult = (match: Match): boolean =>
  match.homeGoals !== undefined || match.awayGoals !== undefined

export type TeamEditMode =
  /** Nothing has been played, so the draw can simply be made again. */
  | 'regenerate'
  /** Results exist, but fixtures for a new team can be appended to a league. */
  | 'append'
  /** Results exist and the format is a bracket — the draw cannot be reshuffled. */
  | 'locked'

export function teamEditMode(tournament: Tournament): TeamEditMode {
  const played = (tournament.matches || []).some(hasResult)
  if (!played) return 'regenerate'
  return tournament.format?.mode === 'league' || tournament.format?.mode === 'league_custom_playoff'
    ? 'append'
    : 'locked'
}

export type TeamChangePlan = {
  mode: TeamEditMode
  added: string[]
  removed: string[]
  /** Fixtures that would be created. */
  newMatches: Match[]
  /** Fixtures that would disappear, and whether any of them have a result. */
  droppedMatches: Match[]
  droppedWithResults: Match[]
  matches: Match[]
  notes: string[]
}

/**
 * Works out what changing a tournament's teams would do to its fixtures.
 *
 * Nothing is saved here: the settings screen shows the plan first, because
 * "remove this team" can quietly mean "delete six played matches".
 */
export function planTeamChange(tournament: Tournament, nextTeamIds: string[]): TeamChangePlan {
  const current = tournament.teamIds || []
  const added = nextTeamIds.filter((id) => !current.includes(id))
  const removed = current.filter((id) => !nextTeamIds.includes(id))
  const mode = teamEditMode(tournament)
  const format = tournament.format ?? { rounds: 1, mode: 'league' as const }
  const existing = tournament.matches || []
  const notes: string[] = []

  if (added.length === 0 && removed.length === 0) {
    return {
      mode,
      added,
      removed,
      newMatches: [],
      droppedMatches: [],
      droppedWithResults: [],
      matches: existing,
      notes,
    }
  }

  if (mode === 'locked') {
    notes.push('Matches have already been played, so the draw for this format cannot be changed.')
    return {
      mode,
      added,
      removed,
      newMatches: [],
      droppedMatches: [],
      droppedWithResults: [],
      matches: existing,
      notes,
    }
  }

  if (mode === 'regenerate') {
    const matches = generateFixtures(nextTeamIds, format)
    notes.push(`The fixture list is rebuilt from scratch: ${matches.length} matches.`)
    return {
      mode,
      added,
      removed,
      newMatches: matches,
      droppedMatches: existing,
      droppedWithResults: [],
      matches,
      notes,
    }
  }

  // Results exist in a league: keep everything that has been played and fill in
  // what the new line-up is missing.
  const droppedMatches = existing.filter(
    (match) => removed.includes(match.homeTeamId) || removed.includes(match.awayTeamId),
  )
  const droppedWithResults = droppedMatches.filter(hasResult)
  const kept = existing.filter((match) => !droppedMatches.includes(match))

  const legs = format.rounds || 1
  const playedPairs = new Set(
    kept.map((match) => [match.homeTeamId, match.awayTeamId].sort().join('|')),
  )

  const newMatches: Match[] = []
  let nextRound = kept.reduce((max, match) => Math.max(max, match.round ?? 0), -1) + 1

  for (const newTeam of added) {
    for (const opponent of nextTeamIds) {
      if (opponent === newTeam) continue
      const pair = [newTeam, opponent].sort().join('|')
      const existingLegs = playedPairs.has(pair) ? 1 : 0
      for (let leg = existingLegs; leg < legs; leg++) {
        newMatches.push({
          id: `add-${nextRound}-${newTeam}-${opponent}-${leg}`,
          homeTeamId: leg % 2 === 0 ? newTeam : opponent,
          awayTeamId: leg % 2 === 0 ? opponent : newTeam,
          round: nextRound,
        })
        // One catch-up match per round, so the newcomer does not appear to play
        // six games on the same day.
        nextRound++
      }
    }
  }

  if (added.length > 0) {
    notes.push(`${newMatches.length} catch-up matches added for ${added.length} new team(s).`)
  }
  if (droppedMatches.length > 0) {
    notes.push(`${droppedMatches.length} match(es) removed with the departing team(s).`)
  }
  if (droppedWithResults.length > 0) {
    notes.push(`${droppedWithResults.length} of them already has a result and it will be lost.`)
  }

  return {
    mode,
    added,
    removed,
    newMatches,
    droppedMatches,
    droppedWithResults,
    matches: [...kept, ...newMatches],
    notes,
  }
}
