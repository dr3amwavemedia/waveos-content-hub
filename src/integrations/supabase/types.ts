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
      approvals: {
        Row: {
          content_item_id: string
          created_at: string
          decided_at: string | null
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
          note: string | null
          reviewer_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_item_id: string
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          note?: string | null
          reviewer_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_item_id?: string
          created_at?: string
          decided_at?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          note?: string | null
          reviewer_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ayrshare_profiles: {
        Row: {
          created_at: string
          id: string
          profile_key: string
          profile_title: string | null
          ref_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_key: string
          profile_title?: string | null
          ref_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_key?: string
          profile_title?: string | null
          ref_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ayrshare_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
      comments: {
        Row: {
          author_id: string | null
          body: string
          content_item_id: string
          created_at: string
          id: string
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          content_item_id: string
          created_at?: string
          id?: string
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          content_item_id?: string
          created_at?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          first_published_url: string | null
          hashtags: string[]
          id: string
          internal_notes: string | null
          media_asset_ids: string[]
          metadata: Json
          primary_caption: string | null
          published_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["content_status"]
          timezone: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          first_published_url?: string | null
          hashtags?: string[]
          id?: string
          internal_notes?: string | null
          media_asset_ids?: string[]
          metadata?: Json
          primary_caption?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          timezone?: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          first_published_url?: string | null
          hashtags?: string[]
          id?: string
          internal_notes?: string | null
          media_asset_ids?: string[]
          metadata?: Json
          primary_caption?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          timezone?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          read_at: string | null
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_variants: {
        Row: {
          caption: string
          content_item_id: string
          created_at: string
          enabled: boolean
          hashtags: string[]
          id: string
          platform: Database["public"]["Enums"]["social_platform"]
          platform_options: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          caption?: string
          content_item_id: string
          created_at?: string
          enabled?: boolean
          hashtags?: string[]
          id?: string
          platform: Database["public"]["Enums"]["social_platform"]
          platform_options?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          caption?: string
          content_item_id?: string
          created_at?: string
          enabled?: boolean
          hashtags?: string[]
          id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          platform_options?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_variants_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_variants_workspace_id_fkey"
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
      publish_attempts: {
        Row: {
          attempted_at: string
          ayrshare_post_id: string | null
          completed_at: string | null
          content_item_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          platform: Database["public"]["Enums"]["social_platform"]
          post_url: string | null
          request_snapshot: Json
          response_snapshot: Json
          status: Database["public"]["Enums"]["publish_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempted_at?: string
          ayrshare_post_id?: string | null
          completed_at?: string | null
          content_item_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          platform: Database["public"]["Enums"]["social_platform"]
          post_url?: string | null
          request_snapshot?: Json
          response_snapshot?: Json
          status?: Database["public"]["Enums"]["publish_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempted_at?: string
          ayrshare_post_id?: string | null
          completed_at?: string | null
          content_item_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          post_url?: string | null
          request_snapshot?: Json
          response_snapshot?: Json
          status?: Database["public"]["Enums"]["publish_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_attempts_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          avatar_url: string | null
          connected: boolean
          created_at: string
          display_name: string | null
          id: string
          last_synced_at: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          raw: Json
          updated_at: string
          username: string | null
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          connected?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          last_synced_at?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          raw?: Json
          updated_at?: string
          username?: string | null
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          connected?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          last_synced_at?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          raw?: Json
          updated_at?: string
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      webhook_events: {
        Row: {
          content_item_id: string | null
          created_at: string
          event_type: string | null
          external_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          source: string
          workspace_id: string | null
        }
        Insert: {
          content_item_id?: string | null
          created_at?: string
          event_type?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          source: string
          workspace_id?: string | null
        }
        Update: {
          content_item_id?: string | null
          created_at?: string
          event_type?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          source?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          access_expires_at: string | null
          access_starts_at: string | null
          access_tier: Database["public"]["Enums"]["client_access_tier"]
          account_manager_id: string | null
          account_status: Database["public"]["Enums"]["account_status"]
          activated_at: string | null
          admin_notes: string | null
          agreement_term: Database["public"]["Enums"]["agreement_term"] | null
          created_at: string
          created_by: string | null
          crm_external_id: string | null
          crm_last_sync_at: string | null
          crm_sync_status: Database["public"]["Enums"]["crm_sync_status"]
          feature_overrides: Json
          id: string
          industry: string | null
          invited_at: string | null
          is_archived: boolean
          is_demo: boolean
          last_activity_at: string | null
          name: string
          require_fresh_social_login: boolean
          service_area: string | null
          service_tier: string | null
          slug: string
          status: Database["public"]["Enums"]["workspace_status"]
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          access_expires_at?: string | null
          access_starts_at?: string | null
          access_tier?: Database["public"]["Enums"]["client_access_tier"]
          account_manager_id?: string | null
          account_status?: Database["public"]["Enums"]["account_status"]
          activated_at?: string | null
          admin_notes?: string | null
          agreement_term?: Database["public"]["Enums"]["agreement_term"] | null
          created_at?: string
          created_by?: string | null
          crm_external_id?: string | null
          crm_last_sync_at?: string | null
          crm_sync_status?: Database["public"]["Enums"]["crm_sync_status"]
          feature_overrides?: Json
          id?: string
          industry?: string | null
          invited_at?: string | null
          is_archived?: boolean
          is_demo?: boolean
          last_activity_at?: string | null
          name: string
          require_fresh_social_login?: boolean
          service_area?: string | null
          service_tier?: string | null
          slug: string
          status?: Database["public"]["Enums"]["workspace_status"]
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          access_expires_at?: string | null
          access_starts_at?: string | null
          access_tier?: Database["public"]["Enums"]["client_access_tier"]
          account_manager_id?: string | null
          account_status?: Database["public"]["Enums"]["account_status"]
          activated_at?: string | null
          admin_notes?: string | null
          agreement_term?: Database["public"]["Enums"]["agreement_term"] | null
          created_at?: string
          created_by?: string | null
          crm_external_id?: string | null
          crm_last_sync_at?: string | null
          crm_sync_status?: Database["public"]["Enums"]["crm_sync_status"]
          feature_overrides?: Json
          id?: string
          industry?: string | null
          invited_at?: string | null
          is_archived?: boolean
          is_demo?: boolean
          last_activity_at?: string | null
          name?: string
          require_fresh_social_login?: boolean
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
      invites_admin: {
        Row: {
          accepted_at: string | null
          app_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          invited_by: string | null
          last_sent_at: string | null
          resend_count: number | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["invite_status"] | null
          workspace_id: string | null
          workspace_role:
            | Database["public"]["Enums"]["workspace_member_role"]
            | null
        }
        Insert: {
          accepted_at?: string | null
          app_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          last_sent_at?: string | null
          resend_count?: number | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["invite_status"] | null
          workspace_id?: string | null
          workspace_role?:
            | Database["public"]["Enums"]["workspace_member_role"]
            | null
        }
        Update: {
          accepted_at?: string | null
          app_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          last_sent_at?: string | null
          resend_count?: number | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["invite_status"] | null
          workspace_id?: string | null
          workspace_role?:
            | Database["public"]["Enums"]["workspace_member_role"]
            | null
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
    }
    Functions: {
      accept_invite: { Args: { _token: string }; Returns: string }
      create_brand_workspace: {
        Args: {
          _business_name?: string
          _industry?: string
          _name: string
          _primary_language?: string
          _service_area?: string
          _target_audience?: string
          _timezone?: string
          _website?: string
        }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
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
      create_notification: {
        Args: {
          _body?: string
          _kind: Database["public"]["Enums"]["notification_kind"]
          _link?: string
          _title: string
          _user_id: string
          _workspace_id: string
        }
        Returns: string
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
      has_feature: {
        Args: { _feature: string; _workspace_id: string }
        Returns: boolean
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
      account_status:
        | "pending"
        | "active"
        | "suspended"
        | "expired"
        | "archived"
      agreement_term: "one_time" | "90_day" | "6_month" | "12_month"
      app_role:
        | "dream_wave_owner"
        | "dream_wave_team"
        | "client_owner"
        | "client_approver"
        | "client_viewer"
      approval_decision:
        | "pending"
        | "approved"
        | "changes_requested"
        | "rejected"
      client_access_tier: "project_client" | "growth_90" | "retainer_full"
      content_status:
        | "draft"
        | "in_review"
        | "changes_requested"
        | "approved"
        | "scheduled"
        | "publishing"
        | "published"
        | "failed"
        | "archived"
      crm_sync_status: "not_connected" | "pending" | "synced" | "failed"
      invite_status: "pending" | "accepted" | "expired" | "revoked"
      media_publishing_status:
        | "none"
        | "preparing"
        | "ready"
        | "expired"
        | "failed"
      notification_kind:
        | "invite_accepted"
        | "content_submitted"
        | "content_approved"
        | "content_changes_requested"
        | "content_rejected"
        | "content_published"
        | "content_failed"
        | "comment_added"
        | "account_connected"
        | "account_disconnected"
        | "generic"
      publish_status:
        | "queued"
        | "sending"
        | "success"
        | "partial"
        | "failed"
        | "skipped"
      social_platform:
        | "instagram"
        | "facebook"
        | "tiktok"
        | "youtube"
        | "linkedin"
        | "x"
        | "pinterest"
        | "threads"
        | "bluesky"
        | "gmb"
        | "snapchat"
      workspace_member_role:
        | "owner"
        | "approver"
        | "viewer"
        | "admin"
        | "editor"
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
      account_status: ["pending", "active", "suspended", "expired", "archived"],
      agreement_term: ["one_time", "90_day", "6_month", "12_month"],
      app_role: [
        "dream_wave_owner",
        "dream_wave_team",
        "client_owner",
        "client_approver",
        "client_viewer",
      ],
      approval_decision: [
        "pending",
        "approved",
        "changes_requested",
        "rejected",
      ],
      client_access_tier: ["project_client", "growth_90", "retainer_full"],
      content_status: [
        "draft",
        "in_review",
        "changes_requested",
        "approved",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "archived",
      ],
      crm_sync_status: ["not_connected", "pending", "synced", "failed"],
      invite_status: ["pending", "accepted", "expired", "revoked"],
      media_publishing_status: [
        "none",
        "preparing",
        "ready",
        "expired",
        "failed",
      ],
      notification_kind: [
        "invite_accepted",
        "content_submitted",
        "content_approved",
        "content_changes_requested",
        "content_rejected",
        "content_published",
        "content_failed",
        "comment_added",
        "account_connected",
        "account_disconnected",
        "generic",
      ],
      publish_status: [
        "queued",
        "sending",
        "success",
        "partial",
        "failed",
        "skipped",
      ],
      social_platform: [
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "linkedin",
        "x",
        "pinterest",
        "threads",
        "bluesky",
        "gmb",
        "snapchat",
      ],
      workspace_member_role: ["owner", "approver", "viewer", "admin", "editor"],
      workspace_status: ["onboarding", "active", "paused", "archived"],
    },
  },
} as const
