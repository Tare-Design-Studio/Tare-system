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
      _migrations: {
        Row: {
          applied_at: string
          filename: string
        }
        Insert: {
          applied_at?: string
          filename: string
        }
        Update: {
          applied_at?: string
          filename?: string
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          accumulated_minutes: number
          is_late: boolean | null
          overtime_minutes: number | null
          workday_end_snapshot: string | null
          check_in_at: string | null
          check_in_count: number
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_within_geofence: boolean | null
          check_in_office_id: string | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_within_geofence: boolean | null
          check_out_office_id: string | null
          created_at: string
          id: string
          last_check_in_at: string | null
          tenant_id: string
          total_minutes: number | null
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          accumulated_minutes?: number
          is_late?: boolean | null
          overtime_minutes?: number | null
          workday_end_snapshot?: string | null
          check_in_at?: string | null
          check_in_count?: number
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_within_geofence?: boolean | null
          check_in_office_id?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_within_geofence?: boolean | null
          check_out_office_id?: string | null
          created_at?: string
          id?: string
          last_check_in_at?: string | null
          tenant_id: string
          total_minutes?: number | null
          updated_at?: string
          user_id: string
          work_date?: string
        }
        Update: {
          accumulated_minutes?: number
          is_late?: boolean | null
          overtime_minutes?: number | null
          workday_end_snapshot?: string | null
          check_in_at?: string | null
          check_in_count?: number
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_within_geofence?: boolean | null
          check_in_office_id?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_within_geofence?: boolean | null
          check_out_office_id?: string | null
          created_at?: string
          id?: string
          last_check_in_at?: string | null
          tenant_id?: string
          total_minutes?: number | null
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_check_in_office_id_fkey"
            columns: ["check_in_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_check_out_office_id_fkey"
            columns: ["check_out_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          address: string | null
          created_at: string
          geofence_radius_m: number
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          geofence_radius_m?: number
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          geofence_radius_m?: number
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_export_log: {
        Row: {
          drive_file_id: string | null
          export_sha256: string
          exported_at: string
          exported_by: string | null
          first_row_hash: string
          id: string
          last_row_hash: string
          notes: string | null
          range_end: string
          range_start: string
          row_count: number
          tenant_id: string
        }
        Insert: {
          drive_file_id?: string | null
          export_sha256: string
          exported_at?: string
          exported_by?: string | null
          first_row_hash: string
          id?: string
          last_row_hash: string
          notes?: string | null
          range_end: string
          range_start: string
          row_count: number
          tenant_id: string
        }
        Update: {
          drive_file_id?: string | null
          export_sha256?: string
          exported_at?: string
          exported_by?: string | null
          first_row_hash?: string
          id?: string
          last_row_hash?: string
          notes?: string | null
          range_end?: string
          range_start?: string
          row_count?: number
          tenant_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: string
          ip_address: unknown
          occurred_at: string
          prev_hash: string
          request_id: string | null
          resource_id: string | null
          resource_type: string
          row_hash: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: string
          ip_address?: unknown
          occurred_at?: string
          prev_hash: string
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          row_hash: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: string
          ip_address?: unknown
          occurred_at?: string
          prev_hash?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          row_hash?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bridge_messages: {
        Row: {
          attachment_id: string | null
          author_id: string
          body: string | null
          conversation_id: string | null
          created_at: string
          id: string
          message_type: string
          project_id: string | null
          reply_to_id: string | null
          structured_payload: Json | null
          tenant_id: string
          edited_at: string | null
        }
        Insert: {
          attachment_id: string | null
          author_id: string
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_type?: string
          project_id: string | null
          reply_to_id: string | null
          structured_payload?: Json | null
          tenant_id: string
          edited_at?: string | null
        }
        Update: {
          attachment_id?: string | null
          author_id?: string
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_type?: string
          project_id?: string | null
          reply_to_id?: string | null
          structured_payload?: Json | null
          tenant_id?: string
          edited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bridge_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bridge_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bridge_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "bridge_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachments: {
        Row: {
          bucket: string
          byte_size: number
          created_at: string
          file_name: string | null
          id: string
          mime_type: string
          scan_status: string
          storage_path: string
          tenant_id: string
          uploaded_by: string
          webp_path: string | null
        }
        Insert: {
          bucket?: string
          byte_size: number
          created_at?: string
          file_name?: string | null
          id?: string
          mime_type: string
          scan_status?: string
          storage_path: string
          tenant_id: string
          uploaded_by: string
          webp_path?: string | null
        }
        Update: {
          bucket?: string
          byte_size?: number
          created_at?: string
          file_name?: string | null
          id?: string
          mime_type?: string
          scan_status?: string
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string
          webp_path?: string | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          dm_hi: string | null
          dm_lo: string | null
          id: string
          kind: string
          last_message_at: string | null
          project_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          dm_hi?: string | null
          dm_lo?: string | null
          id?: string
          kind: string
          last_message_at?: string | null
          project_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          dm_hi?: string | null
          dm_lo?: string | null
          id?: string
          kind?: string
          last_message_at?: string | null
          project_id?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      chat_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          ends_at: string | null
          enquiry_id: string | null
          id: string
          project_id: string | null
          source_id: string | null
          source_type: string | null
          starts_at: string
          tenant_id: string
          title: string
          visibility: string
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          ends_at?: string | null
          enquiry_id?: string | null
          id?: string
          project_id?: string | null
          source_id?: string | null
          source_type?: string | null
          starts_at: string
          tenant_id: string
          title: string
          visibility?: string
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          ends_at?: string | null
          enquiry_id?: string | null
          id?: string
          project_id?: string | null
          source_id?: string | null
          source_type?: string | null
          starts_at?: string
          tenant_id?: string
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "calendar_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_items: {
        Row: {
          checkpoint_id: string
          completed_at: string | null
          completed_by: string | null
          description: string
          id: string
          is_complete: boolean | null
          notes: string | null
          photo_url: string | null
          tenant_id: string
        }
        Insert: {
          checkpoint_id: string
          completed_at?: string | null
          completed_by?: string | null
          description: string
          id?: string
          is_complete?: boolean | null
          notes?: string | null
          photo_url?: string | null
          tenant_id: string
        }
        Update: {
          checkpoint_id?: string
          completed_at?: string | null
          completed_by?: string | null
          description?: string
          id?: string
          is_complete?: boolean | null
          notes?: string | null
          photo_url?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_items_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "project_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_items_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "v_checkpoint_progress"
            referencedColumns: ["checkpoint_id"]
          },
          {
            foreignKeyName: "checkpoint_items_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "v_project_checkpoint_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_template_items: {
        Row: {
          default_offset_days: number | null
          default_payment_pct: number | null
          id: string
          name: string
          requires_approval: boolean | null
          sequence_order: number
          template_id: string
          tenant_id: string
        }
        Insert: {
          default_offset_days?: number | null
          default_payment_pct?: number | null
          id?: string
          name: string
          requires_approval?: boolean | null
          sequence_order: number
          template_id: string
          tenant_id: string
        }
        Update: {
          default_offset_days?: number | null
          default_payment_pct?: number | null
          id?: string
          name?: string
          requires_approval?: boolean | null
          sequence_order?: number
          template_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checkpoint_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_template_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoint_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoint_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_updates: {
        Row: {
          id: string
          tenant_id: string
          customer_id: string
          project_id: string | null
          author_id: string
          body: string
          is_visible: boolean
          created_at: string
          edited_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string
          customer_id: string
          project_id?: string | null
          author_id: string
          body: string
          is_visible?: boolean
          created_at?: string
          edited_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          customer_id?: string
          project_id?: string | null
          author_id?: string
          body?: string
          is_visible?: boolean
          created_at?: string
          edited_at?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_from_enquiry_id: string | null
          customer_portal_enabled: boolean | null
          customer_portal_hash: string | null
          customer_portal_hash_generated_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          tenant_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_from_enquiry_id?: string | null
          customer_portal_enabled?: boolean | null
          customer_portal_hash?: string | null
          customer_portal_hash_generated_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tenant_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_from_enquiry_id?: string | null
          customer_portal_enabled?: boolean | null
          customer_portal_hash?: string | null
          customer_portal_hash_generated_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_from_enquiry_id_fk"
            columns: ["created_from_enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiries: {
        Row: {
          converted_to_customer_id: string | null
          created_at: string
          created_by: string | null
          created_via: string
          deleted_at: string | null
          email: string | null
          id: string
          ip_address: unknown
          message: string | null
          name: string
          phone: string | null
          phone_normalized: string | null
          referrer_url: string | null
          source: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          converted_to_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          ip_address?: unknown
          message?: string | null
          name: string
          phone?: string | null
          phone_normalized?: string | null
          referrer_url?: string | null
          source?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          converted_to_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          created_via?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          ip_address?: unknown
          message?: string | null
          name?: string
          phone?: string | null
          phone_normalized?: string | null
          referrer_url?: string | null
          source?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiries_converted_to_customer_id_fk"
            columns: ["converted_to_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_intake: {
        Row: {
          intake_slug: string
          ip_rate_limit_per_hour: number
          is_enabled: boolean
          phone_soft_block_hours: number
          rotated_at: string
          tenant_id: string
        }
        Insert: {
          intake_slug: string
          ip_rate_limit_per_hour?: number
          is_enabled?: boolean
          phone_soft_block_hours?: number
          rotated_at?: string
          tenant_id: string
        }
        Update: {
          intake_slug?: string
          ip_rate_limit_per_hour?: number
          is_enabled?: boolean
          phone_soft_block_hours?: number
          rotated_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_intake_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_phones: {
        Row: {
          created_at: string
          enquiry_id: string
          id: string
          is_primary: boolean | null
          label: string | null
          phone: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          enquiry_id: string
          id?: string
          is_primary?: boolean | null
          label?: string | null
          phone: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          enquiry_id?: string
          id?: string
          is_primary?: boolean | null
          label?: string | null
          phone?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_phones_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_phones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_remarks: {
        Row: {
          created_at: string
          created_by: string
          enquiry_id: string
          id: string
          remark: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          enquiry_id: string
          id?: string
          remark: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          enquiry_id?: string
          id?: string
          remark?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_remarks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_remarks_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_remarks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_reminders: {
        Row: {
          category: string
          created_at: string
          customer_id: string | null
          done_at: string | null
          enquiry_id: string | null
          id: string
          is_done: boolean
          message: string | null
          priority: string | null
          remind_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          customer_id?: string | null
          done_at?: string | null
          enquiry_id?: string | null
          id?: string
          is_done?: boolean
          message?: string | null
          priority?: string | null
          remind_at: string
          tenant_id: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          customer_id?: string | null
          done_at?: string | null
          enquiry_id?: string | null
          id?: string
          is_done?: boolean
          message?: string | null
          priority?: string | null
          remind_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_reminders_customer_id_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_reminders_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          category: string
          corrects_expense_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_corrected: boolean
          is_miscellaneous: boolean
          linked_checkpoint_id: string | null
          linked_material_consumption_id: string | null
          linked_material_plan_id: string | null
          project_id: string
          receipt_url: string | null
          recorded_by: string
          rejection_reason: string | null
          spent_on: string
          tenant_id: string
        }
        Insert: {
          amount: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          category: string
          corrects_expense_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_corrected?: boolean
          is_miscellaneous?: boolean
          linked_checkpoint_id?: string | null
          linked_material_consumption_id?: string | null
          linked_material_plan_id?: string | null
          project_id: string
          receipt_url?: string | null
          recorded_by: string
          rejection_reason?: string | null
          spent_on?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          corrects_expense_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_corrected?: boolean
          is_miscellaneous?: boolean
          linked_checkpoint_id?: string | null
          linked_material_consumption_id?: string | null
          linked_material_plan_id?: string | null
          project_id?: string
          receipt_url?: string | null
          recorded_by?: string
          rejection_reason?: string | null
          spent_on?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_corrects_expense_id_fkey"
            columns: ["corrects_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_corrects_expense_id_fkey"
            columns: ["corrects_expense_id"]
            isOneToOne: false
            referencedRelation: "v_expenses_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_checkpoint_id_fkey"
            columns: ["linked_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "project_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_checkpoint_id_fkey"
            columns: ["linked_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "v_checkpoint_progress"
            referencedColumns: ["checkpoint_id"]
          },
          {
            foreignKeyName: "expenses_linked_checkpoint_id_fkey"
            columns: ["linked_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "v_project_checkpoint_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_material_consumption_id_fkey"
            columns: ["linked_material_consumption_id"]
            isOneToOne: false
            referencedRelation: "material_consumption"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_material_consumption_id_fkey"
            columns: ["linked_material_consumption_id"]
            isOneToOne: false
            referencedRelation: "v_material_consumption_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_material_plan_id_fkey"
            columns: ["linked_material_plan_id"]
            isOneToOne: false
            referencedRelation: "material_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_consumption: {
        Row: {
          consumed_on: string
          corrects_material_consumption_id: string | null
          created_at: string
          deleted_at: string | null
          excess_reason: string | null
          expense_id: string | null
          id: string
          is_corrected: boolean
          is_excess: boolean
          material_name: string
          material_plan_id: string | null
          project_id: string
          quantity_used: number
          recorded_by: string
          tenant_id: string
          unit: string
        }
        Insert: {
          consumed_on?: string
          corrects_material_consumption_id?: string | null
          created_at?: string
          deleted_at?: string | null
          excess_reason?: string | null
          expense_id?: string | null
          id?: string
          is_corrected?: boolean
          is_excess?: boolean
          material_name: string
          material_plan_id?: string | null
          project_id: string
          quantity_used: number
          recorded_by: string
          tenant_id: string
          unit: string
        }
        Update: {
          consumed_on?: string
          corrects_material_consumption_id?: string | null
          created_at?: string
          deleted_at?: string | null
          excess_reason?: string | null
          expense_id?: string | null
          id?: string
          is_corrected?: boolean
          is_excess?: boolean
          material_name?: string
          material_plan_id?: string | null
          project_id?: string
          quantity_used?: number
          recorded_by?: string
          tenant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_mat_consumption_expense"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mat_consumption_expense"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "v_expenses_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_corrects_material_consumption_id_fkey"
            columns: ["corrects_material_consumption_id"]
            isOneToOne: false
            referencedRelation: "material_consumption"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_corrects_material_consumption_id_fkey"
            columns: ["corrects_material_consumption_id"]
            isOneToOne: false
            referencedRelation: "v_material_consumption_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_material_plan_id_fkey"
            columns: ["material_plan_id"]
            isOneToOne: false
            referencedRelation: "material_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "material_consumption_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_plan: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          linked_project_table_id: string | null
          linked_project_table_row_id: string | null
          material_name: string
          planned_for_date: string | null
          planned_for_week: string | null
          planned_quantity: number
          project_id: string
          source_bridge_message_id: string | null
          tenant_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          linked_project_table_id?: string | null
          linked_project_table_row_id?: string | null
          material_name: string
          planned_for_date?: string | null
          planned_for_week?: string | null
          planned_quantity: number
          project_id: string
          source_bridge_message_id?: string | null
          tenant_id: string
          unit: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          linked_project_table_id?: string | null
          linked_project_table_row_id?: string | null
          material_name?: string
          planned_for_date?: string | null
          planned_for_week?: string | null
          planned_quantity?: number
          project_id?: string
          source_bridge_message_id?: string | null
          tenant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_plan_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_plan_linked_project_table_id_fkey"
            columns: ["linked_project_table_id"]
            isOneToOne: false
            referencedRelation: "project_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_plan_linked_project_table_row_id_fkey"
            columns: ["linked_project_table_row_id"]
            isOneToOne: false
            referencedRelation: "project_table_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_plan_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_plan_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "material_plan_source_bridge_message_id_fkey"
            columns: ["source_bridge_message_id"]
            isOneToOne: false
            referencedRelation: "bridge_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_plan_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_plan_preset_items: {
        Row: {
          id: string
          material_name: string
          planned_quantity: number
          preset_id: string
          sequence_order: number
          tenant_id: string
          unit: string
        }
        Insert: {
          id?: string
          material_name: string
          planned_quantity: number
          preset_id: string
          sequence_order: number
          tenant_id: string
          unit: string
        }
        Update: {
          id?: string
          material_name?: string
          planned_quantity?: number
          preset_id?: string
          sequence_order?: number
          tenant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_plan_preset_items_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "material_plan_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_plan_preset_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_plan_presets: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_system: boolean | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_plan_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_plan_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          bucket: string
          created_at: string
          drive_file_id: string | null
          drive_sync_error: string | null
          drive_sync_status: string
          drive_synced_at: string | null
          id: string
          is_clean: boolean | null
          kind: string
          linked_checkpoint_item_id: string | null
          linked_update_id: string | null
          project_id: string
          scan_error: string | null
          scan_status: string
          scanned_at: string | null
          storage_path: string
          taken_at: string | null
          tenant_id: string
          uploaded_by: string
          visible_to_customer: boolean
          webp_path: string | null
          customer_caption: string | null
          customer_sort: number | null
        }
        Insert: {
          bucket?: string
          created_at?: string
          drive_file_id?: string | null
          drive_sync_error?: string | null
          drive_sync_status?: string
          drive_synced_at?: string | null
          id?: string
          is_clean?: boolean | null
          kind: string
          linked_checkpoint_item_id?: string | null
          linked_update_id?: string | null
          project_id: string
          scan_error?: string | null
          scan_status?: string
          scanned_at?: string | null
          storage_path: string
          taken_at?: string | null
          tenant_id: string
          uploaded_by: string
          visible_to_customer?: boolean
          webp_path?: string | null
          customer_caption?: string | null
          customer_sort?: number | null
        }
        Update: {
          bucket?: string
          created_at?: string
          drive_file_id?: string | null
          drive_sync_error?: string | null
          drive_sync_status?: string
          drive_synced_at?: string | null
          id?: string
          is_clean?: boolean | null
          kind?: string
          linked_checkpoint_item_id?: string | null
          linked_update_id?: string | null
          project_id?: string
          scan_error?: string | null
          scan_status?: string
          scanned_at?: string | null
          storage_path?: string
          taken_at?: string | null
          tenant_id?: string
          uploaded_by?: string
          visible_to_customer?: boolean
          webp_path?: string | null
          customer_caption?: string | null
          customer_sort?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_linked_checkpoint_item_id_fkey"
            columns: ["linked_checkpoint_item_id"]
            isOneToOne: false
            referencedRelation: "checkpoint_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_linked_update_id_fkey"
            columns: ["linked_update_id"]
            isOneToOne: false
            referencedRelation: "updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "media_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      member_tasks: {
        // Hand-patched (no `supabase gen types`), same pattern as 066/067/092:
        // the 083 lifecycle columns and 095's project_id.
        Row: {
          accepted_at: string | null
          assigned_by: string | null
          completed: boolean
          completed_at: string | null
          drawing_role: Database["public"]["Enums"]["drawing_role"] | null
          created_at: string
          due_date: string | null
          id: string
          project_id: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          tag: string
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_by?: string | null
          completed?: boolean
          completed_at?: string | null
          drawing_role?: Database["public"]["Enums"]["drawing_role"] | null
          created_at?: string
          due_date?: string | null
          id?: string
          project_id?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          tag?: string
          tenant_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          assigned_by?: string | null
          completed?: boolean
          completed_at?: string | null
          drawing_role?: Database["public"]["Enums"]["drawing_role"] | null
          created_at?: string
          due_date?: string | null
          id?: string
          project_id?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          tag?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          acknowledged_at: string | null
          id: string
          is_acknowledged: boolean
          is_read: boolean
          notification_id: string
          push_attempts: number
          push_delivered: boolean
          push_last_attempt_at: string | null
          push_last_error: string | null
          read_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          id?: string
          is_acknowledged?: boolean
          is_read?: boolean
          notification_id: string
          push_attempts?: number
          push_delivered?: boolean
          push_last_attempt_at?: string | null
          push_last_error?: string | null
          read_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          id?: string
          is_acknowledged?: boolean
          is_read?: boolean
          notification_id?: string
          push_attempts?: number
          push_delivered?: boolean
          push_last_attempt_at?: string | null
          push_last_error?: string | null
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          severity: Database["public"]["Enums"]["notification_severity"]
          source_id: string | null
          source_type: string
          tenant_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          severity?: Database["public"]["Enums"]["notification_severity"]
          source_id?: string | null
          source_type: string
          tenant_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          severity?: Database["public"]["Enums"]["notification_severity"]
          source_id?: string | null
          source_type?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_broadcast_recipients: {
        Row: {
          acknowledged_at: string | null
          broadcast_id: string
          id: string
          is_acknowledged: boolean
          tenant_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          broadcast_id: string
          id?: string
          is_acknowledged?: boolean
          tenant_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          broadcast_id?: string
          id?: string
          is_acknowledged?: boolean
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "owner_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_broadcast_recipients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_broadcast_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_broadcasts: {
        Row: {
          attachment_url: string | null
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          id: string
          tenant_id: string
          voice_duration_s: number | null
          voice_path: string | null
        }
        Insert: {
          attachment_url?: string | null
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          voice_duration_s?: number | null
          voice_path?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          attachment_url?: string | null
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          voice_duration_s?: number | null
          voice_path?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_broadcasts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_broadcasts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestone_preset_items: {
        Row: {
          id: string
          milestone_name: string
          notes: string | null
          percentage: number
          preset_id: string
          sequence_order: number
          tenant_id: string
          wing: string
          part: string
        }
        Insert: {
          id?: string
          milestone_name: string
          notes?: string | null
          percentage: number
          preset_id: string
          sequence_order: number
          tenant_id: string
          wing?: string
          part?: string
        }
        Update: {
          id?: string
          milestone_name?: string
          notes?: string | null
          percentage?: number
          preset_id?: string
          sequence_order?: number
          tenant_id?: string
          wing?: string
          part?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestone_preset_items_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "payment_milestone_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestone_preset_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestone_presets: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_system: boolean | null
          name: string
          tenant_id: string
          updated_at: string
          scope: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
          scope?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestone_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestone_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount_paid: number
          created_at: string
          id: string
          method: string | null
          notes: string | null
          paid_on: string
          payment_schedule_id: string | null
          project_id: string
          recorded_by: string | null
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount_paid: number
          created_at?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_on: string
          payment_schedule_id?: string | null
          project_id: string
          recorded_by?: string | null
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_on?: string
          payment_schedule_id?: string | null
          project_id?: string
          recorded_by?: string | null
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "payment_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "v_payment_status"
            referencedColumns: ["schedule_id"]
          },
          {
            foreignKeyName: "payment_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "payment_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedule: {
        Row: {
          amount_due: number
          created_at: string
          deleted_at: string | null
          due_date: string
          id: string
          is_paid: boolean
          milestone_name: string
          notes: string | null
          project_id: string
          sequence_order: number
          tenant_id: string
          triggered_at: string | null
          updated_at: string
          wing: string
          part: string
        }
        Insert: {
          amount_due: number
          created_at?: string
          deleted_at?: string | null
          due_date: string
          id?: string
          is_paid?: boolean
          milestone_name: string
          notes?: string | null
          project_id: string
          sequence_order: number
          tenant_id: string
          triggered_at?: string | null
          updated_at?: string
          wing?: string
          part?: string
        }
        Update: {
          amount_due?: number
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          id?: string
          is_paid?: boolean
          milestone_name?: string
          notes?: string | null
          project_id?: string
          sequence_order?: number
          tenant_id?: string
          triggered_at?: string | null
          updated_at?: string
          wing?: string
          part?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedule_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedule_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "payment_schedule_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_reminders: {
        Row: {
          created_at: string
          done_at: string | null
          id: string
          is_done: boolean
          reminder_at: string
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          id?: string
          is_done?: boolean
          reminder_at: string
          tenant_id: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          id?: string
          is_done?: boolean
          reminder_at?: string
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          contribution_pct: number | null
          id: string
          project_id: string
          role_on_project: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          contribution_pct?: number | null
          id?: string
          project_id: string
          role_on_project: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          contribution_pct?: number | null
          id?: string
          project_id?: string
          role_on_project?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_checkpoints: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          completion_percentage: number | null
          created_at: string
          due_date: string
          id: string
          name: string
          project_id: string
          remarks: string | null
          requires_approval: boolean | null
          sequence_order: number
          started_at: string | null
          tenant_id: string
          triggers_payment_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          completion_percentage?: number | null
          created_at?: string
          due_date: string
          id?: string
          name: string
          project_id: string
          remarks?: string | null
          requires_approval?: boolean | null
          sequence_order: number
          started_at?: string | null
          tenant_id: string
          triggers_payment_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          completion_percentage?: number | null
          created_at?: string
          due_date?: string
          id?: string
          name?: string
          project_id?: string
          remarks?: string | null
          requires_approval?: boolean | null
          sequence_order?: number
          started_at?: string | null
          tenant_id?: string
          triggers_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_checkpoints_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_checkpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_triggers_payment_id_fk"
            columns: ["triggers_payment_id"]
            isOneToOne: false
            referencedRelation: "payment_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_triggers_payment_id_fk"
            columns: ["triggers_payment_id"]
            isOneToOne: false
            referencedRelation: "v_payment_status"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      project_table_columns: {
        Row: {
          column_kind: string
          display_order: number
          id: string
          is_required: boolean | null
          name: string
          project_table_id: string
          tenant_id: string
        }
        Insert: {
          column_kind: string
          display_order: number
          id?: string
          is_required?: boolean | null
          name: string
          project_table_id: string
          tenant_id: string
        }
        Update: {
          column_kind?: string
          display_order?: number
          id?: string
          is_required?: boolean | null
          name?: string
          project_table_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_table_columns_project_table_id_fkey"
            columns: ["project_table_id"]
            isOneToOne: false
            referencedRelation: "project_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_table_columns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_table_row_revisions: {
        Row: {
          cells_after: Json | null
          cells_before: Json | null
          change_note: string | null
          changed_at: string
          changed_by: string | null
          id: string
          revision_number: number
          row_id: string
          tenant_id: string
        }
        Insert: {
          cells_after?: Json | null
          cells_before?: Json | null
          change_note?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          revision_number: number
          row_id: string
          tenant_id: string
        }
        Update: {
          cells_after?: Json | null
          cells_before?: Json | null
          change_note?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          revision_number?: number
          row_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_table_row_revisions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_table_row_revisions_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "project_table_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_table_row_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_table_rows: {
        Row: {
          cells: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_order: number
          id: string
          project_table_id: string
          section_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cells?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_order: number
          id?: string
          project_table_id: string
          section_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cells?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_order?: number
          id?: string
          project_table_id?: string
          section_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_table_rows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_table_rows_project_table_id_fkey"
            columns: ["project_table_id"]
            isOneToOne: false
            referencedRelation: "project_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_table_rows_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "project_table_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_table_rows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_table_rows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_table_sections: {
        Row: {
          display_order: number
          id: string
          name: string
          project_table_id: string
          tenant_id: string
        }
        Insert: {
          display_order: number
          id?: string
          name: string
          project_table_id: string
          tenant_id: string
        }
        Update: {
          display_order?: number
          id?: string
          name?: string
          project_table_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_table_sections_project_table_id_fkey"
            columns: ["project_table_id"]
            isOneToOne: false
            referencedRelation: "project_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_table_sections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tables: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          display_order: number
          id: string
          name: string
          project_id: string
          source_preset_id: string | null
          table_owner_role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          name: string
          project_id: string
          source_preset_id?: string | null
          table_owner_role: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          project_id?: string
          source_preset_id?: string | null
          table_owner_role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          budget_total: number | null
          created_at: string
          created_by: string | null
          current_stage: Database["public"]["Enums"]["project_stage"]
          customer_id: string | null
          customer_portal_enabled: boolean | null
          customer_portal_hash: string | null
          customer_portal_hash_generated_at: string | null
          deleted_at: string | null
          drive_folder_url: string | null
          estimated_duration_days: number | null
          estimated_work_hours: number | null
          expected_end_date: string | null
          id: string
          is_placeholder: boolean | null
          name: string
          on_hold_reason: string | null
          project_type: Database["public"]["Enums"]["project_type"] | null
          scope: string
          share_drive_with_customer: boolean | null
          site_geofence_radius_m: number | null
          site_lat: number | null
          site_lng: number | null
          site_location: string | null
          slug: string
          source_payment_preset_id: string | null
          stage_changed_at: string | null
          stage_changed_by: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          whatsapp_group_url: string | null
          design_budget: number | null
          execution_budget: number | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          budget_total?: number | null
          created_at?: string
          created_by?: string | null
          current_stage?: Database["public"]["Enums"]["project_stage"]
          customer_id?: string | null
          customer_portal_enabled?: boolean | null
          customer_portal_hash?: string | null
          customer_portal_hash_generated_at?: string | null
          deleted_at?: string | null
          drive_folder_url?: string | null
          estimated_duration_days?: number | null
          estimated_work_hours?: number | null
          expected_end_date?: string | null
          id?: string
          is_placeholder?: boolean | null
          name: string
          on_hold_reason?: string | null
          project_type?: Database["public"]["Enums"]["project_type"] | null
          scope?: string
          share_drive_with_customer?: boolean | null
          site_geofence_radius_m?: number | null
          site_lat?: number | null
          site_lng?: number | null
          site_location?: string | null
          slug: string
          source_payment_preset_id?: string | null
          stage_changed_at?: string | null
          stage_changed_by?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_group_url?: string | null
          design_budget?: number | null
          execution_budget?: number | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          budget_total?: number | null
          created_at?: string
          created_by?: string | null
          current_stage?: Database["public"]["Enums"]["project_stage"]
          customer_id?: string | null
          customer_portal_enabled?: boolean | null
          customer_portal_hash?: string | null
          customer_portal_hash_generated_at?: string | null
          deleted_at?: string | null
          drive_folder_url?: string | null
          estimated_duration_days?: number | null
          estimated_work_hours?: number | null
          expected_end_date?: string | null
          id?: string
          is_placeholder?: boolean | null
          name?: string
          on_hold_reason?: string | null
          project_type?: Database["public"]["Enums"]["project_type"] | null
          scope?: string
          share_drive_with_customer?: boolean | null
          site_geofence_radius_m?: number | null
          site_lat?: number | null
          site_lng?: number | null
          site_location?: string | null
          slug?: string
          source_payment_preset_id?: string | null
          stage_changed_at?: string | null
          stage_changed_by?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp_group_url?: string | null
          design_budget?: number | null
          execution_budget?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_source_payment_preset_id_fkey"
            columns: ["source_payment_preset_id"]
            isOneToOne: false
            referencedRelation: "payment_milestone_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_stage_changed_by_fkey"
            columns: ["stage_changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      public_abuse_log: {
        Row: {
          detail: Json | null
          id: number
          ip: unknown
          kind: string
          occurred_at: string
          request_id: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          detail?: Json | null
          id?: number
          ip?: unknown
          kind: string
          occurred_at?: string
          request_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          detail?: Json | null
          id?: number
          ip?: unknown
          kind?: string
          occurred_at?: string
          request_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_abuse_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      public_rate_limit_buckets: {
        Row: {
          bucket_start: string
          bucket_window_seconds: number
          first_hit_at: string
          hit_count: number
          id: number
          identifier: string
          kind: string
          last_hit_at: string
          tenant_id: string | null
        }
        Insert: {
          bucket_start: string
          bucket_window_seconds: number
          first_hit_at?: string
          hit_count?: number
          id?: number
          identifier: string
          kind: string
          last_hit_at?: string
          tenant_id?: string | null
        }
        Update: {
          bucket_start?: string
          bucket_window_seconds?: number
          first_hit_at?: string
          hit_count?: number
          id?: number
          identifier?: string
          kind?: string
          last_hit_at?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_rate_limit_buckets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          is_active: boolean
          last_used_at: string | null
          p256dh_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      site_check_ins: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          checked_in_at: string
          checked_out_at: string | null
          duration_minutes: number | null
          geofence_failure_reason: string | null
          gps_lat: number | null
          gps_lng: number | null
          gps_retained_until: string
          id: string
          notes: string | null
          project_id: string
          tenant_id: string
          user_id: string
          within_geofence: boolean
          visible_to_customer: boolean
          customer_note: string | null
          source: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          checked_in_at?: string
          checked_out_at?: string | null
          duration_minutes?: number | null
          geofence_failure_reason?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          gps_retained_until?: string
          id?: string
          notes?: string | null
          project_id: string
          tenant_id: string
          user_id: string
          within_geofence: boolean
          visible_to_customer?: boolean
          customer_note?: string | null
          source?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          checked_in_at?: string
          checked_out_at?: string | null
          duration_minutes?: number | null
          geofence_failure_reason?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          gps_retained_until?: string
          id?: string
          notes?: string | null
          project_id?: string
          tenant_id?: string
          user_id?: string
          within_geofence?: boolean
          visible_to_customer?: boolean
          customer_note?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_check_ins_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_check_ins_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_check_ins_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "site_check_ins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_check_ins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      table_preset_columns: {
        Row: {
          column_kind: string
          display_order: number
          id: string
          is_required: boolean | null
          name: string
          preset_id: string
        }
        Insert: {
          column_kind: string
          display_order: number
          id?: string
          is_required?: boolean | null
          name: string
          preset_id: string
        }
        Update: {
          column_kind?: string
          display_order?: number
          id?: string
          is_required?: boolean | null
          name?: string
          preset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_preset_columns_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "table_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      table_preset_rows: {
        Row: {
          cells: Json
          display_order: number
          id: string
          preset_id: string
          section_id: string | null
        }
        Insert: {
          cells?: Json
          display_order: number
          id?: string
          preset_id: string
          section_id?: string | null
        }
        Update: {
          cells?: Json
          display_order?: number
          id?: string
          preset_id?: string
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_preset_rows_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "table_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_preset_rows_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "table_preset_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      table_preset_sections: {
        Row: {
          display_order: number
          id: string
          name: string
          preset_id: string
        }
        Insert: {
          display_order: number
          id?: string
          name: string
          preset_id: string
        }
        Update: {
          display_order?: number
          id?: string
          name?: string
          preset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_preset_sections_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "table_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      table_presets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default_for_role: boolean | null
          is_system: boolean | null
          name: string
          table_owner_role: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default_for_role?: boolean | null
          is_system?: boolean | null
          name: string
          table_owner_role: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default_for_role?: boolean | null
          is_system?: boolean | null
          name?: string
          table_owner_role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_presets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_daily_tasks: {
        Row: {
          created_at: string
          description: string
          done_at: string | null
          id: string
          is_done: boolean
          project_id: string | null
          task_date: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          done_at?: string | null
          id?: string
          is_done?: boolean
          project_id?: string | null
          task_date?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          done_at?: string | null
          id?: string
          is_done?: boolean
          project_id?: string | null
          task_date?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_daily_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_daily_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "team_daily_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_daily_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_tags: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          tag: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          tag: string
          tenant_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          tag?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_tags_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_performance_monthly: {
        Row: {
          client_rating: number | null
          created_at: string
          deadline_met_pct: number | null
          drawings_completed: number
          errors: number
          id: string
          notes: string | null
          period_month: string
          recorded_by: string | null
          revisions: number
          site_delay_days: number
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_rating?: number | null
          created_at?: string
          deadline_met_pct?: number | null
          drawings_completed?: number
          errors?: number
          id?: string
          notes?: string | null
          period_month: string
          recorded_by?: string | null
          revisions?: number
          site_delay_days?: number
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_rating?: number | null
          created_at?: string
          deadline_met_pct?: number | null
          drawings_completed?: number
          errors?: number
          id?: string
          notes?: string | null
          period_month?: string
          recorded_by?: string | null
          revisions?: number
          site_delay_days?: number
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_performance_monthly_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_performance_monthly_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_performance_monthly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          completed_reminders_visible: boolean
          created_at: string
          gps_retention_days: number
          id: string
          material_excess_threshold_pct: number
          name: string
          office_geofence_radius_m: number
          office_lat: number | null
          office_lng: number | null
          slug: string
          soft_delete_retention_days: number
          updated_at: string
          variance_threshold_pct: number
        }
        Insert: {
          completed_reminders_visible?: boolean
          created_at?: string
          gps_retention_days?: number
          id?: string
          material_excess_threshold_pct?: number
          name: string
          office_geofence_radius_m?: number
          office_lat?: number | null
          office_lng?: number | null
          slug: string
          soft_delete_retention_days?: number
          updated_at?: string
          variance_threshold_pct?: number
        }
        Update: {
          completed_reminders_visible?: boolean
          created_at?: string
          gps_retention_days?: number
          id?: string
          material_excess_threshold_pct?: number
          name?: string
          office_geofence_radius_m?: number
          office_lat?: number | null
          office_lng?: number | null
          slug?: string
          soft_delete_retention_days?: number
          updated_at?: string
          variance_threshold_pct?: number
        }
        Relationships: []
      }
      updates: {
        Row: {
          author_id: string
          author_role_on_project: string
          body: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          project_id: string
          tenant_id: string
          update_type: string
        }
        Insert: {
          author_id: string
          author_role_on_project: string
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          project_id: string
          tenant_id: string
          update_type: string
        }
        Update: {
          author_id?: string
          author_role_on_project?: string
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          project_id?: string
          tenant_id?: string
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "updates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_capabilities: {
        Row: {
          capability: string
          granted: boolean
          granted_at: string
          granted_by: string | null
          id: string
          scope_project_id: string | null
          source: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          capability: string
          granted?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          scope_project_id?: string | null
          source?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          capability?: string
          granted?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          scope_project_id?: string | null
          source?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_capabilities_project"
            columns: ["scope_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_capabilities_project"
            columns: ["scope_project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "user_capabilities_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_capabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_capabilities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          ip_address: unknown
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          experience_years: number | null
          full_name: string
          id: string
          invitation_token_hash: string | null
          is_active: boolean
          last_login_at: string | null
          mfa_enrolled_at: string | null
          password_last_changed_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          role_label: string | null
          salary_inr: number | null
          skill_score: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          experience_years?: number | null
          full_name: string
          id: string
          invitation_token_hash?: string | null
          is_active?: boolean
          last_login_at?: string | null
          mfa_enrolled_at?: string | null
          password_last_changed_at?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          role_label?: string | null
          salary_inr?: number | null
          skill_score?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          experience_years?: number | null
          full_name?: string
          id?: string
          invitation_token_hash?: string | null
          is_active?: boolean
          last_login_at?: string | null
          mfa_enrolled_at?: string | null
          password_last_changed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          role_label?: string | null
          salary_inr?: number | null
          skill_score?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_log: {
        Row: {
          corrects_work_log_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          hours: number
          id: string
          is_corrected: boolean | null
          notes: string | null
          project_id: string
          tenant_id: string
          user_id: string
          worked_on: string
        }
        Insert: {
          corrects_work_log_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          hours: number
          id?: string
          is_corrected?: boolean | null
          notes?: string | null
          project_id: string
          tenant_id: string
          user_id: string
          worked_on?: string
        }
        Update: {
          corrects_work_log_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          hours?: number
          id?: string
          is_corrected?: boolean | null
          notes?: string | null
          project_id?: string
          tenant_id?: string
          user_id?: string
          worked_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_log_corrects_work_log_id_fkey"
            columns: ["corrects_work_log_id"]
            isOneToOne: false
            referencedRelation: "v_work_log_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_corrects_work_log_id_fkey"
            columns: ["corrects_work_log_id"]
            isOneToOne: false
            referencedRelation: "work_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_feedback: {
        Row: {
          checkpoint_id: string | null
          comment: string | null
          customer_id: string
          id: string
          project_id: string
          rating: number
          submitted_at: string
          tenant_id: string
        }
        Insert: {
          checkpoint_id?: string | null
          comment?: string | null
          customer_id: string
          id?: string
          project_id: string
          rating: number
          submitted_at?: string
          tenant_id: string
        }
        Update: {
          checkpoint_id?: string | null
          comment?: string | null
          customer_id?: string
          id?: string
          project_id?: string
          rating?: number
          submitted_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      kpi_settings: {
        Row: {
          delay_penalty: number
          efficiency_multiplier: number
          error_penalty: number
          include_client_rating: boolean
          revision_penalty: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
          weight_client_rating: number
          weight_delivery: number
          weight_efficiency: number
          weight_quality: number
        }
        Insert: {
          delay_penalty?: number
          efficiency_multiplier?: number
          error_penalty?: number
          include_client_rating?: boolean
          revision_penalty?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          weight_client_rating?: number
          weight_delivery?: number
          weight_efficiency?: number
          weight_quality?: number
        }
        Update: {
          delay_penalty?: number
          efficiency_multiplier?: number
          error_penalty?: number
          include_client_rating?: boolean
          revision_penalty?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          weight_client_rating?: number
          weight_delivery?: number
          weight_efficiency?: number
          weight_quality?: number
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          end_date: string
          id: string
          kind: Database["public"]["Enums"]["leave_kind"]
          reason: string
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date: string
          id?: string
          kind?: Database["public"]["Enums"]["leave_kind"]
          reason: string
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          end_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["leave_kind"]
          reason?: string
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_project_categories: {
        Row: {
          created_at: string
          id: string
          project_type: Database["public"]["Enums"]["project_type"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_type: Database["public"]["Enums"]["project_type"]
          tenant_id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_type?: Database["public"]["Enums"]["project_type"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_leave_balance: {
        Row: {
          entitled_days: number | null
          pending_count: number | null
          pending_days: number | null
          remaining_days: number | null
          tenant_id: string | null
          used_days: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_overtime_monthly: {
        Row: {
          days_with_overtime: number | null
          late_days: number | null
          overtime_minutes: number | null
          period_month: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_drawing_role_monthly: {
        Row: {
          checked_count: number | null
          design_count: number | null
          detailing_count: number | null
          period_month: string | null
          technical_count: number | null
          tenant_id: string | null
          total_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_attendance_monthly: {
        Row: {
          avg_minutes_per_day: number | null
          days_present: number | null
          full_name: string | null
          month: string | null
          tenant_id: string | null
          total_minutes: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_checkpoint_progress: {
        Row: {
          approved_at: string | null
          checkpoint_id: string | null
          completed_at: string | null
          completed_items: number | null
          due_date: string | null
          name: string | null
          progress_pct: number | null
          project_id: string | null
          sequence_order: number | null
          started_at: string | null
          tenant_id: string | null
          total_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_checkpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_employee_revenue_contribution: {
        Row: {
          active_project_count: number | null
          full_name: string | null
          period_month: string | null
          revenue_contribution: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_expenses_current: {
        Row: {
          amount: number | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          category: string | null
          corrects_expense_id: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: string | null
          is_corrected: boolean | null
          is_miscellaneous: boolean | null
          linked_checkpoint_id: string | null
          linked_material_consumption_id: string | null
          project_id: string | null
          receipt_url: string | null
          recorded_by: string | null
          rejection_reason: string | null
          spent_on: string | null
          tenant_id: string | null
        }
        Insert: {
          amount?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          corrects_expense_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string | null
          is_corrected?: boolean | null
          is_miscellaneous?: boolean | null
          linked_checkpoint_id?: string | null
          linked_material_consumption_id?: string | null
          project_id?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          rejection_reason?: string | null
          spent_on?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          corrects_expense_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string | null
          is_corrected?: boolean | null
          is_miscellaneous?: boolean | null
          linked_checkpoint_id?: string | null
          linked_material_consumption_id?: string | null
          project_id?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          rejection_reason?: string | null
          spent_on?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_corrects_expense_id_fkey"
            columns: ["corrects_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_corrects_expense_id_fkey"
            columns: ["corrects_expense_id"]
            isOneToOne: false
            referencedRelation: "v_expenses_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_checkpoint_id_fkey"
            columns: ["linked_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "project_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_checkpoint_id_fkey"
            columns: ["linked_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "v_checkpoint_progress"
            referencedColumns: ["checkpoint_id"]
          },
          {
            foreignKeyName: "expenses_linked_checkpoint_id_fkey"
            columns: ["linked_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "v_project_checkpoint_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_material_consumption_id_fkey"
            columns: ["linked_material_consumption_id"]
            isOneToOne: false
            referencedRelation: "material_consumption"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_material_consumption_id_fkey"
            columns: ["linked_material_consumption_id"]
            isOneToOne: false
            referencedRelation: "v_material_consumption_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_kpi_scores: {
        Row: {
          client_rating: number | null
          deadline_met_pct: number | null
          delivery_score: number | null
          drawings_completed: number | null
          client_rating_score: number | null
          efficiency_score: number | null
          errors: number | null
          full_name: string | null
          id: string | null
          notes: string | null
          overall_kpi_score: number | null
          period_month: string | null
          quality_score: number | null
          recorded_by: string | null
          revisions: number | null
          site_delay_days: number | null
          tenant_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_performance_monthly_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_performance_monthly_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_performance_monthly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_material_consumption_current: {
        Row: {
          consumed_on: string | null
          corrects_material_consumption_id: string | null
          created_at: string | null
          deleted_at: string | null
          excess_reason: string | null
          expense_id: string | null
          id: string | null
          is_corrected: boolean | null
          is_excess: boolean | null
          material_name: string | null
          material_plan_id: string | null
          project_id: string | null
          quantity_used: number | null
          recorded_by: string | null
          tenant_id: string | null
          unit: string | null
        }
        Insert: {
          consumed_on?: string | null
          corrects_material_consumption_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          excess_reason?: string | null
          expense_id?: string | null
          id?: string | null
          is_corrected?: boolean | null
          is_excess?: boolean | null
          material_name?: string | null
          material_plan_id?: string | null
          project_id?: string | null
          quantity_used?: number | null
          recorded_by?: string | null
          tenant_id?: string | null
          unit?: string | null
        }
        Update: {
          consumed_on?: string | null
          corrects_material_consumption_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          excess_reason?: string | null
          expense_id?: string | null
          id?: string | null
          is_corrected?: boolean | null
          is_excess?: boolean | null
          material_name?: string | null
          material_plan_id?: string | null
          project_id?: string | null
          quantity_used?: number | null
          recorded_by?: string | null
          tenant_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_mat_consumption_expense"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mat_consumption_expense"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "v_expenses_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_corrects_material_consumption_id_fkey"
            columns: ["corrects_material_consumption_id"]
            isOneToOne: false
            referencedRelation: "material_consumption"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_corrects_material_consumption_id_fkey"
            columns: ["corrects_material_consumption_id"]
            isOneToOne: false
            referencedRelation: "v_material_consumption_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_material_plan_id_fkey"
            columns: ["material_plan_id"]
            isOneToOne: false
            referencedRelation: "material_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "material_consumption_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_payment_status: {
        Row: {
          amount_due: number | null
          amount_received: number | null
          created_at: string | null
          deleted_at: string | null
          due_date: string | null
          is_paid: boolean | null
          milestone_name: string | null
          notes: string | null
          project_id: string | null
          schedule_id: string | null
          sequence_order: number | null
          tenant_id: string | null
          triggered_at: string | null
          updated_at: string | null
          variance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedule_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedule_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "payment_schedule_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_project_checkpoint_status: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          name: string | null
          project_id: string | null
          requires_approval: boolean | null
          sequence_order: number | null
          started_at: string | null
          status: string | null
          tenant_id: string | null
          triggers_payment_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          name?: string | null
          project_id?: string | null
          requires_approval?: boolean | null
          sequence_order?: number | null
          started_at?: string | null
          status?: never
          tenant_id?: string | null
          triggers_payment_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          name?: string | null
          project_id?: string | null
          requires_approval?: boolean | null
          sequence_order?: number | null
          started_at?: string | null
          status?: never
          tenant_id?: string | null
          triggers_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_checkpoints_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_checkpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_triggers_payment_id_fk"
            columns: ["triggers_payment_id"]
            isOneToOne: false
            referencedRelation: "payment_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checkpoints_triggers_payment_id_fk"
            columns: ["triggers_payment_id"]
            isOneToOne: false
            referencedRelation: "v_payment_status"
            referencedColumns: ["schedule_id"]
          },
        ]
      }
      v_project_variance: {
        Row: {
          actual_duration_days: number | null
          actual_hours: number | null
          estimated_duration_days: number | null
          estimated_work_hours: number | null
          hours_variance_pct: number | null
          project_id: string | null
          tenant_id: string | null
        }
        Insert: {
          actual_duration_days?: never
          actual_hours?: never
          estimated_duration_days?: number | null
          estimated_work_hours?: number | null
          hours_variance_pct?: never
          project_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          actual_duration_days?: never
          actual_hours?: never
          estimated_duration_days?: number | null
          estimated_work_hours?: number | null
          hours_variance_pct?: never
          project_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_work_log_current: {
        Row: {
          corrects_work_log_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          hours: number | null
          id: string | null
          is_corrected: boolean | null
          notes: string | null
          project_id: string | null
          tenant_id: string | null
          user_id: string | null
          worked_on: string | null
        }
        Insert: {
          corrects_work_log_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          hours?: number | null
          id?: string | null
          is_corrected?: boolean | null
          notes?: string | null
          project_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
          worked_on?: string | null
        }
        Update: {
          corrects_work_log_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          hours?: number | null
          id?: string | null
          is_corrected?: boolean | null
          notes?: string | null
          project_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
          worked_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_log_corrects_work_log_id_fkey"
            columns: ["corrects_work_log_id"]
            isOneToOne: false
            referencedRelation: "v_work_log_current"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_corrects_work_log_id_fkey"
            columns: ["corrects_work_log_id"]
            isOneToOne: false
            referencedRelation: "work_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_variance"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_checkpoint_template: {
        Args: {
          p_project_id: string
          p_start_date?: string
          p_template_id: string
        }
        Returns: undefined
      }
      reorder_payment_milestone: {
        Args: {
          p_project_id: string
          p_schedule_id: string
          p_wing: string
          p_part: string
          p_target_index: number
        }
        Returns: undefined
      }
      resequence_payment_schedule: {
        Args: {
          p_project_id: string
        }
        Returns: undefined
      }
      insert_payment_milestone_at: {
        Args: {
          p_project_id: string
          p_wing: string
          p_part: string
          p_after_order: number
          p_milestone_name: string
          p_amount_due: number
          p_due_date: string
          p_notes?: string | null
        }
        Returns: string
      }
      edit_chat_message: {
        Args: {
          p_message_id: string
          p_body: string
        }
        Returns: {
          id: string
          body: string
          edited_at: string
        }[]
      }
      apply_table_preset: {
        Args: {
          p_created_by?: string
          p_preset_id: string
          p_project_id: string
        }
        Returns: string
      }
      check_auth_rate_limit: {
        Args: {
          p_kind: string
          p_identifier: string
          p_limit: number
          p_window_seconds: number
          p_ip?: string | null
          p_user_agent?: string | null
          p_request_id?: string | null
        }
        Returns: boolean
      }
      chat_unread_counts: {
        Args: never
        Returns: {
          conversation_id: string
          kind: string
          last_message_at: string | null
          peer_id: string | null
          preview: string | null
          project_id: string | null
          title: string | null
          unread: number
        }[]
      }
      clear_bridge_notification: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      clear_chat_notification: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      open_dm: {
        Args: { p_peer: string }
        Returns: string
      }
      compact_old_notifications: { Args: never; Returns: undefined }
      current_user_tenant_id: { Args: never; Returns: string }
      delete_table_column: {
        Args: { p_column_id: string; p_table_id: string }
        Returns: undefined
      }
      emit_notification: {
        Args: {
          p_body?: string
          p_dedupe_key?: string
          p_kind: string
          p_severity: Database["public"]["Enums"]["notification_severity"]
          p_source_id?: string
          p_source_type: string
          p_tenant_id: string
          p_title: string
          p_user_ids?: string[]
        }
        Returns: string
      }
      emit_site_checkin_notification: {
        Args: {
          p_checkin_id: string
          p_project_id: string
          p_user_id: string
          p_within_geofence: boolean
        }
        Returns: undefined
      }
      generate_personal_reminder_notifications: {
        Args: never
        Returns: undefined
      }
      get_customer_portal: {
        Args: {
          p_hash: string
          p_ip?: unknown
          p_request_id?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      get_customer_portal_summary: {
        Args: {
          p_hash: string
          p_ip?: unknown
          p_request_id?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      has_capability: {
        Args: { p_capability: string; p_project_id?: string }
        Returns: boolean
      }
      has_member_tag: { Args: { p_tag: string }; Returns: boolean }
      resolve_office_at: {
        Args: { p_tenant_id: string; p_lat: number; p_lng: number }
        Returns: string
      }
      is_assigned_to_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      project_in_stage: {
        Args: {
          p_project_id: string
          p_stage: Database["public"]["Enums"]["project_stage"]
        }
        Returns: boolean
      }
      prune_audit_log_to_cap: { Args: never; Returns: undefined }
      public_rate_limit_hit: {
        Args: {
          p_identifier: string
          p_kind: string
          p_tenant_id: string
          p_window_seconds: number
        }
        Returns: number
      }
      shift_table_columns_after: {
        Args: { p_after_order: number; p_table_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_project_table: {
        Args: { p_project_id: string; p_table_id: string }
        Returns: string
      }
      submit_public_enquiry: {
        Args: {
          p_email: string
          p_intake_slug: string
          p_ip: unknown
          p_message: string
          p_name: string
          p_phone_display: string
          p_phone_normalized?: string
          p_referrer_url: string
          p_request_id?: string
          p_source?: string
          p_user_agent?: string
        }
        Returns: string
      }
      tag_capability_set: { Args: { p_tag: string }; Returns: string[] }
    }
    Enums: {
      app_role: "owner" | "team_member" | "site_engineer"
      drawing_role: "design" | "detailing" | "technical" | "checked"
      leave_kind: "casual" | "sick" | "earned" | "unpaid" | "comp_off"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      notification_severity: "info" | "warning" | "critical"
      project_stage: "design" | "execution"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      project_type:
        | "residential"
        | "commercial"
        | "institutional"
        | "industrial"
        | "interior"
        | "landscape"
        | "other"
        | "urban"
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
      app_role: ["owner", "team_member", "site_engineer"],
      notification_severity: ["info", "warning", "critical"],
      project_stage: ["design", "execution"],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      project_type: [
        "residential",
        "commercial",
        "institutional",
        "industrial",
        "interior",
        "landscape",
        "other",
        "urban",
      ],
    },
  },
} as const
