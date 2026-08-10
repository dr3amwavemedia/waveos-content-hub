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
      client_checklist_items: {
        Row: {
          checklist_type: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          sort_order: number
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          checklist_type?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          checklist_type?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_checklist_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contact_preferences: {
        Row: {
          best_time: string | null
          contact_email: string | null
          contact_phone: string | null
          preferred_method: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          best_time?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          preferred_method?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          best_time?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          preferred_method?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contact_preferences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_deliveries: {
        Row: {
          created_at: string
          created_by: string | null
          delivered_at: string
          description: string | null
          id: string
          is_pinned: boolean
          kind: Database["public"]["Enums"]["delivery_kind"]
          title: string
          updated_at: string
          url: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          description?: string | null
          id?: string
          is_pinned?: boolean
          kind?: Database["public"]["Enums"]["delivery_kind"]
          title: string
          updated_at?: string
          url: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          description?: string | null
          id?: string
          is_pinned?: boolean
          kind?: Database["public"]["Enums"]["delivery_kind"]
          title?: string
          updated_at?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoices: {
        Row: {
          amount_cents: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          due_at: string | null
          hosted_url: string | null
          id: string
          issued_at: string
          number: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_at?: string | null
          hosted_url?: string | null
          id?: string
          issued_at?: string
          number?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          due_at?: string | null
          hosted_url?: string | null
          id?: string
          issued_at?: string
          number?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_request_internal_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          request_id: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          request_id: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          request_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_request_internal_notes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_request_internal_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requests: {
        Row: {
          created_at: string
          created_by: string | null
          decision: Database["public"]["Enums"]["approval_decision"]
          description: string | null
          due_at: string | null
          id: string
          request_type: string
          responded_at: string | null
          responded_by: string | null
          response_note: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"]
          description?: string | null
          due_at?: string | null
          id?: string
          request_type?: string
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decision?: Database["public"]["Enums"]["approval_decision"]
          description?: string | null
          due_at?: string | null
          id?: string
          request_type?: string
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
      content_item_internal_notes: {
        Row: {
          content_item_id: string
          created_at: string
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_item_id: string
          created_at?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_item_id?: string
          created_at?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_item_internal_notes_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: true
            referencedRelation: "content_items"
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
      crm_accounts: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          archived_at: string | null
          assigned_to: string | null
          business_name: string
          city: string | null
          converted_at: string | null
          country: string
          created_at: string
          created_by: string
          email: string | null
          estimated_value_cents: number | null
          id: string
          industry: string | null
          interested_services: string[]
          last_contacted_at: string | null
          lead_source: string | null
          linked_workspace_id: string | null
          next_follow_up_at: string | null
          phone: string | null
          postal_code: string | null
          preferred_contact_method: string | null
          priority: Database["public"]["Enums"]["crm_priority"]
          referral_name: string | null
          social_links: Json
          stage: Database["public"]["Enums"]["crm_pipeline_stage"]
          state: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          business_name: string
          city?: string | null
          converted_at?: string | null
          country?: string
          created_at?: string
          created_by?: string
          email?: string | null
          estimated_value_cents?: number | null
          id?: string
          industry?: string | null
          interested_services?: string[]
          last_contacted_at?: string | null
          lead_source?: string | null
          linked_workspace_id?: string | null
          next_follow_up_at?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"]
          referral_name?: string | null
          social_links?: Json
          stage?: Database["public"]["Enums"]["crm_pipeline_stage"]
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          business_name?: string
          city?: string | null
          converted_at?: string | null
          country?: string
          created_at?: string
          created_by?: string
          email?: string | null
          estimated_value_cents?: number | null
          id?: string
          industry?: string | null
          interested_services?: string[]
          last_contacted_at?: string | null
          lead_source?: string | null
          linked_workspace_id?: string | null
          next_follow_up_at?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          priority?: Database["public"]["Enums"]["crm_priority"]
          referral_name?: string | null
          social_links?: Json
          stage?: Database["public"]["Enums"]["crm_pipeline_stage"]
          state?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_accounts_linked_workspace_id_fkey"
            columns: ["linked_workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          account_id: string
          activity_type: string
          actor_id: string | null
          created_at: string
          id: string
          occurred_at: string
          safe_metadata: Json
          summary: string
        }
        Insert: {
          account_id: string
          activity_type: string
          actor_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          safe_metadata?: Json
          summary: string
        }
        Update: {
          account_id?: string
          activity_type?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          occurred_at?: string
          safe_metadata?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          account_id: string
          created_at: string
          created_by: string
          email: string | null
          first_name: string
          id: string
          is_primary: boolean
          job_title: string | null
          last_name: string | null
          phone: string | null
          preferred_contact_method: string | null
          social_links: Json
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string
          email?: string | null
          first_name: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          last_name?: string | null
          phone?: string | null
          preferred_contact_method?: string | null
          social_links?: Json
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string
          email?: string | null
          first_name?: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          last_name?: string | null
          phone?: string | null
          preferred_contact_method?: string | null
          social_links?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notes: {
        Row: {
          account_id: string
          author_id: string
          body: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          author_id?: string
          body: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          account_id: string | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          priority: Database["public"]["Enums"]["crm_priority"]
          status: Database["public"]["Enums"]["crm_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["crm_priority"]
          status?: Database["public"]["Enums"]["crm_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["crm_priority"]
          status?: Database["public"]["Enums"]["crm_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
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
          staff_type: Database["public"]["Enums"]["staff_type"] | null
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
          staff_type?: Database["public"]["Enums"]["staff_type"] | null
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
          staff_type?: Database["public"]["Enums"]["staff_type"] | null
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
      outlook_connections: {
        Row: {
          access_token_encrypted: string
          created_at: string
          email: string
          microsoft_user_id: string
          refresh_token_encrypted: string
          scopes: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          created_at?: string
          email: string
          microsoft_user_id: string
          refresh_token_encrypted: string
          scopes: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          created_at?: string
          email?: string
          microsoft_user_id?: string
          refresh_token_encrypted?: string
          scopes?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      outlook_oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          state?: string
          user_id?: string
        }
        Relationships: []
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
          staff_type: Database["public"]["Enums"]["staff_type"] | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          staff_type?: Database["public"]["Enums"]["staff_type"] | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          staff_type?: Database["public"]["Enums"]["staff_type"] | null
          user_id?: string
        }
        Relationships: []
      }
      vision_deck_events: {
        Row: {
          created_at: string
          deck_id: string
          event_type: string
          id: string
          safe_metadata: Json
          session_id: string
          slide_key: string | null
        }
        Insert: {
          created_at?: string
          deck_id: string
          event_type: string
          id?: string
          safe_metadata?: Json
          session_id: string
          slide_key?: string | null
        }
        Update: {
          created_at?: string
          deck_id?: string
          event_type?: string
          id?: string
          safe_metadata?: Json
          session_id?: string
          slide_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vision_deck_events_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "vision_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_decks: {
        Row: {
          accent_color: string
          company_name: string
          content: Json
          created_at: string
          created_by: string
          id: string
          prospect_email: string | null
          prospect_name: string | null
          published_at: string | null
          share_enabled: boolean
          share_token: string
          status: Database["public"]["Enums"]["vision_deck_status"]
          title: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          accent_color?: string
          company_name: string
          content?: Json
          created_at?: string
          created_by: string
          id?: string
          prospect_email?: string | null
          prospect_name?: string | null
          published_at?: string | null
          share_enabled?: boolean
          share_token?: string
          status?: Database["public"]["Enums"]["vision_deck_status"]
          title: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          accent_color?: string
          company_name?: string
          content?: Json
          created_at?: string
          created_by?: string
          id?: string
          prospect_email?: string | null
          prospect_name?: string | null
          published_at?: string | null
          share_enabled?: boolean
          share_token?: string
          status?: Database["public"]["Enums"]["vision_deck_status"]
          title?: string
          updated_at?: string
          updated_by?: string
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
      workspace_internal_notes: {
        Row: {
          notes: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          notes?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          notes?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_internal_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
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
          staff_type: Database["public"]["Enums"]["staff_type"] | null
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
          staff_type?: Database["public"]["Enums"]["staff_type"] | null
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
          staff_type?: Database["public"]["Enums"]["staff_type"] | null
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
      admin_update_crm_identity: {
        Args: {
          _account_id: string
          _business_name: string
          _contact_id?: string
          _first_name?: string
          _last_name?: string
        }
        Returns: undefined
      }
      admin_update_staff_name: {
        Args: { _first_name: string; _last_name?: string; _target_user: string }
        Returns: undefined
      }
      admin_update_workspace_name: {
        Args: { _name: string; _workspace_id: string }
        Returns: undefined
      }
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
      create_staff_invite:
        | {
            Args: { _email: string; _expires_days?: number }
            Returns: {
              invite_id: string
              raw_token: string
            }[]
          }
        | {
            Args: {
              _email: string
              _expires_days?: number
              _staff_type: Database["public"]["Enums"]["staff_type"]
            }
            Returns: {
              invite_id: string
              raw_token: string
            }[]
          }
      crm_convert_lead_to_client: {
        Args: {
          _access_tier?: Database["public"]["Enums"]["client_access_tier"]
          _account_id: string
          _agreement_term?: Database["public"]["Enums"]["agreement_term"]
          _timezone?: string
        }
        Returns: {
          workspace_id: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      crm_delete_lead: { Args: { _account_id: string }; Returns: string }
      crm_find_duplicates: {
        Args: { _business_name: string; _email: string; _phone: string }
        Returns: {
          account_id: string
          business_name: string
          match_reason: string
        }[]
      }
      crm_import_bloom_leads: { Args: { _leads: Json }; Returns: Json }
      crm_log_communication: {
        Args: {
          _account_id: string
          _activity_type: string
          _assigned_to?: string
          _next_action?: string
          _next_due_at?: string
          _occurred_at?: string
          _summary: string
        }
        Returns: string
      }
      delete_empty_client_workspace: {
        Args: { _confirmation: string; _workspace_id: string }
        Returns: string
      }
      decide_content_approval: {
        Args: {
          _content_id: string
          _decision: Database["public"]["Enums"]["approval_decision"]
          _note?: string
        }
        Returns: Database["public"]["Enums"]["content_status"]
      }
      get_client_member_directory: {
        Args: { _workspace_id: string }
        Returns: {
          email: string
          first_name: string
          last_name: string
          user_id: string
          workspace_role: Database["public"]["Enums"]["workspace_member_role"]
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
      get_public_vision_deck: {
        Args: { _share_token: string }
        Returns: {
          accent_color: string
          company_name: string
          content: Json
          id: string
          prospect_name: string
          published_at: string
          title: string
        }[]
      }
      get_staff_directory: {
        Args: never
        Returns: {
          created_at: string
          email: string
          first_name: string
          last_name: string
          role: Database["public"]["Enums"]["app_role"]
          staff_type: Database["public"]["Enums"]["staff_type"]
          user_id: string
        }[]
      }
      get_staff_forward_directory: {
        Args: never
        Returns: {
          email: string
          first_name: string
          last_name: string
          role: Database["public"]["Enums"]["app_role"]
          staff_type: string
          user_id: string
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
      notify_delivery_revisions_updated: {
        Args: { _delivery_id: string }
        Returns: number
      }
      outlook_complete_connection: {
        Args: {
          _access_token_encrypted: string
          _email: string
          _microsoft_user_id: string
          _refresh_token_encrypted: string
          _scopes: string
          _state: string
          _token_expires_at: string
        }
        Returns: undefined
      }
      outlook_read_oauth_state: {
        Args: { _state: string }
        Returns: {
          code_verifier: string
          user_id: string
        }[]
      }
      phase4_add_checklist_item: {
        Args: {
          _checklist_type?: string
          _description?: string
          _due_at?: string
          _title: string
          _workspace_id: string
        }
        Returns: string
      }
      phase4_add_standard_onboarding: {
        Args: { _workspace_id: string }
        Returns: number
      }
      phase4_create_request: {
        Args: {
          _description?: string
          _due_at?: string
          _request_type?: string
          _title: string
          _workspace_id: string
        }
        Returns: string
      }
      phase4_refresh_deadline_notifications: {
        Args: { _workspace_id: string }
        Returns: number
      }
      phase4_respond_to_request: {
        Args: {
          _decision: Database["public"]["Enums"]["approval_decision"]
          _request_id: string
          _response_note?: string
        }
        Returns: undefined
      }
      phase4_save_contact_preferences: {
        Args: {
          _best_time?: string
          _contact_email?: string
          _contact_phone?: string
          _preferred_method: string
          _workspace_id: string
        }
        Returns: undefined
      }
      phase4_set_checklist_status: {
        Args: { _item_id: string; _status: string }
        Returns: undefined
      }
      record_vision_deck_event: {
        Args: {
          _event_type: string
          _session_id: string
          _share_token: string
          _slide_key?: string
        }
        Returns: boolean
      }
      resend_invite: {
        Args: { _extend_days?: number; _invite_id: string }
        Returns: {
          raw_token: string
        }[]
      }
      submit_content_for_approval: {
        Args: {
          _content_id: string
          _requested_action: string
          _scheduled_at?: string
        }
        Returns: Database["public"]["Enums"]["content_status"]
      }
      revoke_invite: { Args: { _invite_id: string }; Returns: undefined }
      revoke_staff_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      set_staff_position: {
        Args: { _position: string; _target_user: string }
        Returns: undefined
      }
      set_staff_type: {
        Args: {
          _staff_type: Database["public"]["Enums"]["staff_type"]
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
      crm_pipeline_stage:
        | "new_lead"
        | "contacted"
        | "discovery_scheduled"
        | "qualified"
        | "proposal_sent"
        | "negotiating"
        | "won"
        | "lost"
        | "archived"
      crm_priority: "low" | "normal" | "high" | "urgent"
      crm_sync_status: "not_connected" | "pending" | "synced" | "failed"
      crm_task_status: "open" | "in_progress" | "completed" | "cancelled"
      delivery_kind:
        | "photos"
        | "videos"
        | "reels"
        | "graphics"
        | "documents"
        | "link"
        | "other"
      invite_status: "pending" | "accepted" | "expired" | "revoked"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "overdue"
        | "void"
        | "deposit"
        | "unpaid"
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
      staff_type: "sales" | "media_manager"
      vision_deck_status: "draft" | "ready" | "archived"
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
      crm_pipeline_stage: [
        "new_lead",
        "contacted",
        "discovery_scheduled",
        "qualified",
        "proposal_sent",
        "negotiating",
        "won",
        "lost",
        "archived",
      ],
      crm_priority: ["low", "normal", "high", "urgent"],
      crm_sync_status: ["not_connected", "pending", "synced", "failed"],
      crm_task_status: ["open", "in_progress", "completed", "cancelled"],
      delivery_kind: [
        "photos",
        "videos",
        "reels",
        "graphics",
        "documents",
        "link",
        "other",
      ],
      invite_status: ["pending", "accepted", "expired", "revoked"],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "overdue",
        "void",
        "deposit",
        "unpaid",
      ],
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
      staff_type: ["sales", "media_manager"],
      vision_deck_status: ["draft", "ready", "archived"],
      workspace_member_role: ["owner", "approver", "viewer", "admin", "editor"],
      workspace_status: ["onboarding", "active", "paused", "archived"],
    },
  },
} as const
