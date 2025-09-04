import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface Database {
  public: {
    Tables: {
      organizers: {
        Row: {
          id: string
          name: string
          email: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          created_at?: string
          updated_at?: string
        }
      }
      teams: {
        Row: {
          id: string
          name: string
          colors: string[]
          logo: string | null
          photo: string | null
          establish_date: string | null
          organizer_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          colors: string[]
          logo?: string | null
          photo?: string | null
          establish_date?: string | null
          organizer_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          colors?: string[]
          logo?: string | null
          photo?: string | null
          establish_date?: string | null
          organizer_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      players: {
        Row: {
          id: string
          first_name: string
          last_name: string
          date_of_birth: string | null
          photo: string | null
          is_public: boolean
          team_id: string
          organizer_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          first_name: string
          last_name: string
          date_of_birth?: string | null
          photo?: string | null
          is_public?: boolean
          team_id: string
          organizer_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          date_of_birth?: string | null
          photo?: string | null
          is_public?: boolean
          team_id?: string
          organizer_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      tournaments: {
        Row: {
          id: string
          name: string
          format: string
          team_ids: string[]
          organizer_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          format: string
          team_ids: string[]
          organizer_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          format?: string
          team_ids?: string[]
          organizer_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      matches: {
        Row: {
          id: string
          tournament_id: string
          home_team_id: string
          away_team_id: string
          home_goals: number | null
          away_goals: number | null
          date_iso: string | null
          organizer_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          home_team_id: string
          away_team_id: string
          home_goals?: number | null
          away_goals?: number | null
          date_iso?: string | null
          organizer_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          home_team_id?: string
          away_team_id?: string
          home_goals?: number | null
          away_goals?: number | null
          date_iso?: string | null
          organizer_id?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
