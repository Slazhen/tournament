import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Tournament, Team } from './types'

type StoreState = {
  teams: Record<string, Team>
  tournaments: Record<string, Tournament>
  addTeam: (team: Team) => void
  updateTeam: (team: Team) => void
  removeTeam: (id: string) => void
  addTournament: (t: Tournament) => void
  updateTournament: (t: Tournament) => void
  removeTournament: (id: string) => void
}

export const useAppStore = create<StoreState>()(
  persist(
    (set) => ({
      teams: {},
      tournaments: {},
      addTeam: (team) =>
        set((s) => ({ teams: { ...s.teams, [team.id]: team } })),
      updateTeam: (team) =>
        set((s) => ({ teams: { ...s.teams, [team.id]: team } })),
      removeTeam: (id) =>
        set((s) => {
          const copy = { ...s.teams }
          delete copy[id]
          return { teams: copy }
        }),
      addTournament: (t) =>
        set((s) => ({ tournaments: { ...s.tournaments, [t.id]: t } })),
      updateTournament: (t) =>
        set((s) => ({ tournaments: { ...s.tournaments, [t.id]: t } })),
      removeTournament: (id) =>
        set((s) => {
          const copy = { ...s.tournaments }
          delete copy[id]
          return { tournaments: copy }
        }),
    }),
    { name: 'ftables-store' }
  )
)

