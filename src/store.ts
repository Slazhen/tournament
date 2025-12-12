import { create } from 'zustand'
import type { Team, Tournament, Match, Organizer, AppSettings } from './types'
import { generateRoundRobinSchedule, generatePlayoffBrackets, createPlayoffMatches, generateSwissEliminationSchedule } from './utils/tournament'
import { organizerService, teamService, tournamentService, matchService, uploadImageToS3 } from './lib/aws-database'

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
  
  createTournament: (name: string, teamIds: string[], format?: Tournament['format']) => Promise<void>
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
        // Load data for the selected organizer
        get().loadTeams()
        get().loadTournaments()
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

  // Tournament actions
  createTournament: async (name: string, teamIds: string[], format?: Tournament['format']) => {
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
        } else if (tournamentFormat.mode === 'swiss_elimination') {
          const swissResult = generateSwissEliminationSchedule(teamIds)
          matches = [...swissResult.leagueMatches, ...swissResult.eliminationMatches]
        } else if (tournamentFormat.mode === 'league_custom_playoff') {
          // Generate round-robin matches first (with BYE handling for odd numbers)
          const leagueMatches = generateRoundRobinSchedule(teamIds, tournamentFormat.rounds || 1)
          
          // For now, just create the league matches
          // Playoff rounds will be configured later by the admin
          matches = leagueMatches
        }
        
        // Update tournament with generated matches
        const updatedTournament = { ...tournament, matches }
        await tournamentService.update(tournament.id, { matches })
        
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
            set(state => ({
              tournaments: state.tournaments.map(t =>
                t.id === tournament.id
                  ? {
                      ...t,
                      matches: t.matches.map(m =>
                        m.id === matchId ? { ...m, homeGoals, awayGoals } : m
                      )
                    }
                  : t
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
      const key = `teams/${teamId}/logo-${Date.now()}.${file.name.split('.').pop()}`
      const url = await uploadImageToS3(file, key)
      
      await get().updateTeam(teamId, { logo: url })
    } catch (error) {
      console.error('Error uploading team logo:', error)
    }
  },

  uploadTeamPhoto: async (teamId: string, file: File) => {
    try {
      const key = `teams/${teamId}/photo-${Date.now()}.${file.name.split('.').pop()}`
      const url = await uploadImageToS3(file, key)
      
      await get().updateTeam(teamId, { photo: url })
    } catch (error) {
      console.error('Error uploading team photo:', error)
    }
  },

  uploadPlayerPhoto: async (teamId: string, playerId: string, file: File) => {
    try {
      const key = `teams/${teamId}/players/${playerId}/photo-${Date.now()}.${file.name.split('.').pop()}`
      const url = await uploadImageToS3(file, key)
      
      // Update the specific player's photo in the team
      const team = get().teams.find(t => t.id === teamId)
      if (team && team.players) {
        const updatedPlayers = team.players.map(p => 
          p.id === playerId ? { ...p, photo: url } : p
        )
        await get().updateTeam(teamId, { players: updatedPlayers })
      }
    } catch (error) {
      console.error('Error uploading player photo:', error)
    }
  },

  uploadTournamentLogo: async (tournamentId: string, file: File) => {
    try {
      console.log('Store: Starting tournament logo upload:', { tournamentId, fileName: file.name })
      
      const key = `tournaments/${tournamentId}/logo-${Date.now()}.${file.name.split('.').pop()}`
      console.log('Store: Generated S3 key:', key)
      
      const url = await uploadImageToS3(file, key)
      console.log('Store: Uploaded to S3, got URL:', url)
      
      console.log('Store: Updating tournament with logo URL:', { tournamentId, logo: url })
      await get().updateTournament(tournamentId, { logo: url })
      
      console.log('Store: Tournament logo upload completed successfully')
    } catch (error) {
      console.error('Store: Error uploading tournament logo:', error)
    }
  },

  uploadTournamentBackground: async (tournamentId: string, file: File) => {
    try {
      const key = `tournaments/${tournamentId}/background-${Date.now()}.${file.name.split('.').pop()}`
      const url = await uploadImageToS3(file, key)
      
      await get().updateTournament(tournamentId, { backgroundImage: url })
    } catch (error) {
      console.error('Error uploading tournament background:', error)
    }
  },
}))
