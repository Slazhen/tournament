import type { Match, Tournament } from '../types'
import {
  generateRoundRobinSchedule,
  generatePlayoffBrackets,
  createPlayoffMatches,
  generateSwissEliminationSchedule,
  generateGroupsWithDivisionsSchedule,
  generateDivisionBrackets,
  generateKnockoutSchedule,
  calculateTeamStandings,
  sortTeamsByStandings,
} from './schedule'
import { groupCuts, groupsOf } from './standings'

type Format = NonNullable<Tournament['format']>
export type { Format as TournamentFormat }

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
      // The league is played first. The bracket cannot be drawn yet — who
      // qualifies is not known until the table is final — so it is seeded
      // afterwards from the finished table. This used to return the bracket
      // alone, which meant "League + playoffs" created no league at all.
      return generateRoundRobinSchedule(teamIds, legs)

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
        qualifiersPerGroup: config.qualifiersPerGroup,
        secondDivisionPerGroup: config.secondDivisionPerGroup,
      }).matches
    }

    default:
      return []
  }
}

/**
 * A match counts as played once a score has been entered.
 *
 * This used to test `!== undefined`, which a fixture stored with an explicit
 * null score passes — so an untouched tournament looked fully played.
 */
export const hasResult = (match: Match): boolean =>
  typeof match.homeGoals === 'number' || typeof match.awayGoals === 'number'

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

/* -------------------------------------------------------------------------
 * Changing the format of a tournament that already exists
 * ---------------------------------------------------------------------- */

export type FormatChangeKind =
  /** The picked format is the one already in use. */
  | 'unchanged'
  /** Nothing has been played, so the fixture list is simply rebuilt. */
  | 'regenerate'
  /** The league stays exactly as it is and finals are added on top of it. */
  | 'append_playoff'
  /** Results exist and the new format has no room for them. */
  | 'destructive'
  /** Refused, with a reason the organiser can act on. */
  | 'blocked'
  /** The groups stay exactly as they are and only the bracket is redrawn. */
  | 'rebuild_playoffs'

export type FormatChangePlan = {
  kind: FormatChangeKind
  matches: Match[]
  keptResults: number
  lostResults: number
  notes: string[]
  /** Group assignments, when the new format is groups + divisions. */
  groups?: string[][]
}

/**
 * Fixtures plus anything else the format needs stored alongside them — which
 * today means the group assignments, without which the group tables cannot be
 * rebuilt.
 */
function buildFixtures(teamIds: string[], format: Format): { matches: Match[]; groups?: string[][] } {
  if (format.mode === 'groups_with_divisions') {
    const config = format.groupsWithDivisionsConfig
    if (!config) return { matches: [] }
    const result = generateGroupsWithDivisionsSchedule(teamIds, {
      numberOfGroups: config.numberOfGroups,
      teamsPerGroup: config.teamsPerGroup,
      groupRounds: config.groupRounds,
      existingGroups: config.groups,
      qualifiersPerGroup: config.qualifiersPerGroup,
      secondDivisionPerGroup: config.secondDivisionPerGroup,
    })
    return { matches: result.matches, groups: result.groups }
  }
  return { matches: generateFixtures(teamIds, format) }
}

/** The part of a grouped format that decides the group fixtures themselves. */
const sameGroupStage = (a: Format, b: Format) => {
  const one = a.groupsWithDivisionsConfig
  const two = b.groupsWithDivisionsConfig
  return (
    one?.numberOfGroups === two?.numberOfGroups &&
    one?.teamsPerGroup === two?.teamsPerGroup &&
    one?.groupRounds === two?.groupRounds
  )
}

/** And the part that decides only how many playoff slots there are. */
const sameCuts = (a: Format, b: Format) => {
  const one = groupCuts(a.groupsWithDivisionsConfig)
  const two = groupCuts(b.groupsWithDivisionsConfig)
  return one.firstDivision === two.firstDivision && one.secondDivision === two.secondDivision
}

const sameFormat = (a: Format, b: Format) =>
  a.mode === b.mode &&
  (a.rounds || 1) === (b.rounds || 1) &&
  (a.playoffQualifiers ?? 0) === (b.playoffQualifiers ?? 0) &&
  // Two formats can share a mode and differ only in the system their
  // hand-built rounds follow.
  (a.customPlayoffConfig?.preset ?? '') === (b.customPlayoffConfig?.preset ?? '') &&
  // The group settings are part of the format too. Without this every change
  // to them read as "unchanged" and the settings screen refused to save it,
  // which is how the number of groups came to be editable on screen and
  // nowhere else.
  (a.mode !== 'groups_with_divisions' || (sameGroupStage(a, b) && sameCuts(a, b)))

/** The table as it stands, best first. */
function rankTeams(teamIds: string[], matches: Match[]): string[] {
  const standings = teamIds.map((teamId) => calculateTeamStandings(matches, teamId))
  return sortTeamsByStandings(standings).map((standing) => standing.teamId)
}

/**
 * Works out what switching a tournament to another format would do.
 *
 * Until now the format was decided once, on the create screen, and the only way
 * to change it was to delete the tournament and enter every result again — so a
 * league that wanted finals at the end of the season had nowhere to go.
 *
 * Nothing is written here. The settings screen shows the plan and asks first,
 * because for most combinations the honest answer is "this deletes your results".
 */
export function planFormatChange(tournament: Tournament, next: Format): FormatChangePlan {
  const current = tournament.format ?? { rounds: 1, mode: 'league' as const }
  const teamIds = tournament.teamIds || []
  const existing = tournament.matches || []
  const played = existing.filter(hasResult)

  if (sameFormat(current, next)) {
    return {
      kind: 'unchanged',
      matches: existing,
      keptResults: played.length,
      lostResults: 0,
      notes: [],
    }
  }

  // Nothing played: the draw means nothing yet and can be redone freely.
  const scheduled = existing.filter((match) => match.dateISO).length
  const datesNote =
    scheduled > 0
      ? [`${scheduled} kick-off ${scheduled === 1 ? 'time' : 'times'} already entered will be cleared.`]
      : []

  if (played.length === 0) {
    const { matches, groups } = buildFixtures(teamIds, next)
    return {
      kind: 'regenerate',
      matches,
      groups,
      keptResults: 0,
      lostResults: 0,
      notes: [
        `No results have been entered, so the fixture list is rebuilt: ${existing.length} → ${matches.length} matches.`,
        ...datesNote,
      ],
    }
  }

  // Only the playoff cut changed. The group stage is untouched by it, so a
  // season already under way can change how many teams go through without
  // losing a result — which is what rebuilding the whole fixture list, the
  // only plan this used to have for it, would have cost.
  if (
    current.mode === 'groups_with_divisions' &&
    next.mode === 'groups_with_divisions' &&
    sameGroupStage(current, next)
  ) {
    const groupStage = existing.filter((match) => !match.isPlayoff)
    const lostPlayoffs = existing.filter((match) => match.isPlayoff && hasResult(match))
    const offset = groupStage.reduce((max, match) => Math.max(max, match.round ?? 0), -1) + 1
    const cuts = groupCuts(next.groupsWithDivisionsConfig)
    const bracket = generateDivisionBrackets(groupsOf(tournament), cuts, offset)
    const divisions =
      cuts.secondDivision > 0
        ? `the top ${cuts.firstDivision} of each group in Division 1 and the next ${cuts.secondDivision} in Division 2`
        : `the top ${cuts.firstDivision} of each group in Division 1, and no Division 2`

    return {
      // A drawn bracket with results in it is the one thing here that cannot
      // survive being redrawn, so it is the organiser's to confirm.
      kind: lostPlayoffs.length > 0 ? 'destructive' : 'rebuild_playoffs',
      matches: [...groupStage, ...bracket],
      keptResults: groupStage.filter(hasResult).length,
      lostResults: lostPlayoffs.length,
      notes: [
        'Every group match and every group result is kept.',
        `The bracket is redrawn empty for ${divisions}: ${bracket.length} playoff ${bracket.length === 1 ? 'match' : 'matches'}.`,
        ...(lostPlayoffs.length > 0
          ? [
              `${lostPlayoffs.length} playoff ${lostPlayoffs.length === 1 ? 'result' : 'results'} already entered will be deleted.`,
            ]
          : []),
      ],
    }
  }

  const legsMatch = (current.rounds || 1) === (next.rounds || 1)

  // The case this whole thing exists for: a league that now wants finals.
  if (current.mode === 'league' && next.mode === 'league_custom_playoff' && legsMatch) {
    return {
      kind: 'append_playoff',
      matches: existing,
      keptResults: played.length,
      lostResults: 0,
      notes: [
        'Every league match and every result is kept.',
        'The playoff rounds are added by hand afterwards, on the tournament screen.',
      ],
    }
  }

  if (current.mode === 'league' && next.mode === 'league_playoff' && legsMatch) {
    const seeding = planPlayoffSeeding(tournament, next.playoffQualifiers)

    if (!seeding.canSeed) {
      return {
        kind: 'blocked',
        matches: existing,
        keptResults: played.length,
        lostResults: 0,
        notes: [
          seeding.reason ?? 'The bracket cannot be drawn yet.',
          'Either finish the league first, or choose Custom and set the playoff pairs by hand.',
        ],
      }
    }

    return {
      kind: 'append_playoff',
      matches: [...existing, ...seeding.matches],
      keptResults: played.length,
      lostResults: 0,
      notes: [
        'Every league match and every result is kept.',
        `The league is complete, so the top ${seeding.qualifiers} are seeded into the bracket from the final table.`,
        `${seeding.matches.length} playoff ${seeding.matches.length === 1 ? 'match' : 'matches'} added.`,
      ],
    }
  }

  // Everything else: the new fixture list has nothing to do with the old one.
  const { matches, groups } = buildFixtures(teamIds, next)
  return {
    kind: 'destructive',
    matches,
    groups,
    keptResults: 0,
    lostResults: played.length,
    notes: [
      `${played.length} played ${played.length === 1 ? 'match' : 'matches'} and ${played.length === 1 ? 'its result' : 'their results'} will be deleted.`,
      `The new fixture list has ${matches.length} matches.`,
      ...datesNote,
    ],
  }
}

export type PlayoffSeedPlan = {
  canSeed: boolean
  reason?: string
  /** The bracket that would be appended, already stamped with rounds. */
  matches: Match[]
  qualifiers: number
}

/**
 * Draws the knockout bracket for a league that has finished.
 *
 * "League + playoffs" cannot generate its bracket when the tournament is
 * created — nobody knows yet who finishes in the top four — so it is drawn from
 * the final table, either when the format is switched or from the button on the
 * settings screen.
 */
export function planPlayoffSeeding(
  tournament: Tournament,
  requestedQualifiers?: number,
): PlayoffSeedPlan {
  const teamIds = tournament.teamIds || []
  const existing = tournament.matches || []
  const league = existing.filter((match) => !match.isPlayoff)
  const alreadyDrawn = existing.filter((match) => match.isPlayoff)

  const qualifiers = Math.max(
    2,
    Math.min(requestedQualifiers || tournament.format?.playoffQualifiers || 4, teamIds.length),
  )

  if (alreadyDrawn.length > 0) {
    return {
      canSeed: false,
      reason: 'The bracket has already been drawn.',
      matches: [],
      qualifiers,
    }
  }

  if (league.length === 0) {
    return { canSeed: false, reason: 'There are no league matches to rank the teams by.', matches: [], qualifiers }
  }

  const remaining = league.filter((match) => !hasResult(match)).length
  if (remaining > 0) {
    return {
      canSeed: false,
      reason: `${remaining} league ${remaining === 1 ? 'match has' : 'matches have'} no result yet, so it is not known who qualifies.`,
      matches: [],
      qualifiers,
    }
  }

  const ranked = rankTeams(teamIds, league).slice(0, qualifiers)
  const bracket = createPlayoffMatches(generatePlayoffBrackets(ranked))
  const afterLeague = league.reduce((max, match) => Math.max(max, match.round ?? 0), -1) + 1

  return {
    canSeed: true,
    qualifiers,
    matches: bracket.map((match) => ({
      ...match,
      round: afterLeague + (match.playoffRound ?? 0),
      isPlayoff: true,
    })),
  }
}
