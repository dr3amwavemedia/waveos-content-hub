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
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          safe_metadata: Json
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          safe_metadata?: Json
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          safe_metadata?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          brand_summary: string | null
          business_name: string | null
          created_at: string
          default_ctas: string[]
          default_hashtags: string[]
          emoji_preference: string
          id: string
          industry: string | null
          onboarding_status: string
          preferred_caption_length: string
          preferred_phrases: string | null
          primary_language: string
          primary_services: string | null
          secondary_language: string | null
          service_area: string | null
          target_audience: string | null
          timezone: string | null
          tone_traits: string[]
          updated_at: string
          website: string | null
          words_to_avoid: string | null
          workspace_id: string
        }
        Insert: {
          brand_summary?: string | null
          business_name?: string | null
          created_at?: string
          default_ctas?: string[]
          default_hashtags?: string[]
          emoji_preference?: string
          id?: string
          industry?: string | null
          onboarding_status?: string
          preferred_caption_length?: string
          preferred_phrases?: string | null
          primary_language?: string
          primary_services?: string | null
          secondary_language?: string | null
          service_area?: string | null
          target_audience?: string | null
          timezone?: string | null
          tone_traits?: string[]
          updated_at?: string
          website?: string | null
          words_to_avoid?: string | null
          workspace_id: string
        }
        Update: {
          brand_summary?: string | null
          business_name?: string | null
          created_at?: string
          default_ctas?: string[]
          default_hashtags?: string[]
          emoji_preference?: string
          id?: string
          industry?: string | null
          onboarding_status?: string
          preferred_caption_length?: string
          preferred_phrases?: string | null
          primary_language?: string
          primary_services?: string | null
          secondary_language?: string | null
          service_area?: string | null
          target_audience?: string | null
          timezone?: string | null
          tone_traits?: string[]
          updated_at?: string
          website?: string | null
          words_to_avoid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          app_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          resend_count: number
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["invite_status"]
          token: string
          token_hash: string | null
          updated_at: string
          workspace_id: string | null
          workspace_role: Database["public"]["Enums"]["workspace_member_role"]
        }
        Insert: {
          accepted_at?: string | null
          app_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          resend_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          token: string
          token_hash?: string | null
          updated_at?: string
          workspace_id?: string | null
          workspace_role?: Database["public"]["Enums"]["workspace_member_role"]
        }
        Update: {
          accepted_at?: string | null
          app_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          resend_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
          token_hash?: string | null
          updated_at?: string
          workspace_id?: string | null
          workspace_role?: Database["public"]["Enums"]["workspace_member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          archived_at: string | null
          created_at: string
          duration_seconds: number | null
          folder_id: string | null
          height: number | null
          id: string
          last_accessibility_check: string | null
          mime_type: string
          name: string
          private_storage_path: string | null
          publishing_status: Database["public"]["Enums"]["media_publishing_status"]
          publishing_storage_path: string | null
          publishing_url: string | null
          publishing_url_created_at: string | null
          publishing_url_expires_at: string | null
          size_bytes: number
          storage_path: string
          tags: string[]
          updated_at: string
          uploaded_by: string | null
          width: number | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          folder_id?: string | null
          height?: number | null
          id?: string
          last_accessibility_check?: string | null
          mime_type: string
          name: string
          private_storage_path?: string | null
          publishing_status?: Database["public"]["Enums"]["media_publishing_status"]
          publishing_storage_path?: string | null
          publishing_url?: string | null
          publishing_url_created_at?: string | null
          publishing_url_expires_at?: string | null
          size_bytes?: number
          storage_path: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          folder_id?: string | null
          height?: number | null
          id?: string
          last_accessibility_check?: string | null
          mime_type?: string
          name?: string
          private_storage_path?: string | null
          publishing_status?: Database["public"]["Enums"]["media_publishing_status"]
          publishing_storage_path?: string | null
          publishing_url?: string | null
          publishing_url_created_at?: string | null
          publishing_url_expires_at?: string | null
          size_bytes?: number
          storage_path?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_folder_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_folder_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_folder_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_member_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_member_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_member_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          account_manager_id: string | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          is_archived: boolean
          is_demo: boolean
          last_activity_at: string | null
          name: string
          service_area: string | null
          service_tier: string | null
          slug: string
          status: Database["public"]["Enums"]["workspace_status"]
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          account_manager_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          is_archived?: boolean
          is_demo?: boolean
          last_activity_at?: string | null
          name: string
          service_area?: string | null
          service_tier?: string | null
          slug: string
          status?: Database["public"]["Enums"]["workspace_status"]
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_manager_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          is_archived?: boolean
          is_demo?: boolean
          last_activity_at?: string | null
          name?: string
          service_area?: string | null
          service_tier?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["workspace_status"]
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { _token: string }; Returns: string }
      create_invite: {
        Args: {
          _app_role: Database["public"]["Enums"]["app_role"]
          _email: string
          _expires_days?: number
          _workspace_id: string
          _workspace_role: Database["public"]["Enums"]["workspace_member_role"]
        }
        Returns: {
          invite_id: string
          raw_token: string
        }[]
      }
      get_invite_public: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          status: Database["public"]["Enums"]["invite_status"]
          workspace_id: string
          workspace_name: string
          workspace_role: Database["public"]["Enums"]["workspace_member_role"]
        }[]
      }
      grant_staff_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_dream_wave_staff: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      log_activity: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type?: string
          _metadata?: Json
          _workspace_id: string
        }
        Returns: undefined
      }
      resend_invite: {
        Args: { _extend_days?: number; _invite_id: string }
        Returns: {
          raw_token: string
        }[]
      }
      revoke_invite: { Args: { _invite_id: string }; Returns: undefined }
      revoke_staff_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_member_role"]
      }
    }
    Enums: {
      app_role:
        | "dream_wave_owner"
        | "dream_wave_team"
        | "client_owner"
        | "client_approver"
        | "client_viewer"
      invite_status: "pending" | "accepted" | "expired" | "revoked"
      media_publishing_status:
        | "none"
        | "preparing"
        | "ready"
        | "expired"
        | "failed"
      workspace_member_role: "owner" | "approver" | "viewer"
      workspace_status: "onboarding" | "active" | "paused" | "archived"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "dream_wave_owner",
        "dream_wave_team",
        "client_owner",
        "client_approver",
        "client_viewer",
      ],
      invite_status: ["pending", "accepted", "expired", "revoked"],
      media_publishing_status: [
        "none",
        "preparing",
        "ready",
        "expired",
        "failed",
      ],
      workspace_member_role: ["owner", "approver", "viewer"],
      workspace_status: ["onboarding", "active", "paused", "archived"],
    },
  },
} as const
