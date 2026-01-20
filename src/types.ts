export type Organizer = {
  id: string
  name: string
  email: string
  createdAtISO: string
  logo?: string
  description?: string
}

export type Player = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth?: string // ISO date string
  number?: number
  position?: string
  photo?: string
  socialMedia?: {
    facebook?: string
    instagram?: string
  }
  isPublic: boolean // Whether to show on public pages
  createdAtISO: string
}

export type Team = {
  id: string
  name: string
  organizerId: string // Add organizer isolation
  colors: string[] // Array of color hex codes (1 or 2 colors)
  logo?: string
  photo?: string
  socialMedia?: {
    facebook?: string
    instagram?: string
  }
  players: Player[]
  createdAtISO: string
  establishedDate?: string // ISO date string for when team was established
}

export type Match = {
  id: string
  homeTeamId: string
  awayTeamId: string
  dateISO?: string
  homeGoals?: number
  awayGoals?: number
  round?: number
  isPlayoff?: boolean
  playoffRound?: number
  playoffMatch?: number
  isElimination?: boolean // Mark individual matches as elimination for public display
  division?: number // Division number (1 or 2) for groups_with_divisions format
  groupIndex?: number // Group number (1-based) for groups_with_divisions format
  // Match details
  venue?: string
  referee?: string
  status?: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
  // Statistics
  statistics?: {
    home: {
      shots?: number
      shotsOnTarget?: number
      corners?: number
      fouls?: number
      yellowCards?: number
      redCards?: number
      possession?: number
    }
    away: {
      shots?: number
      shotsOnTarget?: number
      corners?: number
      fouls?: number
      yellowCards?: number
      redCards?: number
      possession?: number
    }
  }
  // Goals and events
  goals?: Array<{
    id: string
    team: 'home' | 'away'
    playerId: string
    minute: number
    type: 'goal' | 'penalty' | 'own_goal'
    assistPlayerId?: string
    goalNumber?: number // Goal number for this team (1st, 2nd, 3rd goal, etc.)
  }>
  // Lineups
  lineups?: {
    home: {
      starting: string[]
      substitutes: string[]
    }
    away: {
      starting: string[]
      substitutes: string[]
    }
  }
  // Match content
  preview?: string
  report?: string
  videoUrl?: string
}

export type PlayoffBracket = {
  round: number
  matches: {
    matchId: string
    homeTeamId: string
    awayTeamId: string
    homeGoals?: number
    awayGoals?: number
    dateISO?: string
    winner?: string
  }[]
}

export type CustomPlayoffRound = {
  id: string
  name: string
  round: number
  matches: Match[]
  isElimination: boolean
  description: string
  byeTeam?: string // Team that gets BYE in this round
}

export type TeamStanding = {
  teamId: string
  position: number
  points: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  disciplinaryPoints: number
  headToHeadPoints?: number
  headToHeadGoalDifference?: number
}

export type CustomPlayoffRoundConfig = {
  roundNumber: number
  name: string
  quantityOfGames: number // Number of games in this round
  description?: string
  matches: CustomPlayoffMatchConfig[] // Individual match configurations
}

export type CustomPlayoffMatchConfig = {
  id: string
  homeTeamId?: string
  awayTeamId?: string
  homeGoals?: number
  awayGoals?: number
  dateISO?: string
  time?: string
  isElimination: boolean // Mark individual matches as elimination
  notes?: string
}

export type Tournament = {
  id: string
  name: string
  organizerId: string // Add organizer isolation
  createdAtISO: string
  teamIds: string[]
  matches: Match[]
  format?: {
    rounds: number
    mode: 'league' | 'league_playoff' | 'swiss_elimination' | 'league_custom_playoff' | 'groups_with_divisions'
    playoffQualifiers?: number
    customPlayoffConfig?: {
      playoffTeams: number // Total teams in playoffs
      enableBye: boolean // Enable BYE for odd numbers (default: true)
      playoffRounds?: CustomPlayoffRoundConfig[] // Configuration for each playoff round
    }
    groupsWithDivisionsConfig?: {
      numberOfGroups: number // Number of groups
      teamsPerGroup: number // Teams per group
      groupRounds: number // 1 or 2 rounds in group stage
      groups?: string[][] // Array of arrays: [[team1, team2, ...], [team3, team4, ...], ...] - stores team assignments per group
    }
  }
  logo?: string
  backgroundImage?: string
  playoffBrackets?: PlayoffBracket[]
  location?: {
    name?: string
    link?: string
  }
  socialMedia?: {
    facebook?: string
    instagram?: string
  }
  visibility?: 'public' | 'private' // Tournament visibility: public (visible to everyone) or private (admin/organizer only)
}

export type AppSettings = {
  theme: 'dark' | 'bright'
  backgroundTint: number
  backgroundImage?: string // Data URL for uploaded background image
}

