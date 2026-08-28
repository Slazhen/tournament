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
  /**
   * Never sent to a visitor. Public routes work out `age` from it and send
   * that instead, so the exact date stays inside the club.
   */
  dateOfBirth?: string // ISO date string
  /**
   * How old the player is, worked out by the API for public pages.
   *
   * Absent rather than zero when there is nothing to show — no date recorded,
   * or a club that has turned ages off.
   */
  age?: number
  number?: number
  position?: string
  heightCm?: number
  weightKg?: number
  preferredFoot?: 'left' | 'right' | 'both'
  photo?: string
  socialMedia?: {
    facebook?: string
    instagram?: string
  }
  isPublic: boolean // Whether to show on public pages
  createdAtISO: string
}

/**
 * A change to one player.
 *
 * `null` means "clear this field", and it has to: JSON has no undefined, so a
 * key left out of the body means "unchanged" — which is why emptying a shirt
 * number on screen used to leave the old number in the record. The API drops a
 * null rather than storing it, and so does the optimistic copy in the store.
 */
export type PlayerUpdate = {
  [K in keyof Player]?: Player[K] | null
}

export type Team = {
  id: string
  name: string
  organizerId: string // Add organizer isolation
  colors: string[] // Array of color hex codes (1 or 2 colors)
  logo?: string
  /**
   * The crest's own dominant colour, read from the file when it was uploaded.
   *
   * The public club header is painted in this rather than in `colors[0]`: the
   * two disagree for most clubs, because nobody goes back to the colour picker
   * after changing a crest. Absent for every club whose crest predates this,
   * and the header falls back to `colors` — see `utils/crest.ts`. Null where a
   * crest was replaced by one that could not be measured: that clears what the
   * previous crest left rather than keeping its colour.
   */
  crestColor?: string | null
  /** Whether that crest is artwork on a solid plate rather than a cut-out badge. */
  crestOpaqueBackground?: boolean | null
  photo?: string
  socialMedia?: {
    facebook?: string
    instagram?: string
    /** A channel or a single video — whatever the club wants shown. */
    youtube?: string
  }
  players: Player[]
  createdAtISO: string
  establishedDate?: string // ISO date string for when team was established
  /**
   * Whether the public is told how old this club's players are.
   *
   * The club's decision rather than each player's: a manager sets it once for
   * the squad. Absent means ages are shown, which is what every club did
   * before the flag existed.
   */
  hidePlayerAges?: boolean
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
  /**
   * The team totals somebody types in by hand.
   *
   * Cards are deliberately not among them any more: they are counted from
   * `cards` below, and a total stored beside the events it comes from is a
   * second answer waiting to disagree with the first.
   */
  statistics?: {
    home: {
      shots?: number
      shotsOnTarget?: number
      corners?: number
      fouls?: number
      possession?: number
    }
    away: {
      shots?: number
      shotsOnTarget?: number
      corners?: number
      fouls?: number
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
  /**
   * Bookings, as events rather than as counts.
   *
   * The team totals in `statistics` are worked out from this list and are not
   * stored beside it: two places to write the same fact is two places to
   * disagree, and the count is the shorter of the two answers anyway.
   *
   * `second_yellow` is its own type because a sending-off for two bookings is
   * not a straight red, and the totals need it to be both — it is a yellow the
   * player was shown and a dismissal the team played out.
   */
  cards?: Array<{
    id: string
    team: 'home' | 'away'
    playerId: string
    minute: number
    type: 'yellow' | 'second_yellow' | 'red'
  }>
  /**
   * Who played, one side at a time.
   *
   * Each side is optional because each has its own author now — the organiser
   * writes either, a club's manager writes their own — and they are written
   * separately so that neither can undo the other. A reader that assumes both
   * halves are there the moment `lineups` exists is reading a shape the API
   * does not promise.
   */
  lineups?: {
    home?: {
      starting: string[]
      substitutes: string[]
    }
    away?: {
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
    mode: 'league' | 'league_playoff' | 'knockout' | 'swiss_elimination' | 'league_custom_playoff' | 'groups_with_divisions'
    playoffQualifiers?: number
    customPlayoffConfig?: {
      playoffTeams: number // Total teams in playoffs
      enableBye: boolean // Enable BYE for odd numbers (default: true)
      playoffRounds?: CustomPlayoffRoundConfig[] // Configuration for each playoff round
      /**
       * Which system these hand-built rounds follow, when they follow one.
       * 'progressive_elimination' means each week can be generated from the
       * table instead of being typed in by hand.
       */
      preset?: 'progressive_elimination'
    }
    groupsWithDivisionsConfig?: {
      numberOfGroups: number // Number of groups
      teamsPerGroup: number // Teams per group
      groupRounds: number // 1 or 2 rounds in group stage
      groups?: string[][] // Array of arrays: [[team1, team2, ...], [team3, team4, ...], ...] - stores team assignments per group
    }
  }
  /**
   * Seasons.
   *
   * A tournament run again next year is not a new competition, it is the next
   * season of the same one. Rather than a separate "competition" record — which
   * would own no field a season does not already have — every season of the same
   * competition carries the same `seriesId`, and the grouping falls out of that.
   */
  seriesId?: string
  /** The competition's name, the same on every season of it. */
  seriesName?: string
  /** What this season is called: "2025", "Autumn 2026". */
  seasonLabel?: string
  /**
   * Set by hand when the winner is not the one the results imply — a walkover,
   * a withdrawal, a title decided off the pitch.
   */
  championTeamId?: string
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
  /**
   * Which of each club's players are entered in this competition, by club id.
   *
   * A club's squad belongs to the club and follows it everywhere; who is
   * registered for one particular competition does not. What a club absent from
   * this map means depends on `squadsStrict`.
   */
  squads?: Record<string, string[]>
  /** Set by the organiser when the deadline passes: managers can no longer change their squad. */
  squadsLocked?: boolean
  /**
   * Whether a club has to be entered before its players may be named.
   *
   * Off — the default, and what every competition did before this existed — a
   * club absent from `squads` has its whole squad registered, and anyone it
   * signs later joins automatically. That is the right answer for a friendly
   * league: nobody there wants to be told a new signing cannot play.
   *
   * On, a club absent from `squads` has nobody registered, and an entry is the
   * exact list it was saved as: a player signed afterwards does not join it.
   * That is what a competition with a registration deadline means by a squad.
   *
   * Turning it on enters every club's current squad first, so a season already
   * being played does not lose its teamsheets to a checkbox.
   */
  squadsStrict?: boolean
}

export type AppSettings = {
  theme: 'dark' | 'bright'
  backgroundTint: number
  backgroundImage?: string // Data URL for uploaded background image
}

