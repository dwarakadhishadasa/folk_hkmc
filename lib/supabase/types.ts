export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
        Update: {
          airtable_base_id?: string
          airtable_user_id?: string
          created_at?: string
          email?: string
          id?: string
          last_synced_at?: string
          program_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "airtable_identities_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
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
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          program_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "airtable_sync_state_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          name: string
          phone: string
          program_id: string
          session_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          name: string
          phone: string
          program_id: string
          session_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          name?: string
          phone?: string
          program_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_attendance_counts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "attendance_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
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
        Update: {
          action?: string
          actor_airtable_user_id?: string | null
          actor_role?: string | null
          actor_supabase_user_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          program_id?: string
          source?: string
          sync_state?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          age: number | null
          assigned_preacher_id: string | null
          books_read: string[] | null
          collected_by_id: string | null
          college: string | null
          company: string | null
          created_at: string | null
          date_of_birth: string | null
          designation: string | null
          id: string
          initial_contact: string | null
          is_favorite: boolean | null
          last_contacted_on: string | null
          location_ids: string[] | null
          name: string
          notes: string | null
          phone: string
          photo_path: string | null
          program_id: string
          rounds: string | null
          source: string | null
          updated_at: string | null
          year: string | null
        }
        Insert: {
          address?: string | null
          age?: number | null
          assigned_preacher_id?: string | null
          books_read?: string[] | null
          collected_by_id?: string | null
          college?: string | null
          company?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          designation?: string | null
          id?: string
          initial_contact?: string | null
          is_favorite?: boolean | null
          last_contacted_on?: string | null
          location_ids?: string[] | null
          name: string
          notes?: string | null
          phone: string
          photo_path?: string | null
          program_id: string
          rounds?: string | null
          source?: string | null
          updated_at?: string | null
          year?: string | null
        }
        Update: {
          address?: string | null
          age?: number | null
          assigned_preacher_id?: string | null
          books_read?: string[] | null
          collected_by_id?: string | null
          college?: string | null
          company?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          designation?: string | null
          id?: string
          initial_contact?: string | null
          is_favorite?: boolean | null
          last_contacted_on?: string | null
          location_ids?: string[] | null
          name?: string
          notes?: string | null
          phone?: string
          photo_path?: string | null
          program_id?: string
          rounds?: string | null
          source?: string | null
          updated_at?: string | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_preacher_id_fkey"
            columns: ["assigned_preacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_collected_by_id_fkey"
            columns: ["collected_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
        Update: {
          accepted_at?: string | null
          airtable_user_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: number
          invited_at?: string
          invitee_email?: string
          invitee_role?: string
          inviter_airtable_user_id?: string | null
          inviter_supabase_user_id?: string | null
          program_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_log_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          program_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          program_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          program_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          attendance_closes_at: string | null
          attendance_opens_at: string | null
          attendance_url: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          id: string
          location_id: string | null
          name: string
          preacher_id: string | null
          program_id: string
          public_attendance_enabled: boolean | null
          session_date: string | null
          updated_at: string | null
        }
        Insert: {
          attendance_closes_at?: string | null
          attendance_opens_at?: string | null
          attendance_url?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          location_id?: string | null
          name: string
          preacher_id?: string | null
          program_id: string
          public_attendance_enabled?: boolean | null
          session_date?: string | null
          updated_at?: string | null
        }
        Update: {
          attendance_closes_at?: string | null
          attendance_opens_at?: string | null
          attendance_url?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          location_id?: string | null
          name?: string
          preacher_id?: string | null
          program_id?: string
          public_attendance_enabled?: boolean | null
          session_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_preacher_id_fkey"
            columns: ["preacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
        Update: {
          airtable_user_id?: string
          assigned_preacher_airtable_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          last_synced_at?: string
          location_ids?: string[]
          name?: string | null
          program_id?: string
          revoked_at?: string | null
          role?: string
          status?: string
          sync_error?: string | null
          sync_source?: string
          sync_state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_memberships_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          airtable_user_id: string
          assigned_preacher_airtable_user_id: string | null
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
          airtable_user_id: string
          assigned_preacher_airtable_user_id?: string | null
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
        Update: {
          airtable_user_id?: string
          assigned_preacher_airtable_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          last_synced_at?: string
          location_ids?: string[]
          membership_status?: string | null
          name?: string | null
          program_id?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          assigned_preacher_id: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          location_ids: string[] | null
          name: string | null
          program_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_preacher_id?: string | null
          created_at?: string
          email: string
          id: string
          invited_by?: string | null
          location_ids?: string[] | null
          name?: string | null
          program_id: string
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_preacher_id?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          location_ids?: string[] | null
          name?: string | null
          program_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_assigned_preacher_id_fkey"
            columns: ["assigned_preacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contact_attendance_counts: {
        Row: {
          contact_id: string | null
          past_60_day_attendance_count: number | null
          total_attendance_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      caller_assigned_preacher_id: { Args: never; Returns: string }
      caller_can_read_attendance_session: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      caller_effective_location_ids: { Args: never; Returns: string[] }
      caller_program_id: { Args: never; Returns: string }
      caller_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
