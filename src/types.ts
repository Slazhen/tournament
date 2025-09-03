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

export type Tournament = {
  id: string
  name: string
  organizerId: string // Add organizer isolation
  createdAtISO: string
  teamIds: string[]
  matches: Match[]
  format?: {
    rounds: number
    mode: 'league' | 'league_playoff' | 'swiss_elimination'
    playoffQualifiers?: number
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
}

export type AppSettings = {
  theme: 'dark' | 'bright'
  backgroundTint: number
  backgroundImage?: string // Data URL for uploaded background image
}

