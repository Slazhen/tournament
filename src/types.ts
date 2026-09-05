export type Organizer = {
  id: string
  name: string
  email: string
  createdAtISO: string
  logo?: string
  description?: string
  /**
   * Clubs from the pool this organiser has put on their own list.
   *
   * Their own record and not the clubs': a club belongs to somebody else and
   * has no business carrying a list of the leagues eyeing it. Being on the list
   * is not a place in a competition — entering one still asks the club — so
   * what it buys is the club having a name, a crest and a row on the screens
   * this organiser works from before any of that has been decided.
   */
  shortlistedTeamIds?: string[]
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
  /**
   * Who runs this club, if anybody has taken it on.
   *
   * On the organizer's own copy of the record and stripped from every public
   * projection, because it is a list of accounts. The admin screens read it to
   * know what they may offer: a club with a manager is that manager's to edit,
   * and the API refuses the organizer's writes to it, so the editing controls
   * come off rather than saving into a refusal.
   */
  managerUserIds?: string[]
  /**
   * Set by a club that does not want organisers it does not play for to find it.
   *
   * The club's own decision, written by its managers or — while nobody has
   * taken it on — by the organiser who owns it. Absent means findable: a club
   * with a manager is in the pool every organiser searches unless it says
   * otherwise, because the opt-in this replaced left the pool empty and the
   * organiser looking through it learnt nothing.
   *
   * Hiding does not reach a competition the club is already in. Those
   * organisers see it through its accepted entry, which this does not touch.
   */
  hiddenFromPool?: boolean
  /**
   * The opt-in `hiddenFromPool` replaced. Read by nothing and written by
   * nothing — the club form sent it on every save, so `false` sits on records
   * whose managers never decided anything, and reading it as "hide me" would
   * take clubs out of the pool on the strength of a box they never saw.
   */
  discoverable?: boolean
  /**
   * Set by the API on another organiser's club that plays in one of yours.
   *
   * The record is there so the club can be named in the table, in the fixture
   * list and on a teamsheet; it is not there to be edited, and the API refuses
   * every write to it. Screens read this rather than comparing organiser ids,
   * because the super admin's copy of the list carries neither.
   */
  visiting?: boolean
  /**
   * A club on this organiser's list that plays in none of their competitions.
   *
   * Always `visiting` as well, so nothing offers to edit it. What it carries
   * beyond that is that the squad is deliberately absent rather than empty:
   * this organiser has picked the club off the pool, which the club has not
   * been asked about, and a squad is what a competition needs — the record
   * arrives whole once the club accepts an invitation.
   */
  poolOnly?: boolean
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
  /**
   * Kick-off, kept apart from the day.
   *
   * Only hand-built playoff rounds carry it: those were built with a date
   * picker and a time picker side by side, while every other fixture keeps both
   * in `dateISO`. Nothing derives from it — it is what the organiser's playoff
   * screen shows and writes.
   */
  time?: string
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
  /**
   * Set by the API on a fixture of a round the season is keeping back.
   *
   * It arrives instead of the fixture, not beside it: a hidden match carries no
   * id, no clubs, no date and no kick-off, only the round it belongs to. The
   * public pages draw it as a TBA row. Nothing ever writes this field — the
   * organiser hides a round, and `server/src/lib/rounds.ts` decides what that
   * means for each fixture in it.
   */
  hidden?: boolean
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
  /**
   * Whether the public may read this round's pairings yet.
   *
   * On the round itself, because a hand-built round is a record; a league round
   * is only a number on its fixtures, so the season carries `hiddenRounds`
   * instead. Absent means published, which is what every round did before the
   * flag existed.
   */
  hidden?: boolean
}

/**
 * A fixture in a hand-built playoff round.
 *
 * The same record as a `Match` in every way that matters — it carries goals,
 * cards, statistics and teamsheets, because the organiser's match screen and
 * the API's match routes reach these fixtures too — with two differences. The
 * two clubs are chosen after the round is created, so neither side is known
 * when it is first written; and the kick-off is kept as a separate `time`
 * beside the date, which is how these rounds were built before `dateISO`
 * carried both.
 */
export type CustomPlayoffMatchConfig = Partial<Omit<Match, 'id' | 'isElimination'>> & {
  id: string
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
  /**
   * The logo's own dominant colour, read from the file when it was uploaded.
   *
   * The public season header is painted in it, exactly as a club's header is
   * painted in `Team.crestColor`, and for the same reason: it cannot be read
   * later. The image bucket answers without CORS headers, so a canvas that has
   * drawn a published logo refuses its pixels, and the logo goes to S3 through
   * a presigned POST that no Lambda ever sees the bytes of — `utils/crest.ts`
   * covers both. Null where a logo was replaced by one that could not be
   * measured, so the header stops using the colour of a logo that is gone.
   */
  logoColor?: string | null
  /** Whether that logo is artwork on a solid plate rather than a cut-out mark. */
  logoOpaqueBackground?: boolean | null
  /**
   * The colour the organiser chose for this season's header, overriding the one
   * read from the logo.
   *
   * Separate from `logoColor` rather than written over it: uploading a new logo
   * re-reads the automatic colour, and a deliberate choice must survive that.
   * Absent means "whatever the logo says", which is what every season did
   * before this field existed.
   */
  themeColor?: string | null
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
  /**
   * The league rounds whose fixtures the public may not read yet, by round
   * number as the matches store it — from zero.
   *
   * The organiser draws a whole season at once and does not always want it read
   * that far ahead. A hidden round still appears on the public page, with a row
   * per fixture reading TBA; what leaves the API is nothing but the count.
   *
   * Only fixtures still to come are affected. A result is public whatever this
   * says, because the table beside it is worked out from those results and a
   * held-back score would make it wrong rather than discreet.
   */
  hiddenRounds?: number[]
}

export type AppSettings = {
  theme: 'dark' | 'bright'
  backgroundTint: number
  backgroundImage?: string // Data URL for uploaded background image
}

