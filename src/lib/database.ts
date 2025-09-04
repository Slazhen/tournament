import { supabase } from './supabase'
import type { Team, Tournament, Organizer } from '../types'

// Organizer operations
export const organizerService = {
  async getAll(): Promise<Organizer[]> {
    const { data, error } = await supabase
      .from('organizers')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching organizers:', error)
      return []
    }
    
    return data?.map(org => ({
      id: org.id,
      name: org.name,
      email: org.email,
      createdAtISO: org.created_at
    })) || []
  },

  async create(name: string, email: string): Promise<Organizer | null> {
    const { data, error } = await supabase
      .from('organizers')
      .insert({
        name,
        email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating organizer:', error)
      return null
    }
    
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      createdAtISO: data.created_at
    }
  },

  async update(id: string, updates: Partial<Organizer>): Promise<boolean> {
    const { error } = await supabase
      .from('organizers')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
    
    if (error) {
      console.error('Error updating organizer:', error)
      return false
    }
    
    return true
  }
}

// Team operations
export const teamService = {
  async getAll(): Promise<Team[]> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching teams:', error)
      return []
    }
    
    return data?.map(team => ({
      id: team.id,
      name: team.name,
      colors: team.colors,
      logo: team.logo,
      photo: team.photo,
      establishDate: team.establish_date,
      organizerId: team.organizer_id,
      createdAtISO: team.created_at,
      players: [] // Will be loaded separately
    })) || []
  },

  async getByOrganizer(organizerId: string): Promise<Team[]> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching teams by organizer:', error)
      return []
    }
    
    return data?.map(team => ({
      id: team.id,
      name: team.name,
      colors: team.colors,
      logo: team.logo,
      photo: team.photo,
      establishDate: team.establish_date,
      organizerId: team.organizer_id,
      createdAtISO: team.created_at,
      players: [] // Will be loaded separately
    })) || []
  },

  async create(team: Omit<Team, 'id' | 'createdAtISO'>): Promise<Team | null> {
    const { data, error } = await supabase
      .from('teams')
      .insert({
        name: team.name,
        colors: team.colors,
        logo: team.logo,
        photo: team.photo,
        establish_date: team.establishedDate,
        organizer_id: team.organizerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating team:', error)
      return null
    }
    
    return {
      id: data.id,
      name: data.name,
      colors: data.colors,
      logo: data.logo,
      photo: data.photo,
      establishedDate: data.establish_date,
      organizerId: data.organizer_id,
      createdAtISO: data.created_at,
      players: []
    }
  },

  async update(id: string, updates: Partial<Team>): Promise<boolean> {
    const { error } = await supabase
      .from('teams')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
    
    if (error) {
      console.error('Error updating team:', error)
      return false
    }
    
    return true
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Error deleting team:', error)
      return false
    }
    
    return true
  }
}

// Note: Players are stored within teams, not as separate entities
// This service is for future use if we decide to separate players

// Tournament operations
export const tournamentService = {
  async getAll(): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching tournaments:', error)
      return []
    }
    
    return data?.map(tournament => ({
      id: tournament.id,
      name: tournament.name,
      format: tournament.format as Tournament['format'],
      teamIds: tournament.team_ids,
      organizerId: tournament.organizer_id,
      createdAtISO: tournament.created_at,
      matches: [] // Will be loaded separately
    })) || []
  },

  async getByOrganizer(organizerId: string): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching tournaments by organizer:', error)
      return []
    }
    
    return data?.map(tournament => ({
      id: tournament.id,
      name: tournament.name,
      format: tournament.format as Tournament['format'],
      teamIds: tournament.team_ids,
      organizerId: tournament.organizer_id,
      createdAtISO: tournament.created_at,
      matches: [] // Will be loaded separately
    })) || []
  },

  async create(tournament: Omit<Tournament, 'id' | 'createdAtISO' | 'matches'>): Promise<Tournament | null> {
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        name: tournament.name,
        format: tournament.format,
        team_ids: tournament.teamIds,
        organizer_id: tournament.organizerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating tournament:', error)
      return null
    }
    
    return {
      id: data.id,
      name: data.name,
      format: data.format as Tournament['format'],
      teamIds: data.team_ids,
      organizerId: data.organizer_id,
      createdAtISO: data.created_at,
      matches: []
    }
  },

  async update(id: string, updates: Partial<Tournament>): Promise<boolean> {
    const { error } = await supabase
      .from('tournaments')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
    
    if (error) {
      console.error('Error updating tournament:', error)
      return false
    }
    
    return true
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Error deleting tournament:', error)
      return false
    }
    
    return true
  }
}

// Note: Matches are stored within tournaments, not as separate entities
// This service is for future use if we decide to separate matches
