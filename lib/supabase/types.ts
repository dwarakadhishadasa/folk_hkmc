export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      airtable_identities: {
        Row: {
          airtable_base_id: string
          airtable_user_id: string
          created_at: string
          email: string
          id: string
          last_synced_at: string
          program_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          airtable_base_id: string
          airtable_user_id: string
          created_at?: string
          email: string
          id?: string
          last_synced_at?: string
          program_id: string
          updated_at?: string
          user_id: string
        }
        Update: Partial<Database["public"]["Tables"]["airtable_identities"]["Insert"]>
      }
      airtable_sync_state: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          last_synced_at: string | null
          program_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          program_id: string
          source: string
          status: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["airtable_sync_state"]["Insert"]>
      }
      audit_events: {
        Row: {
          action: string
          actor_airtable_user_id: string | null
          actor_role: string | null
          actor_supabase_user_id: string | null
          created_at: string
          id: number
          metadata: Json
          program_id: string
          source: string
          sync_state: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_airtable_user_id?: string | null
          actor_role?: string | null
          actor_supabase_user_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          program_id: string
          source: string
          sync_state?: string | null
          target_id?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["audit_events"]["Insert"]>
      }
      invite_log: {
        Row: {
          accepted_at: string | null
          airtable_user_id: string | null
          created_at: string
          error_message: string | null
          id: number
          invited_at: string
          invitee_email: string
          invitee_role: string
          inviter_airtable_user_id: string | null
          inviter_supabase_user_id: string | null
          program_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          airtable_user_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: number
          invited_at?: string
          invitee_email: string
          invitee_role: string
          inviter_airtable_user_id?: string | null
          inviter_supabase_user_id?: string | null
          program_id?: string | null
          status: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["invite_log"]["Insert"]>
      }
      programs: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["programs"]["Insert"]>
      }
      staff_memberships: {
        Row: {
          airtable_user_id: string
          assigned_preacher_airtable_user_id: string | null
          created_at: string
          email: string
          id: string
          last_synced_at: string
          location_ids: string[]
          name: string | null
          program_id: string
          revoked_at: string | null
          role: string
          status: string
          sync_error: string | null
          sync_source: string
          sync_state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          airtable_user_id: string
          assigned_preacher_airtable_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          last_synced_at?: string
          location_ids?: string[]
          name?: string | null
          program_id: string
          revoked_at?: string | null
          role: string
          status: string
          sync_error?: string | null
          sync_source?: string
          sync_state?: string
          updated_at?: string
          user_id: string
        }
        Update: Partial<Database["public"]["Tables"]["staff_memberships"]["Insert"]>
      }
      staff_profiles: {
        Row: {
          assigned_preacher_airtable_user_id: string | null
          airtable_user_id: string
          created_at: string
          email: string
          id: string
          last_synced_at: string
          location_ids: string[]
          membership_status: string | null
          name: string | null
          program_id: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_preacher_airtable_user_id?: string | null
          airtable_user_id: string
          created_at?: string
          email: string
          id: string
          last_synced_at?: string
          location_ids?: string[]
          membership_status?: string | null
          name?: string | null
          program_id?: string | null
          role: string
          status: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["staff_profiles"]["Insert"]>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
