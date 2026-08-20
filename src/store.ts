import { create } from 'zustand'
import type { Team, Tournament, Match, Organizer, Player, AppSettings } from './types'
import { generateRoundRobinSchedule, generatePlayoffBrackets, createPlayoffMatches, generateSwissEliminationSchedule, generateGroupsWithDivisionsSchedule } from './utils/tournament'
import { generateKnockoutSchedule, advanceKnockoutWinners } from './utils/schedule'
import { applySchedule } from './utils/matchdates'
import type { ScheduleOptions } from './utils/matchdates'
import { organizerService, teamService, tournamentService, matchService, playerService, uploadImage } from './lib/data'

/** Routes that render an organizer's own teams and tournaments. */
const ADMIN_ROUTES = /^\/(admin|teams|tournaments|players|calendar)(\/|$)/

type AppStore = {
  // Organizers
  organizers: Organizer[]
  currentOrganizerId: string | null
  
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
  updateOrganizer: (organizerId: string, updates: Partial<Organizer>) => Promise<void>
  deleteOrganizer: (organizerId: string) => Promise<void>
  
  createTeam: (name: string, colors: string[], logo?: string) => Promise<void>
  updateTeam: (teamId: string, updates: Partial<Team>) => Promise<void>
  deleteTeam: (teamId: string) => Promise<void>

  addPlayer: (teamId: string, player?: Partial<Player>) => Promise<Player | null>
  updatePlayer: (teamId: string, playerId: string, updates: Partial<Player>) => Promise<void>
  removePlayer: (teamId: string, playerId: string) => Promise<void>
  
  createTournament: (name: string, teamIds: string[], format?: Tournament['format'], schedule?: ScheduleOptions) => Promise<void>
  updateTournament: (tournamentId: string, updates: Partial<Tournament>) => Promise<void>
  deleteTournament: (tournamentId: string) => Promise<void>
  
  setScore: (matchId: string, homeGoals: number, awayGoals: number) => Promise<void>
  setDate: (matchId: string, dateISO: string) => Promise<void>
  
  updateSettings: (updates: Partial<AppStore['settings']>) => void
  
  // Getters (filtered by current organizer)
  getCurrentOrganizer: () => Organizer | null
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

  deleteOrganizer: async (organizerId: string) => {
    set(state => ({ loading: { ...state.loading, organizers: true } }))
    
    try {
      await organizerService.delete(organizerId)
      set(state => ({
        organizers: state.organizers.filter(org => org.id !== organizerId),
        loading: { ...state.loading, organizers: false }
      }))
      
      // If this was the current organizer, clear it
      if (get().currentOrganizerId === organizerId) {
        get().setCurrentOrganizer('')
      }
    } catch (error) {
      console.error('Error deleting organizer:', error)
      set(state => ({ loading: { ...state.loading, organizers: false } }))
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
  createTeam: async (name: string, colors: string[], logo?: string) => {
    const currentOrganizerId = get().currentOrganizerId
    if (!currentOrganizerId) return

    set(state => ({ loading: { ...state.loading, teams: true } }))
    
    try {
      const team = await teamService.create({
        name,
        colors,
        logo: logo || '',
        organizerId: currentOrganizerId,
        players: [],
        socialMedia: {},
      })
      
      if (team) {
        set(state => ({
          teams: [...state.teams, team],
          loading: { ...state.loading, teams: false }
        }))
      }
    } catch (error) {
      console.error('Error creating team:', error)
      set(state => ({ loading: { ...state.loading, teams: false } }))
    }
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

  updatePlayer: async (teamId: string, playerId: string, updates: Partial<Player>) => {
    const previous = get().teams.find(t => t.id === teamId)?.players?.find(p => p.id === playerId)

    // Show the change straight away, then confirm it with the server.
    set(state => ({
      teams: state.teams.map(team =>
        team.id === teamId
          ? {
              ...team,
              players: (team.players || []).map(p =>
                p.id === playerId ? { ...p, ...updates } : p
              )
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
  createTournament: async (name: string, teamIds: string[], format?: Tournament['format'], schedule?: ScheduleOptions) => {
    const currentOrganizerId = get().currentOrganizerId
    if (!currentOrganizerId) return

    console.log('Store: Creating tournament via AWS:', {
      name,
      teamIds,
      format,
      organizerId: currentOrganizerId
    })

    set(state => ({ loading: { ...state.loading, tournaments: true } }))
    
    try {
      const tournament = await tournamentService.create({
        name,
        format: format || { rounds: 1, mode: 'league' },
        teamIds,
        organizerId: currentOrganizerId,
        matches: [],
        visibility: 'private', // Default to private, organizer can make it public later
      })
      
      if (tournament) {
        // Generate matches based on format
        let matches: Match[] = []
        const tournamentFormat = format || { rounds: 1, mode: 'league' }
        
        if (tournamentFormat.mode === 'league') {
          matches = generateRoundRobinSchedule(teamIds)
        } else if (tournamentFormat.mode === 'league_playoff') {
          const playoffMatches = generatePlayoffBrackets(teamIds)
          matches = createPlayoffMatches(playoffMatches)
        } else if (tournamentFormat.mode === 'knockout') {
          matches = generateKnockoutSchedule(teamIds)
        } else if (tournamentFormat.mode === 'swiss_elimination') {
          const swissResult = generateSwissEliminationSchedule(teamIds)
          matches = [...swissResult.leagueMatches, ...swissResult.eliminationMatches]
        } else if (tournamentFormat.mode === 'league_custom_playoff') {
          // Generate round-robin matches first (with BYE handling for odd numbers)
          const leagueMatches = generateRoundRobinSchedule(teamIds, tournamentFormat.rounds || 1)
          
          // For now, just create the league matches
          // Playoff rounds will be configured later by the admin
          matches = leagueMatches
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
      }
    } catch (error) {
      console.error('Error creating tournament:', error)
      set(state => ({ loading: { ...state.loading, tournaments: false } }))
    }
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
  setScore: async (matchId: string, homeGoals: number, awayGoals: number) => {
    const { tournaments } = get()
    
    for (const tournament of tournaments) {
      const match = tournament.matches.find(m => m.id === matchId)
      if (match) {
        try {
          const success = await matchService.updateMatchInTournament(tournament.id, matchId, {
            homeGoals,
            awayGoals,
          })
          
          if (success) {
            const scored = tournament.matches.map(m =>
              m.id === matchId ? { ...m, homeGoals, awayGoals } : m
            )

            // In a cup, a result decides who plays in the next round. Work that
            // out here and save the affected fixture, so the bracket fills itself
            // in instead of being retyped by hand.
            const advanced = advanceKnockoutWinners(scored)
            const movedOn = advanced.filter((m, index) =>
              m.homeTeamId !== scored[index].homeTeamId || m.awayTeamId !== scored[index].awayTeamId
            )

            for (const next of movedOn) {
              await matchService.updateMatchInTournament(tournament.id, next.id, {
                homeTeamId: next.homeTeamId,
                awayTeamId: next.awayTeamId,
              })
            }

            set(state => ({
              tournaments: state.tournaments.map(t =>
                t.id === tournament.id ? { ...t, matches: advanced } : t
              )
            }))
          }
        } catch (error) {
          console.error('Error updating match score:', error)
        }
        break
      }
    }
  },

  setDate: async (matchId: string, dateISO: string) => {
    const { tournaments } = get()
    
    for (const tournament of tournaments) {
      const match = tournament.matches.find(m => m.id === matchId)
      if (match) {
        try {
          const success = await matchService.updateMatchInTournament(tournament.id, matchId, {
            dateISO,
          })
          
          if (success) {
            set(state => ({
              tournaments: state.tournaments.map(t =>
                t.id === tournament.id
                  ? {
                      ...t,
                      matches: t.matches.map(m =>
                        m.id === matchId ? { ...m, dateISO } : m
                      )
                    }
                  : t
              )
            }))
          }
        } catch (error) {
          console.error('Error updating match date:', error)
        }
        break
      }
    }
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

  getOrganizerTeams: () => {
    const { teams, currentOrganizerId } = get()
    return teams.filter(team => team.organizerId === currentOrganizerId)
  },

  getOrganizerTournaments: () => {
    const { tournaments, currentOrganizerId } = get()
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
      
      // Restore current organizer from localStorage
      try {
        const savedOrganizerId = localStorage.getItem('currentOrganizerId')
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
    if (!currentOrganizerId && state.teams.length > 0) {
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
    if (!currentOrganizerId && state.tournaments.length > 0) {
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
      
      await get().updateTeam(teamId, { logo: url })
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
