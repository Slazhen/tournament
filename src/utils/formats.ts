import type { Tournament } from '../types'

export type TournamentMode = NonNullable<Tournament['format']>['mode']

export type FormatOption = {
  id: string
  /** What actually gets stored on the tournament. */
  mode: TournamentMode
  rounds: number
  title: string
  tagline: string
  icon: string
  /** Two or three plain statements about how it plays out. */
  points: string[]
  minTeams: number
  /** Shows a "needs setup" badge: the bracket is built after the group stage. */
  needsSetup?: boolean
  /** There are settings to fill in on the create form itself. */
  hasSettings?: boolean
}

/**
 * The formats on offer, in the order an organiser is likely to want them.
 *
 * The point of the list is that the choice is visible before anything is
 * created: it decides the entire fixture list, and the only way to change your
 * mind afterwards is to delete the tournament and start again.
 */
export const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'league_single',
    mode: 'league',
    rounds: 1,
    title: 'League',
    tagline: 'Everyone plays everyone once',
    icon: '🏆',
    points: ['One table, no finals', 'The team on top at the end wins'],
    minTeams: 2,
  },
  {
    id: 'league_double',
    mode: 'league',
    rounds: 2,
    title: 'League, home and away',
    tagline: 'Everyone plays everyone twice',
    icon: '🔁',
    points: ['Two legs against every opponent', 'Twice the fixtures, fairer table'],
    minTeams: 2,
  },
  {
    id: 'knockout',
    mode: 'knockout',
    rounds: 1,
    title: 'Knockout cup',
    tagline: 'Lose once and you are out',
    icon: '⚔️',
    points: [
      'Seeded by the order you pick the teams',
      'Odd numbers get byes in the first round',
      'Winners move on to the next round automatically',
    ],
    minTeams: 2,
  },
  {
    id: 'league_playoff',
    mode: 'league_playoff',
    rounds: 1,
    title: 'League + playoffs',
    tagline: 'A season, then finals for the top teams',
    icon: '🥇',
    points: ['Full league first', 'The best finishers meet in a knockout'],
    minTeams: 4,
    hasSettings: true,
  },
  {
    id: 'groups_with_divisions',
    mode: 'groups_with_divisions',
    rounds: 1,
    title: 'Groups + playoffs',
    tagline: 'Group stage first, then the finals',
    icon: '🌍',
    points: ['Teams split into groups', 'Group winners go through to a bracket'],
    minTeams: 4,
    needsSetup: true,
    hasSettings: true,
  },
  {
    id: 'swiss_elimination',
    mode: 'swiss_elimination',
    rounds: 2,
    title: 'Swiss + elimination',
    tagline: 'Several rounds, then a cut',
    icon: '♟️',
    points: ['Nobody is knocked out early', 'The leaders play off at the end'],
    minTeams: 4,
  },
  {
    id: 'league_custom_playoff',
    mode: 'league_custom_playoff',
    rounds: 1,
    title: 'Custom',
    tagline: 'Build the finals yourself',
    icon: '🛠️',
    points: ['League stage as usual', 'You define each playoff round by hand'],
    minTeams: 4,
    needsSetup: true,
    hasSettings: true,
  },
]

export const findFormat = (id: string): FormatOption =>
  FORMAT_OPTIONS.find((option) => option.id === id) ?? FORMAT_OPTIONS[0]

export type SchedulePlan = {
  matches: number | null
  rounds: number | null
  summary: string
}

/**
 * What the chosen format will actually produce, worked out before anything is
 * written. Creating a tournament generates the whole fixture list in one go and
 * there is no undo, so it is worth saying "21 matches over 7 rounds" first.
 */
export function planSchedule(format: FormatOption, teamCount: number, qualifiers = 4): SchedulePlan {
  if (teamCount < format.minTeams) {
    return {
      matches: null,
      rounds: null,
      summary: `Pick at least ${format.minTeams} teams for this format`,
    }
  }

  const legs = Math.max(1, format.rounds)

  if (format.mode === 'league') {
    const perLeg = (teamCount * (teamCount - 1)) / 2
    const roundsPerLeg = teamCount % 2 === 0 ? teamCount - 1 : teamCount
    const matches = perLeg * legs
    const rounds = roundsPerLeg * legs
    return {
      matches,
      rounds,
      summary: `${matches} matches over ${rounds} rounds`,
    }
  }

  if (format.mode === 'knockout') {
    let bracket = 1
    while (bracket < teamCount) bracket *= 2
    const rounds = Math.log2(bracket)
    const byes = bracket - teamCount
    return {
      matches: teamCount - 1,
      rounds,
      summary:
        `${teamCount - 1} matches over ${rounds} rounds` +
        (byes > 0 ? `, ${byes} ${byes === 1 ? 'team gets a bye' : 'teams get byes'} in round 1` : ''),
    }
  }

  if (format.mode === 'league_playoff') {
    const leagueMatches = (teamCount * (teamCount - 1)) / 2
    const playoffMatches = Math.max(0, qualifiers - 1)
    return {
      matches: leagueMatches + playoffMatches,
      rounds: null,
      summary: `${leagueMatches} league matches, then ${playoffMatches} playoff matches for the top ${qualifiers}`,
    }
  }

  return {
    matches: null,
    rounds: null,
    summary: 'The fixture list depends on the settings below',
  }
}
