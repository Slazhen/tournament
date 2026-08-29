import type { Tournament } from '../types'

/** Which drawing goes on the card. Emoji rendered differently on every device. */
export type FormatIconName =
  | 'table'
  | 'repeat'
  | 'bracket'
  | 'medal'
  | 'groups'
  | 'rounds'
  | 'rest'
  | 'tools'

export type TournamentMode = NonNullable<Tournament['format']>['mode']

export type FormatOption = {
  id: string
  /** What actually gets stored on the tournament. */
  mode: TournamentMode
  rounds: number
  title: string
  tagline: string
  icon: FormatIconName
  /** Two or three plain statements about how it plays out. */
  points: string[]
  minTeams: number
  /** Shows a "needs setup" badge: the bracket is built after the group stage. */
  needsSetup?: boolean
  /**
   * Two options can share a mode and differ only in what gets generated.
   * The preset is stored on the tournament so the option can be found again.
   */
  preset?: 'progressive_elimination'
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
    icon: 'table',
    points: ['One table, no finals', 'The team on top at the end wins'],
    minTeams: 2,
  },
  {
    id: 'league_double',
    mode: 'league',
    rounds: 2,
    title: 'League, home and away',
    tagline: 'Everyone plays everyone twice',
    icon: 'repeat',
    points: ['Two legs against every opponent', 'Twice the fixtures, fairer table'],
    minTeams: 2,
  },
  {
    id: 'knockout',
    mode: 'knockout',
    rounds: 1,
    title: 'Knockout cup',
    tagline: 'Lose once and you are out',
    icon: 'bracket',
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
    icon: 'medal',
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
    icon: 'groups',
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
    icon: 'rounds',
    points: ['Nobody is knocked out early', 'The leaders play off at the end'],
    minTeams: 4,
  },
  {
    id: 'progressive_elimination',
    mode: 'league_custom_playoff',
    preset: 'progressive_elimination',
    rounds: 1,
    title: 'League, then one out a week',
    tagline: 'Everyone keeps playing, the bottom pair play to survive',
    icon: 'rest',
    points: [
      'One round robin first, one table throughout',
      'Then each week the survivors are paired by position',
      'The bottom pair is a knockout — the loser is out',
      'Down to two teams and a final',
    ],
    minTeams: 4,
    needsSetup: true,
  },
  {
    id: 'league_custom_playoff',
    mode: 'league_custom_playoff',
    rounds: 1,
    // Named for what it produces rather than for the fact that it is
    // configurable: this title is also the label in the Format column of the
    // team and player pages, where "Custom" on its own says nothing.
    title: 'League + custom playoffs',
    tagline: 'Build the finals yourself',
    icon: 'tools',
    points: ['League stage as usual', 'You define each playoff round by hand'],
    minTeams: 4,
    needsSetup: true,
    hasSettings: true,
  },
]

export const findFormat = (id: string): FormatOption =>
  FORMAT_OPTIONS.find((option) => option.id === id) ?? FORMAT_OPTIONS[0]

/**
 * Which option a tournament was created with.
 *
 * Mode alone is no longer enough to tell them apart: two formats can store the
 * same mode and differ only by preset.
 */
export function formatOptionFor(format?: {
  mode?: TournamentMode
  rounds?: number
  customPlayoffConfig?: { preset?: string }
}): FormatOption {
  const preset = format?.customPlayoffConfig?.preset
  if (preset) {
    const byPreset = FORMAT_OPTIONS.find((option) => option.preset === preset)
    if (byPreset) return byPreset
  }

  return (
    FORMAT_OPTIONS.find(
      (option) =>
        option.mode === format?.mode && option.rounds === (format?.rounds ?? 1) && !option.preset,
    ) ??
    FORMAT_OPTIONS.find((option) => option.mode === format?.mode && !option.preset) ??
    FORMAT_OPTIONS[0]
  )
}

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
    const leagueMatches = ((teamCount * (teamCount - 1)) / 2) * legs
    const playoffMatches = Math.max(0, qualifiers - 1)
    return {
      matches: leagueMatches + playoffMatches,
      rounds: null,
      // The bracket is not created up front: who finishes in the top four is not
      // known until the league has been played.
      summary: `${leagueMatches} league matches, then ${playoffMatches} playoff matches for the top ${qualifiers}, drawn when the table is final`,
    }
  }

  if (format.preset === 'progressive_elimination') {
    const leagueMatches = ((teamCount * (teamCount - 1)) / 2) * legs
    return {
      matches: null,
      rounds: null,
      summary: `${leagueMatches} league matches, then one knockout game a week until two teams are left`,
    }
  }

  return {
    matches: null,
    rounds: null,
    summary: 'The fixture list depends on the settings below',
  }
}
