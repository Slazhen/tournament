import { create } from 'zustand'
import type { Team, Tournament, Match, Organizer, Player, PlayerUpdate, AppSettings, CustomPlayoffRoundConfig } from './types'
import { generateGroupsWithDivisionsSchedule } from './utils/tournament'
import { advanceKnockoutWinners } from './utils/schedule'
import { applyMatchUpdate } from './utils/matches'
import { generateFixtures } from './utils/fixtures'
import { applySchedule } from './utils/matchdates'
import type { ScheduleOptions } from './utils/matchdates'
import { organizerService, teamService, tournamentService, matchService, playerService, uploadImage } from './lib/data'
import type { RoundExpectation } from './lib/data'
import { readCrestAppearance } from './utils/crest'

const playoffRoundsOf = (tournament: Tournament): CustomPlayoffRoundConfig[] =>
  tournament.format?.customPlayoffConfig?.playoffRounds ?? []

/** The same competition with a new list of hand-built playoff rounds. */
const withPlayoffRounds = (
  tournament: Tournament,
  rounds: CustomPlayoffRoundConfig[],
): Tournament => {
  const config = tournament.format?.customPlayoffConfig
  if (!tournament.format || !config) return tournament
  return {
    ...tournament,
    format: {
      ...tournament.format,
      customPlayoffConfig: { ...config, playoffRounds: rounds },
    },
  }
}

/** Routes that render an organizer's own teams and tournaments. */
const ADMIN_ROUTES = /^\/(admin|teams|tournaments|players|calendar)(\/|$)/

type AppStore = {
  // Organizers
  organizers: Organizer[]
  currentOrganizerId: string | null
  /**
   * The super admin administers every organizer at once rather than one of
   * them, so their admin screens are not scoped: `currentOrganizerId` stays
   * null and the listings return everything. Without this the store could not
   * tell "signed in as the super admin" from "signed out on a public page",
   * which is why the tournaments screen used to greet the super admin with
   * "No organizer selected".
   */
  superAdmin: boolean

  // Teams and Tournaments (now isolated per organizer)
  teams: Team[]
  tournaments: Tournament[]
  
  // Settings
  settings: AppSettings
  
  // Loading states
  loading: {
    organizers: boolean
    teams: boolean
    tournaments: boolean
  }
  
  // Actions
  createOrganizer: (name: string, email: string) => Promise<void>
  setCurrentOrganizer: (organizerId: string) => void
  /** Points the admin screens at whatever the signed-in account administers. */
  applyScope: (user: { role?: string; organizerId?: string } | null) => void
  updateOrganizer: (organizerId: string, updates: Partial<Organizer>) => Promise<void>
  deleteOrganizer: (organizerId: string, teamsTo?: string) => Promise<void>

  createTeam: (
    name: string,
    colors: string[],
    logo?: string,
    /** Which organizer owns the new club. Only the super admin has to say. */
    organizerId?: string,
  ) => Promise<Team | null>
  updateTeam: (teamId: string, updates: Partial<Team>) => Promise<void>
  deleteTeam: (teamId: string) => Promise<void>

  addPlayer: (teamId: string, player?: Partial<Player>) => Promise<Player | null>
  updatePlayer: (teamId: string, playerId: string, updates: PlayerUpdate) => Promise<void>
  removePlayer: (teamId: string, playerId: string) => Promise<void>
  
  createTournament: (
    name: string,
    teamIds: string[],
    format?: Tournament['format'],
    schedule?: ScheduleOptions,
    /** Anything else the new tournament carries: season fields, a copied logo, the venue. */
    extra?: Partial<Tournament>,
  ) => Promise<Tournament | null>
  updateTournament: (tournamentId: string, updates: Partial<Tournament>) => Promise<void>
  deleteTournament: (tournamentId: string) => Promise<void>
  
  /**
   * A result, and whatever it decides.
   *
   * Written as one match, like every other edit to a fixture. In a knockout the
   * result also names who plays next, so the affected ties are saved here too
   * rather than being retyped by hand.
   */
  setScore: (
    tournamentId: string,
    matchId: string,
    homeGoals: number | undefined,
    awayGoals: number | undefined,
  ) => Promise<void>
  /**
   * One match's own fields, written as that match.
   *
   * Not as a whole `matches` array: the match page used to save by sending
   * every fixture in the competition back from the copy this browser loaded,
   * so an edit made there undid anything saved in between — a score typed on
   * another screen, and a teamsheet a club's manager had just named.
   *
   * `undefined` becomes `null` on the way out. JSON drops an undefined value,
   * so a field emptied on screen would arrive as nothing at all and keep what
   * it had; null is how this API is told to clear one.
   */
  updateMatchFields: (
    tournamentId: string,
    matchId: string,
    updates: Partial<Match>,
  ) => Promise<void>
  /**
   * The playoff rounds an organiser builds by hand.
   *
   * One round at a time, through routes of their own. Sending the whole
   * `format` back — which is what these screens used to do, on every keystroke
   * of a round's name — replaces the fixtures inside every round from the copy
   * this browser is holding, and those fixtures now carry goals, cards and the
   * teamsheets a club's own manager writes.
   */
  addPlayoffRound: (tournamentId: string, round: Partial<CustomPlayoffRoundConfig>) => Promise<void>
  updatePlayoffRound: (
    tournamentId: string,
    index: number,
    updates: { name?: string; description?: string; quantityOfGames?: number },
    expected: RoundExpectation,
  ) => Promise<void>
  removePlayoffRound: (
    tournamentId: string,
    index: number,
    expected: RoundExpectation,
  ) => Promise<void>
  /**
   * One club's teamsheet for one match. Throws rather than swallowing, so a
   * ticked box that did not reach the server can say so.
   */
  setLineup: (
    tournamentId: string,
    matchId: string,
    teamId: string,
    playerIds: string[],
  ) => Promise<void>

  /**
   * Who one club has entered in one competition. Throws like `setLineup` and
   * for the same reason: the box is drawn from the record, so a save that did
   * not happen has to leave the record alone rather than lie about it.
   */
  setSquad: (tournamentId: string, teamId: string, playerIds: string[]) => Promise<void>
  
  updateSettings: (updates: Partial<AppStore['settings']>) => void
  
  // Getters (filtered by current organizer)
  getCurrentOrganizer: () => Organizer | null
  /** The organizer a tournament or club belongs to, whoever is looking at it. */
  getOrganizerById: (organizerId?: string) => Organizer | null
  getOrganizerTeams: () => Team[]
  getOrganizerTournaments: () => Tournament[]
  getAllTournaments: () => Tournament[]
  getAllTeams: () => Team[]
  
  // AWS-specific actions
  loadOrganizers: () => Promise<void>
  loadTeams: () => Promise<void>
  loadTournaments: () => Promise<void>
  uploadTeamLogo: (teamId: string, file: File) => Promise<void>
  uploadTeamPhoto: (teamId: string, file: File) => Promise<void>
  uploadPlayerPhoto: (teamId: string, playerId: string, file: File) => Promise<void>
  uploadTournamentLogo: (tournamentId: string, file: File) => Promise<void>
  uploadTournamentBackground: (tournamentId: string, file: File) => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  organizers: [],
  currentOrganizerId: null,
  superAdmin: false,
  teams: [],
  tournaments: [],
  settings: {
    theme: 'dark',
    backgroundTint: 0.5,
    backgroundImage: undefined,
  },
  loading: {
    organizers: false,
    teams: false,
    tournaments: false,
  },

  // Organizer actions
  createOrganizer: async (name: string, email: string) => {
    set(state => ({ loading: { ...state.loading, organizers: true } }))
    
    try {
      const organizer = await organizerService.create(name, email)
      if (organizer) {
        set(state => ({
          organizers: [...state.organizers, organizer],
          loading: { ...state.loading, organizers: false }
        }))
      }
    } catch (error) {
      console.error('Error creating organizer:', error)
      set(state => ({ loading: { ...state.loading, organizers: false } }))
    }
  },

  /**
   * `teamsTo` is the organizer this one's clubs move to; the server requires it
   * whenever there are any.
   *
   * The failure is rethrown rather than logged and swallowed. Swallowing it is
   * how a delete that the server refused could still look like it had worked:
   * the row vanished from the list on screen and came back on the next reload.
   */
  deleteOrganizer: async (organizerId: string, teamsTo?: string) => {
    set(state => ({ loading: { ...state.loading, organizers: true } }))

    try {
      await organizerService.delete(organizerId, teamsTo)
      set(state => ({
        organizers: state.organizers.filter(org => org.id !== organizerId),
        // The competitions went with it, and the clubs changed hands.
        tournaments: state.tournaments.filter(t => t.organizerId !== organizerId),
        teams: state.teams.map(team =>
          team.organizerId === organizerId && teamsTo
            ? { ...team, organizerId: teamsTo }
            : team,
        ),
        loading: { ...state.loading, organizers: false }
      }))

      // If this was the current organizer, clear it
      if (get().currentOrganizerId === organizerId) {
        get().setCurrentOrganizer('')
      }
    } catch (error) {
      set(state => ({ loading: { ...state.loading, organizers: false } }))
      throw error
    }
  },

  setCurrentOrganizer: (organizerId: string) => {
    set({ currentOrganizerId: organizerId || null })
    // Persist to localStorage (or remove if empty)
    try {
      if (organizerId) {
        localStorage.setItem('currentOrganizerId', organizerId)
        // Preload the organizer's data only on the screens that show it. Doing it
        // on every route meant a signed-in user opening a public tournament page
        // also pulled their whole team and tournament list in the background.
        if (ADMIN_ROUTES.test(window.location.pathname)) {
          get().loadTeams()
          get().loadTournaments()
        }
      } else {
        localStorage.removeItem('currentOrganizerId')
      }
    } catch (error) {
      console.error('Store: Error managing localStorage:', error)
    }
  },

  /**
   * Called once the session is known, and again on every sign in and sign out.
   *
   * An organizer's screens are scoped to their own id. The super admin's are
   * not scoped at all: they administer every organizer, so the listings load
   * whole and each screen works out which organizer the thing in front of it
   * belongs to.
   */
  applyScope: (user) => {
    const superAdmin = user?.role === 'super_admin'
    // Signing out, or in as somebody else, must not leave the previous
    // account's clubs and competitions in the store for the next screen to
    // render.
    set({ superAdmin, teams: [], tournaments: [] })

    if (user?.role === 'organizer' && user.organizerId) {
      get().setCurrentOrganizer(user.organizerId)
      return
    }

    get().setCurrentOrganizer('')
    // The same guard an organiser's load has had since it was written. These
    // two are a scan of every club and a scan of every competition, and a
    // public page reads neither: /:orgSlug and everything under it is a
    // different branch of the router, which does not even mount the admin
    // shell. The super admin made both of them on every page they opened while
    // signed in, so a public page they were reading as an organiser cost three
    // API calls instead of one - and on a cold API, three containers starting
    // rather than one. Every screen that shows the lists loads them itself:
    // AdminPage for /dashboard, TeamsPage and TournamentsPage for their own,
    // and the rest sit under ADMIN_ROUTES.
    if (superAdmin && ADMIN_ROUTES.test(window.location.pathname)) {
      get().loadTeams()
      get().loadTournaments()
    }
  },

  updateOrganizer: async (organizerId: string, updates: Partial<Organizer>) => {
    try {
      const success = await organizerService.update(organizerId, updates)
      if (success) {
        set(state => ({
          organizers: state.organizers.map(org =>
            org.id === organizerId ? { ...org, ...updates } : org
          )
        }))
      }
    } catch (error) {
      console.error('Error updating organizer:', error)
    }
  },

  // Team actions
  // `organizerId` is for the super admin, who administers no single organizer
  // and so has to say which one the club belongs to. An organiser's own scope
  // wins over anything passed in; the API would refuse a foreign id anyway.
  createTeam: async (name: string, colors: string[], logo?: string, organizerId?: string) => {
    const owner = get().currentOrganizerId ?? (get().superAdmin ? organizerId : undefined)
    if (!owner) return null

    set(state => ({ loading: { ...state.loading, teams: true } }))

    try {
      const team = await teamService.create({
        name,
        colors,
        logo: logo || '',
        organizerId: owner,
        players: [],
        socialMedia: {},
      })
      
      if (team) {
        set(state => ({
          teams: [...state.teams, team],
          loading: { ...state.loading, teams: false }
        }))
        // Returned so the caller can attach a logo without searching for the
        // team it just made in a list that has not re-rendered yet.
        return team
      }
    } catch (error) {
      console.error('Error creating team:', error)
      set(state => ({ loading: { ...state.loading, teams: false } }))
    }

    return null
  },

  updateTeam: async (teamId: string, updates: Partial<Team>) => {
    try {
      const success = await teamService.update(teamId, updates)
      if (success) {
        set(state => ({
          teams: state.teams.map(team =>
            team.id === teamId ? { ...team, ...updates } : team
          )
        }))
      }
    } catch (error) {
      console.error('Error updating team:', error)
    }
  },

  deleteTeam: async (teamId: string) => {
    try {
      const success = await teamService.delete(teamId)
      if (success) {
        set(state => ({
          teams: state.teams.filter(team => team.id !== teamId)
        }))
      }
    } catch (error) {
      console.error('Error deleting team:', error)
    }
  },

  // Player actions.
  //
  // Each of these saves one player. Sending the team's whole squad back on every
  // edit is what used to make two quick changes overwrite each other.
  addPlayer: async (teamId: string, player: Partial<Player> = {}) => {
    try {
      const created = await playerService.add(teamId, {
        firstName: '',
        lastName: '',
        position: 'Forward',
        isPublic: true,
        ...player,
      })
      set(state => ({
        teams: state.teams.map(team =>
          team.id === teamId
            ? { ...team, players: [...(team.players || []), created] }
            : team
        )
      }))
      return created
    } catch (error) {
      console.error('Error adding player:', error)
      return null
    }
  },

  updatePlayer: async (teamId: string, playerId: string, updates: PlayerUpdate) => {
    // The same rule the API applies: a null clears the field rather than being
    // stored, so the copy on screen matches what was saved.
    const applied = (player: Player): Player => {
      const next = { ...player, ...updates } as Record<string, unknown>
      for (const [field, value] of Object.entries(updates)) {
        if (value === null) delete next[field]
      }
      return next as Player
    }

    const previous = get().teams.find(t => t.id === teamId)?.players?.find(p => p.id === playerId)

    // Show the change straight away, then confirm it with the server.
    set(state => ({
      teams: state.teams.map(team =>
        team.id === teamId
          ? {
              ...team,
              players: (team.players || []).map(p => (p.id === playerId ? applied(p) : p))
            }
          : team
      )
    }))

    try {
      await playerService.update(teamId, playerId, updates)
    } catch (error) {
      console.error('Error updating player:', error)
      // The save failed, so put the old values back rather than showing the user
      // an edit that only exists in their browser.
      if (previous) {
        set(state => ({
          teams: state.teams.map(team =>
            team.id === teamId
              ? {
                  ...team,
                  players: (team.players || []).map(p => (p.id === playerId ? previous : p))
                }
              : team
          )
        }))
      }
    }
  },

  removePlayer: async (teamId: string, playerId: string) => {
    try {
      await playerService.remove(teamId, playerId)
      set(state => ({
        teams: state.teams.map(team =>
          team.id === teamId
            ? { ...team, players: (team.players || []).filter(p => p.id !== playerId) }
            : team
        )
      }))
    } catch (error) {
      console.error('Error removing player:', error)
    }
  },

  // Tournament actions
  createTournament: async (
    name: string,
    teamIds: string[],
    format?: Tournament['format'],
    schedule?: ScheduleOptions,
    extra?: Partial<Tournament>,
  ) => {
    // The super admin has no scope of their own, so the screen tells us which
    // organizer is running this one through `extra.organizerId`.
    const owner =
      get().currentOrganizerId ?? (get().superAdmin ? extra?.organizerId : undefined)
    if (!owner) return null

    console.log('Store: Creating tournament via AWS:', {
      name,
      teamIds,
      format,
      organizerId: owner
    })

    set(state => ({ loading: { ...state.loading, tournaments: true } }))
    
    try {
      const tournament = await tournamentService.create({
        // A new season inherits the venue, the crest and the links from the one
        // before it, which is most of what an organiser would otherwise retype.
        ...extra,
        name,
        format: format || { rounds: 1, mode: 'league' },
        teamIds,
        organizerId: owner,
        matches: [],
        visibility: 'private', // Default to private, organizer can make it public later
      })
      
      if (tournament) {
        // Generate matches based on format
        let matches: Match[] = []
        const tournamentFormat = format || { rounds: 1, mode: 'league' }
        
        // One generator for every format, shared with the settings screen.
        // This branch used to call generateRoundRobinSchedule() without the leg
        // count, so "League, home and away" quietly produced a single round.
        if (tournamentFormat.mode !== 'groups_with_divisions') {
          matches = generateFixtures(teamIds, tournamentFormat)
        } else if (tournamentFormat.mode === 'groups_with_divisions') {
          // Generate groups with divisions format
          const config = tournamentFormat.groupsWithDivisionsConfig
          if (!config) {
            console.error('groups_with_divisions format requires groupsWithDivisionsConfig')
            matches = []
          } else {
            const result = generateGroupsWithDivisionsSchedule(teamIds, {
              numberOfGroups: config.numberOfGroups,
              teamsPerGroup: config.teamsPerGroup,
              groupRounds: config.groupRounds,
              existingGroups: config.groups // Use existing groups if available
            })
            matches = result.matches
            
            // Store group assignments in tournament format
            if (tournament.format) {
              tournament.format.groupsWithDivisionsConfig = {
                ...config,
                groups: result.groups
              }
            }
          }
        }
        
        // Put the fixtures in the calendar straight away, if a start date was given.
        // Filling in twenty-odd dates by hand afterwards is the slowest part of
        // setting up a season.
        if (schedule?.startDate) {
          matches = applySchedule(matches, schedule)
        }

        // Update tournament with generated matches and format (which includes groups)
        const updatedTournament = { ...tournament, matches, format: tournament.format }
        await tournamentService.update(tournament.id, { matches, format: tournament.format })
        
        set(state => ({
          tournaments: [...state.tournaments, updatedTournament],
          loading: { ...state.loading, tournaments: false }
        }))

        // Returned so the caller can send the organiser straight to it.
        return updatedTournament
      }
    } catch (error) {
      console.error('Error creating tournament:', error)
      set(state => ({ loading: { ...state.loading, tournaments: false } }))
    }

    return null
  },

  updateTournament: async (tournamentId: string, updates: Partial<Tournament>) => {
    try {
      console.log('Store: Updating tournament in AWS:', { tournamentId, updates })
      
      const success = await tournamentService.update(tournamentId, updates)
      console.log('Store: AWS update result:', success)
      
      if (success) {
        console.log('Store: Updating local state with:', updates)
        set(state => ({
          tournaments: state.tournaments.map(tournament =>
            tournament.id === tournamentId ? { ...tournament, ...updates } : tournament
          )
        }))
        console.log('Store: Local state updated successfully')
      } else {
        console.error('Store: AWS update failed')
      }
    } catch (error) {
      console.error('Store: Error updating tournament:', error)
    }
  },

  deleteTournament: async (tournamentId: string) => {
    try {
      const success = await tournamentService.delete(tournamentId)
      if (success) {
        set(state => ({
          tournaments: state.tournaments.filter(tournament => tournament.id !== tournamentId)
        }))
      }
    } catch (error) {
      console.error('Error deleting tournament:', error)
    }
  },

  // Match actions
  setScore: async (
    tournamentId: string,
    matchId: string,
    homeGoals: number | undefined,
    awayGoals: number | undefined,
  ) => {
    const { tournaments, updateMatchFields } = get()
    const tournament = tournaments.find((one) => one.id === tournamentId)
    if (!tournament) return

    await updateMatchFields(tournamentId, matchId, { homeGoals, awayGoals })

    // In a cup the result decides who plays next. Work that out from the state
    // the write above has already left behind, and save only the ties that
    // actually moved — each as its own match, so nothing else is touched.
    if (tournament.format?.mode !== 'knockout') return

    const saved = get().tournaments.find((one) => one.id === tournamentId)
    if (!saved) return

    const advanced = advanceKnockoutWinners(saved.matches)
    for (let index = 0; index < advanced.length; index++) {
      const next = advanced[index]
      const previous = saved.matches[index]
      if (next.homeTeamId === previous.homeTeamId && next.awayTeamId === previous.awayTeamId) {
        continue
      }
      await updateMatchFields(tournamentId, next.id, {
        homeTeamId: next.homeTeamId,
        awayTeamId: next.awayTeamId,
      })
    }
  },

  updateMatchFields: async (
    tournamentId: string,
    matchId: string,
    updates: Partial<Match>,
  ) => {
    const body = Object.fromEntries(
      Object.entries(updates).map(([field, value]) => [field, value === undefined ? null : value]),
    ) as Partial<Match>

    await matchService.updateMatchInTournament(tournamentId, matchId, body)

    set(state => ({
      tournaments: state.tournaments.map(tournament =>
        tournament.id === tournamentId
          ? applyMatchUpdate(tournament, matchId, match => ({ ...match, ...updates }))
          : tournament,
      ),
    }))
  },

  addPlayoffRound: async (tournamentId: string, round: Partial<CustomPlayoffRoundConfig>) => {
    const stored = await tournamentService.addPlayoffRound(tournamentId, round)
    set(state => ({
      tournaments: state.tournaments.map(tournament =>
        tournament.id === tournamentId
          ? withPlayoffRounds(tournament, [...playoffRoundsOf(tournament), stored])
          : tournament,
      ),
    }))
  },

  updatePlayoffRound: async (
    tournamentId: string,
    index: number,
    updates: { name?: string; description?: string; quantityOfGames?: number },
    expected: RoundExpectation,
  ) => {
    const stored = await tournamentService.updatePlayoffRound(
      tournamentId,
      index,
      updates,
      expected,
    )
    set(state => ({
      tournaments: state.tournaments.map(tournament =>
        tournament.id === tournamentId
          ? withPlayoffRounds(
              tournament,
              // The server's answer, not the request: it works the fixtures out
              // from the stored round, so a round that grew comes back with the
              // new games already in it.
              playoffRoundsOf(tournament).map((round, at) => (at === index ? stored : round)),
            )
          : tournament,
      ),
    }))
  },

  removePlayoffRound: async (
    tournamentId: string,
    index: number,
    expected: RoundExpectation,
  ) => {
    await tournamentService.removePlayoffRound(tournamentId, index, expected)
    set(state => ({
      tournaments: state.tournaments.map(tournament =>
        tournament.id === tournamentId
          ? withPlayoffRounds(
              tournament,
              playoffRoundsOf(tournament).filter((_, at) => at !== index),
            )
          : tournament,
      ),
    }))
  },

  /**
   * One club's teamsheet for one match.
   *
   * Sent as one side of one fixture rather than as a whole `matches` array,
   * because the other side belongs to the opposing club's manager now: writing
   * the list back whole is how a teamsheet saved on a phone disappears the next
   * time the organiser ticks a box.
   */
  setLineup: async (
    tournamentId: string,
    matchId: string,
    teamId: string,
    playerIds: string[],
  ) => {
    const { playerIds: saved } = await matchService.saveLineup(
      tournamentId,
      matchId,
      teamId,
      playerIds,
    )

    set(state => ({
      tournaments: state.tournaments.map(tournament => {
        if (tournament.id !== tournamentId) return tournament
        return applyMatchUpdate(tournament, matchId, match => {
          if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) return match
          const side = match.homeTeamId === teamId ? 'home' : 'away'
          const lineups = {
            home: {
              starting: match.lineups?.home?.starting ?? [],
              substitutes: match.lineups?.home?.substitutes ?? [],
            },
            away: {
              starting: match.lineups?.away?.starting ?? [],
              substitutes: match.lineups?.away?.substitutes ?? [],
            },
          }
          // The server's answer, not the request: it drops anyone no longer
          // registered, and the screen should show what was actually stored.
          lineups[side] = { ...lineups[side], starting: saved }
          return { ...match, lineups }
        })
      }),
    }))
  },

  setSquad: async (tournamentId: string, teamId: string, playerIds: string[]) => {
    const { playerIds: saved, all } = await tournamentService.saveSquad(
      tournamentId,
      teamId,
      playerIds,
    )

    set(state => ({
      tournaments: state.tournaments.map(tournament => {
        if (tournament.id !== tournamentId) return tournament
        const squads = { ...(tournament.squads ?? {}) }
        // What the server stored, not what was asked for. In an ordinary
        // competition a whole squad is stored as no entry at all, so that a
        // player signed next week joins automatically; keeping the list here
        // would show the same ticks over a different meaning.
        if (all && tournament.squadsStrict !== true) delete squads[teamId]
        else squads[teamId] = saved
        return { ...tournament, squads }
      }),
    }))
  },

  // Settings
  updateSettings: (updates: Partial<AppStore['settings']>) => {
    set(state => ({
      settings: { ...state.settings, ...updates }
    }))
  },

  // Getters
  getCurrentOrganizer: () => {
    const { organizers, currentOrganizerId } = get()
    return organizers.find(org => org.id === currentOrganizerId) || null
  },

  getOrganizerById: (organizerId?: string) => {
    if (!organizerId) return null
    return get().organizers.find(org => org.id === organizerId) || null
  },

  // Scoped to the organizer being administered — everything, for a super admin,
  // who administers all of them.
  getOrganizerTeams: () => {
    const { teams, currentOrganizerId, superAdmin } = get()
    if (!currentOrganizerId) return superAdmin ? teams : []
    return teams.filter(team => team.organizerId === currentOrganizerId)
  },

  getOrganizerTournaments: () => {
    const { tournaments, currentOrganizerId, superAdmin } = get()
    if (!currentOrganizerId) return superAdmin ? tournaments : []
    return tournaments.filter(tournament => tournament.organizerId === currentOrganizerId)
  },

  getAllTournaments: () => {
    const { tournaments } = get()
    return tournaments
  },

  getAllTeams: () => {
    const { teams } = get()
    return teams
  },

  // AWS-specific actions
  loadOrganizers: async () => {
    set(state => ({ loading: { ...state.loading, organizers: true } }))
    
    try {
      const organizers = await organizerService.getAll()
      set({
        organizers,
        loading: { ...get().loading, organizers: false }
      })
      
      // Restore current organizer from localStorage. Never for the super admin:
      // an id left over from an earlier session would quietly narrow their
      // screens to one organizer's data with nothing on the page saying so.
      try {
        const savedOrganizerId = get().superAdmin ? null : localStorage.getItem('currentOrganizerId')
        if (savedOrganizerId && organizers.find(org => org.id === savedOrganizerId)) {
          console.log('Store: Restoring current organizer from localStorage:', savedOrganizerId)
          set({ currentOrganizerId: savedOrganizerId })
          // Load data for the restored organizer
          get().loadTeams()
          get().loadTournaments()
        }
      } catch (error) {
        console.error('Store: Error restoring organizer from localStorage:', error)
        // Clear potentially corrupted localStorage
        localStorage.removeItem('currentOrganizerId')
      }
    } catch (error) {
      console.error('Error loading organizers:', error)
      set(state => ({ loading: { ...state.loading, organizers: false } }))
    }
  },

  loadTeams: async () => {
    const currentOrganizerId = get().currentOrganizerId
    const state = get()
    
    // Skip if already loading to prevent duplicate requests
    if (state.loading.teams) {
      return
    }
    
    // Already loaded for a public page in this session: nothing to re-fetch.
    // Not for the super admin, who never has an organizer id and would
    // otherwise be stuck with whatever the first load returned.
    if (!currentOrganizerId && !state.superAdmin && state.teams.length > 0) {
      return
    }
    
    set(state => ({ loading: { ...state.loading, teams: true } }))
    
    // For public pages (no organizer), load all teams
    if (!currentOrganizerId) {
      try {
        const allTeams = await teamService.getAll()
        set({
          teams: allTeams,
          loading: { ...get().loading, teams: false }
        })
        return
      } catch (error) {
        console.error('Error loading all teams:', error)
        set(state => ({ loading: { ...state.loading, teams: false } }))
        return
      }
    }
    
    try {
      const teams = await teamService.getByOrganizer(currentOrganizerId)
      set({
        teams,
        loading: { ...get().loading, teams: false }
      })
    } catch (error) {
      console.error('Error loading teams:', error)
      set(state => ({ loading: { ...state.loading, teams: false } }))
    }
  },

  loadTournaments: async () => {
    const currentOrganizerId = get().currentOrganizerId
    const state = get()
    
    // Skip if already loading to prevent duplicate requests
    if (state.loading.tournaments) {
      return
    }
    
    // Already loaded for a public page in this session: nothing to re-fetch.
    // Not for the super admin, who never has an organizer id and would
    // otherwise be stuck with whatever the first load returned.
    if (!currentOrganizerId && !state.superAdmin && state.tournaments.length > 0) {
      return
    }
    
    set(state => ({ loading: { ...state.loading, tournaments: true } }))
    
    // For public pages (no organizer), load all tournaments
    if (!currentOrganizerId) {
      try {
        const allTournaments = await tournamentService.getAll()
        set({
          tournaments: allTournaments,
          loading: { ...get().loading, tournaments: false }
        })
        return
      } catch (error) {
        console.error('Error loading all tournaments:', error)
        set(state => ({ loading: { ...state.loading, tournaments: false } }))
        return
      }
    }
    
    try {
      const tournaments = await tournamentService.getByOrganizer(currentOrganizerId)
      set({
        tournaments,
        loading: { ...get().loading, tournaments: false }
      })
    } catch (error) {
      console.error('Error loading tournaments:', error)
      set(state => ({ loading: { ...state.loading, tournaments: false } }))
    }
  },

  uploadTeamLogo: async (teamId: string, file: File) => {
    try {
      const url = await uploadImage(file, { kind: 'team', id: teamId })

      // The crest's colours have to be read here, from the file, because the
      // published image is served without CORS headers and a canvas that has
      // drawn it will not hand its pixels back. A crest that could not be read
      // clears what the previous one left, or the header keeps painting itself
      // in the colour of a badge the club no longer has.
      const appearance = await readCrestAppearance(file)
      await get().updateTeam(teamId, {
        logo: url,
        ...(appearance ?? { crestColor: null, crestOpaqueBackground: null }),
      })
    } catch (error) {
      console.error('Error uploading team logo:', error)
    }
  },

  uploadTeamPhoto: async (teamId: string, file: File) => {
    try {
      const url = await uploadImage(file, { kind: 'team', id: teamId })
      
      await get().updateTeam(teamId, { photo: url })
    } catch (error) {
      console.error('Error uploading team photo:', error)
    }
  },

  uploadPlayerPhoto: async (teamId: string, playerId: string, file: File) => {
    try {
      const url = await uploadImage(file, { kind: 'player', id: teamId })
      await get().updatePlayer(teamId, playerId, { photo: url })
    } catch (error) {
      console.error('Error uploading player photo:', error)
    }
  },

  uploadTournamentLogo: async (tournamentId: string, file: File) => {
    try {
      const url = await uploadImage(file, { kind: 'tournament', id: tournamentId })
      await get().updateTournament(tournamentId, { logo: url })
    } catch (error) {
      console.error('Store: Error uploading tournament logo:', error)
    }
  },

  uploadTournamentBackground: async (tournamentId: string, file: File) => {
    try {
      const url = await uploadImage(file, { kind: 'tournament', id: tournamentId })
      
      await get().updateTournament(tournamentId, { backgroundImage: url })
    } catch (error) {
      console.error('Error uploading tournament background:', error)
    }
  },
}))
