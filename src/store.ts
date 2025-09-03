import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from './utils/uid'
import type { Team, Tournament, Match, PlayoffBracket, Organizer } from './types'
import { generateRoundRobinSchedule, generatePlayoffBrackets, createPlayoffMatches, generateSwissEliminationSchedule } from './utils/tournament'

type AppStore = {
  // Organizers
  organizers: Organizer[]
  currentOrganizerId: string | null
  
  // Teams and Tournaments (now isolated per organizer)
  teams: Team[]
  tournaments: Tournament[]
  
  // Settings
  settings: AppSettings
  
  // Actions
  createOrganizer: (name: string, email: string) => void
  setCurrentOrganizer: (organizerId: string) => void
  updateOrganizer: (organizerId: string, updates: Partial<Organizer>) => void
  
  createTeam: (name: string, colors: string[], logo?: string) => void
  updateTeam: (teamId: string, updates: Partial<Team>) => void
  deleteTeam: (teamId: string) => void
  
  createTournament: (name: string, teamIds: string[], format?: Tournament['format']) => void
  updateTournament: (tournamentId: string, updates: Partial<Tournament>) => void
  deleteTournament: (tournamentId: string) => void
  
  setScore: (matchId: string, homeGoals: number, awayGoals: number) => void
  setDate: (matchId: string, dateISO: string) => void
  
  updateSettings: (updates: Partial<AppStore['settings']>) => void
  
  // Getters (filtered by current organizer)
  getCurrentOrganizer: () => Organizer | null
  getOrganizerTeams: () => Team[]
  getOrganizerTournaments: () => Tournament[]
  getAllTournaments: () => Tournament[]
  
  // Migration helpers
  migrateDataToCurrentOrganizer: () => void
  migrateColorSystem: () => void
  migratePlayerStructure: () => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
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
      
      // Organizer actions
      createOrganizer: (name: string, email: string) => {
        const newOrganizer: Organizer = {
          id: uid(),
          name,
          email,
          createdAtISO: new Date().toISOString(),
        }
        
        set((state) => ({
          organizers: [...state.organizers, newOrganizer],
          currentOrganizerId: newOrganizer.id,
        }))
      },
      
      setCurrentOrganizer: (organizerId: string) => {
        set({ currentOrganizerId: organizerId })
      },
      
      updateOrganizer: (organizerId: string, updates: Partial<Organizer>) => {
        set((state) => ({
          organizers: state.organizers.map((o) =>
            o.id === organizerId ? { ...o, ...updates } : o
          ),
        }))
      },
      
      // Team actions (isolated per organizer)
      createTeam: (name: string, colors: string[], logo?: string) => {
        const { currentOrganizerId } = get()
        if (!currentOrganizerId) return
        
        const newTeam: Team = {
          id: uid(),
          name,
          organizerId: currentOrganizerId,
          colors,
          logo,
          players: [],
          createdAtISO: new Date().toISOString(),
        }
        
        set((state) => ({
          teams: [...state.teams, newTeam],
        }))
      },
      
      updateTeam: (teamId: string, updates: Partial<Team>) => {
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, ...updates } : t
          ),
        }))
      },
      
      deleteTeam: (teamId: string) => {
        set((state) => ({
          teams: state.teams.filter((t) => t.id !== teamId),
          tournaments: state.tournaments.map((tournament) => ({
            ...tournament,
            teamIds: tournament.teamIds.filter((id) => id !== teamId),
          })),
        }))
      },
      
      // Tournament actions (isolated per organizer)
      createTournament: (name: string, teamIds: string[], format?: Tournament['format']) => {
        const { currentOrganizerId } = get()
        if (!currentOrganizerId) return
        
        let leagueMatches: Match[] = []
        let playoffBrackets: PlayoffBracket[] | undefined
        let playoffMatches: Match[] = []
        
        // Generate matches based on tournament format
        if (format?.mode === 'swiss_elimination') {
          // Swiss + Elimination mode
          const { leagueMatches: swissMatches, eliminationMatches } = generateSwissEliminationSchedule(teamIds, format.rounds || 2)
          leagueMatches = swissMatches
          playoffMatches = eliminationMatches
        } else {
          // Standard league mode
          leagueMatches = generateRoundRobinSchedule(teamIds, format?.rounds || 1)
          
          // Generate playoff structure if needed
          if (format?.mode === 'league_playoff' && format.playoffQualifiers) {
            const qualifierCount = Math.min(format.playoffQualifiers, teamIds.length)
            const dummyTeamIds = Array(qualifierCount).fill('').map((_, i) => `seed-${i + 1}`)
            playoffBrackets = generatePlayoffBrackets(dummyTeamIds)
            playoffMatches = createPlayoffMatches(playoffBrackets)
          }
        }
        
        // Combine all matches
        const allMatches = [...leagueMatches, ...playoffMatches]
        
        const newTournament: Tournament = {
          id: uid(),
          name,
          organizerId: currentOrganizerId,
          createdAtISO: new Date().toISOString(),
          teamIds,
          matches: allMatches,
          format,
          playoffBrackets,
        }
        
        set((state) => ({
          tournaments: [...state.tournaments, newTournament],
        }))
      },
      
      updateTournament: (tournamentId: string, updates: Partial<Tournament>) => {
        set((state) => ({
          tournaments: state.tournaments.map((t) =>
            t.id === tournamentId ? { ...t, ...updates } : t
          ),
        }))
      },
      
      deleteTournament: (tournamentId: string) => {
        set((state) => ({
          tournaments: state.tournaments.filter((t) => t.id !== tournamentId),
        }))
      },
      
      // Match actions
      setScore: (matchId: string, homeGoals: number, awayGoals: number) => {
        set((state) => ({
          tournaments: state.tournaments.map((tournament) => ({
            ...tournament,
            matches: tournament.matches.map((match) =>
              match.id === matchId
                ? { ...match, homeGoals, awayGoals }
                : match
            ),
          })),
        }))
      },
      
      setDate: (matchId: string, dateISO: string) => {
        set((state) => ({
          tournaments: state.tournaments.map((tournament) => ({
            ...tournament,
            matches: tournament.matches.map((match) =>
              match.id === matchId ? { ...match, dateISO } : match
            ),
          })),
        }))
      },
      
      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }))
      },
      
      // Getters (filtered by current organizer)
      getCurrentOrganizer: () => {
        const { organizers, currentOrganizerId } = get()
        return organizers.find((o) => o.id === currentOrganizerId) || null
      },
      
      getOrganizerTeams: () => {
        const { teams, currentOrganizerId } = get()
        return currentOrganizerId ? teams.filter((t) => t.organizerId === currentOrganizerId) : []
      },
      
      getOrganizerTournaments: () => {
        const { tournaments, currentOrganizerId } = get()
        return currentOrganizerId ? tournaments.filter((t) => t.organizerId === currentOrganizerId) : []
      },
      
      getAllTournaments: () => {
        const { tournaments } = get()
        return tournaments
      },
      
      // Migration helper to fix old data without organizerId
      migrateDataToCurrentOrganizer: () => {
        const { currentOrganizerId } = get()
        if (!currentOrganizerId) return
        
        set((state) => ({
          teams: state.teams.map((team) => ({
            ...team,
            organizerId: team.organizerId || currentOrganizerId
          })),
          tournaments: state.tournaments.map((tournament) => ({
            ...tournament,
            organizerId: tournament.organizerId || currentOrganizerId
          }))
        }))
      },

      // Migration helper to update old colorHex to colors array
      migrateColorSystem: () => {
        set((state) => ({
          teams: state.teams.map((team) => {
            // @ts-ignore - Handle old colorHex property
            if (team.colorHex && !team.colors) {
              return {
                ...team,
                colors: [team.colors?.[0] || '#3B82F6'],
                // @ts-ignore - Remove old property
                colorHex: undefined
              }
            }
            return team
          })
        }))
      },

      // Migration helper to update old player structure
      migratePlayerStructure: () => {
        set((state) => ({
          teams: state.teams.map((team) => ({
            ...team,
            players: team.players.map((player: any) => {
              // @ts-ignore - Handle old player structure
              if (player.name && !player.firstName) {
                return {
                  ...player,
                  firstName: player.name,
                  lastName: 'Player',
                  isPublic: true,
                  // @ts-ignore - Remove old property
                  name: undefined
                }
              }
              return player
            })
          }))
        }))
      },
    }),
    {
      name: 'football-tournaments-storage',
    }
  )
)

