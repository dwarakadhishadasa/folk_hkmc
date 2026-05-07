export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
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
          status: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["invite_log"]["Insert"]>
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
          name: string | null
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
          name?: string | null
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
