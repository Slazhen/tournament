import type { Tournament } from '../types'
import {
  playoffTiers,
  DEFAULT_SCORING,
  DEFAULT_TIEBREAKERS,
  type PlayoffScoring,
  type TiebreakerKey,
} from './standings'

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
    points: ['Teams split into groups', 'The top of each group goes through to a bracket'],
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

/**
 * The choice a competition actually starts from.
 *
 * There are three of these and there were eight cards, because the old list put
 * a setting on the same footing as a scheme: "League" and "League, home and
 * away" are one scheme with the number of legs changed, and "League +
 * playoffs", "League + custom playoffs" and the week-by-week system are the
 * same scheme again with a different finish. An organiser reading eight cards
 * before they have picked a single club is reading a list of combinations, not
 * making a decision.
 *
 * So the first screen asks which of these it is, and everything else — legs,
 * finals, how many go through, how the groups are cut — is asked afterwards,
 * about the one they chose.
 */
export type SchemeId = 'league' | 'groups' | 'knockout'

export type Scheme = {
  id: SchemeId
  title: string
  tagline: string
  icon: FormatIconName
  /** Two or three plain statements about how it plays out. */
  points: string[]
  minTeams: number
}

export const SCHEMES: Scheme[] = [
  {
    id: 'league',
    title: 'League',
    tagline: 'Everyone plays everyone, one table',
    icon: 'table',
    points: [
      'One round or several, home and away if you want',
      'Finish on the table, or add finals for the best of it',
    ],
    minTeams: 2,
  },
  {
    id: 'groups',
    title: 'Groups and finals',
    tagline: 'Group stage first, then the knockout',
    icon: 'groups',
    points: ['Clubs split into groups with a table each', 'The top of every group goes through'],
    minTeams: 4,
  },
  {
    id: 'knockout',
    title: 'Straight knockout',
    tagline: 'Lose once and you are out',
    icon: 'bracket',
    points: ['Seeded by the order you pick the clubs', 'Odd numbers get byes in the first round'],
    minTeams: 2,
  },
]

/** How a league ends. The order is how much structure each one adds. */
export type LeagueFinals = 'none' | 'playoff' | 'custom' | 'progressive'

export const LEAGUE_FINALS: Array<{ id: LeagueFinals; title: string; detail: string }> = [
  {
    id: 'none',
    title: 'Nothing — the table decides',
    detail: 'The club on top when the last round is played wins it.',
  },
  {
    id: 'playoff',
    title: 'Playoffs for the top clubs',
    detail: 'A knockout bracket, drawn from the table once the league is complete.',
  },
  {
    id: 'custom',
    title: 'Rounds I build myself',
    detail: 'Each round of the finals is set up by hand on the season screen.',
  },
  {
    id: 'progressive',
    title: 'One club out a week',
    detail:
      'Everyone keeps playing: the survivors are paired by table position each week and the bottom pair plays to stay in.',
  },
]

export type SchemeSettings = {
  /** League: how many times everyone plays everyone. */
  legs: number
  finals: LeagueFinals
  /** How many clubs the finals take, where the finals take a number of them. */
  qualifiers: number
  groups: GroupsPlanInput
  scoring: { win: number; draw: number; loss: number }
  tiebreakers: TiebreakerKey[]
}

export const defaultSchemeSettings = (): SchemeSettings => ({
  legs: 1,
  finals: 'none',
  qualifiers: 4,
  groups: {
    numberOfGroups: 4,
    teamsPerGroup: 4,
    groupRounds: 1,
    qualifiersPerGroup: 2,
    secondDivisionPerGroup: 2,
    thirdDivisionPerGroup: 0,
  },
  scoring: { win: DEFAULT_SCORING.win, draw: DEFAULT_SCORING.draw, loss: DEFAULT_SCORING.loss },
  tiebreakers: [...DEFAULT_TIEBREAKERS],
})

/**
 * Which playoff matches give points, for the scheme being created.
 *
 * Only the hand-built schemes have finals that are not all knockouts: a round
 * the organiser marks as a league round counts, and the ones that send a club
 * out do not. Everywhere else the finals decide who wins and the table is the
 * league that led to them.
 */
const playoffScoringFor = (scheme: SchemeId, finals: LeagueFinals): PlayoffScoring =>
  scheme === 'league' && (finals === 'custom' || finals === 'progressive')
    ? 'non_elimination'
    : 'none'

/**
 * The record a scheme and its settings add up to.
 *
 * `mode` is unchanged from what it has always been — the screen is a way of
 * choosing one, not a new way of storing it, and every season in the database
 * goes on reading exactly as it did.
 */
export function formatFor(
  scheme: SchemeId,
  settings: SchemeSettings,
  teamCount: number,
): NonNullable<Tournament['format']> {
  const rules = {
    scoring: { ...settings.scoring, playoffMatches: playoffScoringFor(scheme, settings.finals) },
    tiebreakers: [...settings.tiebreakers],
  }

  if (scheme === 'knockout') return { rounds: 1, mode: 'knockout', ...rules }

  if (scheme === 'groups') {
    return {
      rounds: 1,
      mode: 'groups_with_divisions',
      groupsWithDivisionsConfig: { ...settings.groups },
      ...rules,
    }
  }

  const legs = Math.max(1, settings.legs)

  if (settings.finals === 'playoff') {
    return { rounds: legs, mode: 'league_playoff', playoffQualifiers: settings.qualifiers, ...rules }
  }

  if (settings.finals === 'custom' || settings.finals === 'progressive') {
    return {
      rounds: legs,
      mode: 'league_custom_playoff',
      customPlayoffConfig: {
        // The week-by-week system starts with everybody, so the number of clubs
        // it takes is not a choice the organiser makes.
        playoffTeams: settings.finals === 'progressive' ? teamCount : settings.qualifiers,
        enableBye: true,
        playoffRounds: [],
        preset: settings.finals === 'progressive' ? 'progressive_elimination' : undefined,
      },
      ...rules,
    }
  }

  return { rounds: legs, mode: 'league', ...rules }
}

/** Which of the three schemes a stored format is, for a season being edited or copied. */
export function schemeOf(format?: Tournament['format']): { scheme: SchemeId; finals: LeagueFinals } {
  if (format?.mode === 'knockout') return { scheme: 'knockout', finals: 'none' }
  if (format?.mode === 'groups_with_divisions') return { scheme: 'groups', finals: 'none' }
  if (format?.customPlayoffConfig?.preset === 'progressive_elimination') {
    return { scheme: 'league', finals: 'progressive' }
  }
  if (format?.mode === 'league_custom_playoff') return { scheme: 'league', finals: 'custom' }
  if (format?.mode === 'league_playoff') return { scheme: 'league', finals: 'playoff' }
  // `swiss_elimination` lands here too: it is off the create screen, and a
  // season carrying it reads as the league it actually generated.
  return { scheme: 'league', finals: 'none' }
}

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
export type GroupsPlanInput = {
  numberOfGroups: number
  teamsPerGroup: number
  groupRounds: number
  qualifiersPerGroup?: number
  secondDivisionPerGroup?: number
  thirdDivisionPerGroup?: number
}

export function planSchedule(
  format: FormatOption,
  teamCount: number,
  qualifiers = 4,
  groups?: GroupsPlanInput,
): SchedulePlan {
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

  if (format.mode === 'groups_with_divisions' && groups) {
    const perGroup = groups.teamsPerGroup
    const groupMatches =
      groups.numberOfGroups * ((perGroup * (perGroup - 1)) / 2) * Math.max(1, groups.groupRounds)

    // A bracket of n clubs is n-1 matches however uneven n is: an odd round
    // carries one club through without a fixture rather than inventing one.
    const brackets = playoffTiers(groups).map((tier) => {
      const available = Math.max(0, Math.min(tier.places, perGroup - (tier.from - 1)))
      const clubs = groups.numberOfGroups * available
      return { name: tier.name, clubs, matches: Math.max(0, clubs - 1) }
    })
    const playoffMatches = brackets.reduce((total, bracket) => total + bracket.matches, 0)
    const described = brackets
      .filter((bracket) => bracket.clubs >= 2)
      .map((bracket) => `${bracket.clubs} in the ${bracket.name.toLowerCase()}`)
      .join(', ')

    return {
      matches: groupMatches + playoffMatches,
      rounds: null,
      // The pairings cannot be drawn up front — who finishes where is not known
      // until the groups have been played — so the count is honest and the
      // slots are filled in afterwards.
      summary: `${groupMatches} group matches, then ${playoffMatches} playoff matches: ${described}, filled in once the groups are done`,
    }
  }

  return {
    matches: null,
    rounds: null,
    summary: 'The fixture list depends on the settings below',
  }
}

/** Which card of the old list a scheme and its finish correspond to. */
const OPTION_FOR_SCHEME: Record<string, string> = {
  'league:none': 'league_single',
  'league:playoff': 'league_playoff',
  'league:custom': 'league_custom_playoff',
  'league:progressive': 'progressive_elimination',
  'groups:none': 'groups_with_divisions',
  'knockout:none': 'knockout',
}

/**
 * What the scheme on screen will produce, before anything is written.
 *
 * The legs are handed over separately because they are a setting now and no
 * longer a card: the option this finds carries the number its own card was
 * fixed at, and a three-leg league would otherwise be counted as one.
 */
export function planFor(
  scheme: SchemeId,
  settings: SchemeSettings,
  teamCount: number,
): SchedulePlan {
  const finals = scheme === 'league' ? settings.finals : 'none'
  const option = findFormat(OPTION_FOR_SCHEME[`${scheme}:${finals}`] ?? 'league_single')
  return planSchedule(
    { ...option, rounds: scheme === 'league' ? Math.max(1, settings.legs) : option.rounds },
    teamCount,
    settings.qualifiers,
    settings.groups,
  )
}
