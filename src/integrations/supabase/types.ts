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
      _backup_financeiro_master_20260729: {
        Row: {
          dado: Json | null
          origem: string | null
        }
        Insert: {
          dado?: Json | null
          origem?: string | null
        }
        Update: {
          dado?: Json | null
          origem?: string | null
        }
        Relationships: []
      }
      agenda_preferences: {
        Row: {
          active: boolean
          blocks_booking: boolean
          city: string | null
          color: string
          created_at: string
          doctor_id: string | null
          end_time: string
          id: string
          kind: string
          label: string
          monthly_day: number | null
          notes: string | null
          organization_id: string
          recurrence: string
          recurrence_end_date: string | null
          recurrence_start_date: string | null
          renter_id: string | null
          room_id: string | null
          sort_order: number
          specific_date: string | null
          start_time: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          active?: boolean
          blocks_booking?: boolean
          city?: string | null
          color?: string
          created_at?: string
          doctor_id?: string | null
          end_time: string
          id?: string
          kind?: string
          label: string
          monthly_day?: number | null
          notes?: string | null
          organization_id?: string
          recurrence?: string
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
          renter_id?: string | null
          room_id?: string | null
          sort_order?: number
          specific_date?: string | null
          start_time: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          active?: boolean
          blocks_booking?: boolean
          city?: string | null
          color?: string
          created_at?: string
          doctor_id?: string | null
          end_time?: string
          id?: string
          kind?: string
          label?: string
          monthly_day?: number | null
          notes?: string | null
          organization_id?: string
          recurrence?: string
          recurrence_end_date?: string | null
          recurrence_start_date?: string | null
          renter_id?: string | null
          room_id?: string | null
          sort_order?: number
          specific_date?: string | null
          start_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "agenda_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_configs: {
        Row: {
          agent_name: string | null
          agent_role: string | null
          auto_process_payments: boolean | null
          base_prompt: string | null
          business_name: string | null
          business_type: string | null
          created_at: string | null
          enable_intent_analysis: boolean | null
          enable_ocr: boolean | null
          id: string
          instance_id: string
          is_active: boolean | null
          memory_prompt: string | null
          ocr_receipts_expense_contacts: boolean
          ocr_receipts_expense_groups: boolean
          ocr_receipts_income_contacts: boolean
          ocr_receipts_income_groups: boolean
          operation_mode: string | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_role?: string | null
          auto_process_payments?: boolean | null
          base_prompt?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string | null
          enable_intent_analysis?: boolean | null
          enable_ocr?: boolean | null
          id?: string
          instance_id: string
          is_active?: boolean | null
          memory_prompt?: string | null
          ocr_receipts_expense_contacts?: boolean
          ocr_receipts_expense_groups?: boolean
          ocr_receipts_income_contacts?: boolean
          ocr_receipts_income_groups?: boolean
          operation_mode?: string | null
          organization_id?: string
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_role?: string | null
          auto_process_payments?: boolean | null
          base_prompt?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string | null
          enable_intent_analysis?: boolean | null
          enable_ocr?: boolean | null
          id?: string
          instance_id?: string
          is_active?: boolean | null
          memory_prompt?: string | null
          ocr_receipts_expense_contacts?: boolean
          ocr_receipts_expense_groups?: boolean
          ocr_receipts_income_contacts?: boolean
          ocr_receipts_income_groups?: boolean
          operation_mode?: string | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_settings: {
        Row: {
          auto_classify: boolean
          auto_ocr: boolean
          auto_reply: boolean
          enabled: boolean
          extra_prompt: string | null
          max_replies_per_conversation: number
          model: string
          ocr_create_financial_pending: boolean
          ocr_min_confidence: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          auto_classify?: boolean
          auto_ocr?: boolean
          auto_reply?: boolean
          enabled?: boolean
          extra_prompt?: string | null
          max_replies_per_conversation?: number
          model?: string
          ocr_create_financial_pending?: boolean
          ocr_min_confidence?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          auto_classify?: boolean
          auto_ocr?: boolean
          auto_reply?: boolean
          enabled?: boolean
          extra_prompt?: string | null
          max_replies_per_conversation?: number
          model?: string
          ocr_create_financial_pending?: boolean
          ocr_min_confidence?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_base: {
        Row: {
          category: string
          config_id: string | null
          content: string | null
          created_at: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          config_id?: string | null
          content?: string | null
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          config_id?: string | null
          content?: string | null
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_base_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_base_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_legal_documents: {
        Row: {
          config_id: string | null
          created_at: string | null
          description: string | null
          document_type: string | null
          file_url: string | null
          id: string
          organization_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          config_id?: string | null
          created_at?: string | null
          description?: string | null
          document_type?: string | null
          file_url?: string | null
          id?: string
          organization_id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          config_id?: string | null
          created_at?: string | null
          description?: string | null
          document_type?: string | null
          file_url?: string | null
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_legal_documents_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_legal_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_procedures: {
        Row: {
          category: string | null
          config_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_visible_to_client: boolean | null
          name: string
          organization_id: string
          price: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          config_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_visible_to_client?: boolean | null
          name: string
          organization_id?: string
          price?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          config_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_visible_to_client?: boolean | null
          name?: string
          organization_id?: string
          price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_procedures_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_procedures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_processing_logs: {
        Row: {
          confidence_score: number | null
          contact_number: string | null
          content_type: string
          created_at: string | null
          extracted_data: Json | null
          id: string
          input_data: string | null
          message_id: string | null
          status: string | null
        }
        Insert: {
          confidence_score?: number | null
          contact_number?: string | null
          content_type: string
          created_at?: string | null
          extracted_data?: Json | null
          id?: string
          input_data?: string | null
          message_id?: string | null
          status?: string | null
        }
        Update: {
          confidence_score?: number | null
          contact_number?: string | null
          content_type?: string
          created_at?: string | null
          extracted_data?: Json | null
          id?: string
          input_data?: string | null
          message_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      ai_profiles: {
        Row: {
          base_prompt: string | null
          created_at: string
          id: string
          installation_id: string | null
          is_active: boolean
          name: string
          organization_id: string
          restrictions: string | null
          tone: string | null
          updated_at: string
          version: number
        }
        Insert: {
          base_prompt?: string | null
          created_at?: string
          id?: string
          installation_id?: string | null
          is_active?: boolean
          name: string
          organization_id: string
          restrictions?: string | null
          tone?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          base_prompt?: string | null
          created_at?: string
          id?: string
          installation_id?: string | null
          is_active?: boolean
          name?: string
          organization_id?: string
          restrictions?: string | null
          tone?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_profiles_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "crm_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_quick_responses: {
        Row: {
          category: string | null
          config_id: string | null
          content: string
          created_at: string | null
          id: string
          organization_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          config_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          organization_id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          config_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_quick_responses_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_quick_responses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recall_templates: {
        Row: {
          category: string | null
          config_id: string | null
          created_at: string | null
          days_after_procedure: number | null
          description: string | null
          id: string
          is_active: boolean | null
          message_template: string
          name: string
          organization_id: string
          rules: Json | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          config_id?: string | null
          created_at?: string | null
          days_after_procedure?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          message_template: string
          name: string
          organization_id?: string
          rules?: Json | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          config_id?: string | null
          created_at?: string | null
          days_after_procedure?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          message_template?: string
          name?: string
          organization_id?: string
          rules?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_recall_templates_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recall_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          approved_by: string | null
          conversation_id: string | null
          created_at: string
          id: string
          input: Json | null
          kind: string
          model: string | null
          organization_id: string
          output: string | null
          used: boolean
        }
        Insert: {
          approved_by?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          input?: Json | null
          kind: string
          model?: string | null
          organization_id: string
          output?: string | null
          used?: boolean
        }
        Update: {
          approved_by?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          input?: Json | null
          kind?: string
          model?: string | null
          organization_id?: string
          output?: string | null
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_modules: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          name: string
          status: string
          updated_at: string | null
          visibility: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          name: string
          status?: string
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          name?: string
          status?: string
          updated_at?: string | null
          visibility?: string
        }
        Relationships: []
      }
      app_versions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          released_at: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          released_at?: string | null
          version: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          released_at?: string | null
          version?: string
        }
        Relationships: []
      }
      appointment_statuses: {
        Row: {
          active: boolean | null
          color: string
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          color: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          organization_id?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          color?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          allows_booking: boolean
          appointment_color: string | null
          city: string | null
          confirmation_requested_at: string | null
          created_at: string
          doctor_id: string
          duration_minutes: number | null
          id: string
          kind: string
          notes: string | null
          organization_id: string
          patient_id: string | null
          pend_cobranca: boolean
          pend_documentacao: boolean
          pend_valor: boolean
          price: number | null
          procedure_id: string | null
          procedure_text: string | null
          quantity: number
          room_id: string | null
          scheduled_at: string
          status: string | null
          tipo_consulta: string | null
          title: string | null
          updated_at: string
          valor_cobrar: number
          whatsapp_confirmed: boolean | null
        }
        Insert: {
          allows_booking?: boolean
          appointment_color?: string | null
          city?: string | null
          confirmation_requested_at?: string | null
          created_at?: string
          doctor_id: string
          duration_minutes?: number | null
          id?: string
          kind?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string | null
          pend_cobranca?: boolean
          pend_documentacao?: boolean
          pend_valor?: boolean
          price?: number | null
          procedure_id?: string | null
          procedure_text?: string | null
          quantity?: number
          room_id?: string | null
          scheduled_at: string
          status?: string | null
          tipo_consulta?: string | null
          title?: string | null
          updated_at?: string
          valor_cobrar?: number
          whatsapp_confirmed?: boolean | null
        }
        Update: {
          allows_booking?: boolean
          appointment_color?: string | null
          city?: string | null
          confirmation_requested_at?: string | null
          created_at?: string
          doctor_id?: string
          duration_minutes?: number | null
          id?: string
          kind?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string | null
          pend_cobranca?: boolean
          pend_documentacao?: boolean
          pend_valor?: boolean
          price?: number | null
          procedure_id?: string | null
          procedure_text?: string | null
          quantity?: number
          room_id?: string | null
          scheduled_at?: string
          status?: string | null
          tipo_consulta?: string | null
          title?: string | null
          updated_at?: string
          valor_cobrar?: number
          whatsapp_confirmed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          module: string | null
          new_value: Json | null
          previous_value: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string | null
          new_value?: Json | null
          previous_value?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      automation_executions: {
        Row: {
          created_at: string
          direction: string | null
          event_id: string | null
          id: string
          organization_id: string | null
          request: Json | null
          response: Json | null
          status: string | null
          workflow: string | null
        }
        Insert: {
          created_at?: string
          direction?: string | null
          event_id?: string | null
          id?: string
          organization_id?: string | null
          request?: Json | null
          response?: Json | null
          status?: string | null
          workflow?: string | null
        }
        Update: {
          created_at?: string
          direction?: string | null
          event_id?: string | null
          id?: string
          organization_id?: string | null
          request?: Json | null
          response?: Json | null
          status?: string | null
          workflow?: string | null
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          automation_id: string | null
          chat_id: string | null
          error: string | null
          executed_at: string
          id: string
          organization_id: string | null
          status: string
        }
        Insert: {
          automation_id?: string | null
          chat_id?: string | null
          error?: string | null
          executed_at?: string
          id?: string
          organization_id?: string | null
          status: string
        }
        Update: {
          automation_id?: string | null
          chat_id?: string | null
          error?: string | null
          executed_at?: string
          id?: string
          organization_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          active: boolean
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string | null
          trigger: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id?: string | null
          trigger: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          active?: boolean
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      budget_files: {
        Row: {
          budget_id: string
          created_at: string
          file_name: string | null
          file_url: string
          id: string
          obs: string | null
          organization_id: string
        }
        Insert: {
          budget_id: string
          created_at?: string
          file_name?: string | null
          file_url: string
          id?: string
          obs?: string | null
          organization_id?: string
        }
        Update: {
          budget_id?: string
          created_at?: string
          file_name?: string | null
          file_url?: string
          id?: string
          obs?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_files_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          budget_id: string
          created_at: string
          dente: number | null
          faces: string[]
          id: string
          notes: string | null
          ordem: number
          organization_id: string
          procedure_id: string | null
          procedure_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          budget_id: string
          created_at?: string
          dente?: number | null
          faces?: string[]
          id?: string
          notes?: string | null
          ordem?: number
          organization_id?: string
          procedure_id?: string | null
          procedure_name: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          budget_id?: string
          created_at?: string
          dente?: number | null
          faces?: string[]
          id?: string
          notes?: string | null
          ordem?: number
          organization_id?: string
          procedure_id?: string | null
          procedure_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_budget_organization_fkey"
            columns: ["budget_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "budget_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          budget_date: string | null
          cidade: string | null
          created_at: string
          devolutiva_contato: string | null
          down_payment: number | null
          external_id: string | null
          id: string
          installment_value: number | null
          installments: number | null
          notes: string | null
          organization_id: string
          patient_id: string
          pdf_url: string | null
          procedimento: string | null
          procedure_id: string | null
          proposta_paciente: number | null
          proposta_vert: number | null
          recall_date: string | null
          recall_notes: string | null
          recall_programado: string | null
          status: Database["public"]["Enums"]["budget_status"] | null
          telefone_paciente: string | null
          total_value: number
          treatment_plan_id: string | null
          ultimo_contato: string | null
          updated_at: string
          valid_until: string | null
          vendedor: string | null
        }
        Insert: {
          budget_date?: string | null
          cidade?: string | null
          created_at?: string
          devolutiva_contato?: string | null
          down_payment?: number | null
          external_id?: string | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          notes?: string | null
          organization_id?: string
          patient_id: string
          pdf_url?: string | null
          procedimento?: string | null
          procedure_id?: string | null
          proposta_paciente?: number | null
          proposta_vert?: number | null
          recall_date?: string | null
          recall_notes?: string | null
          recall_programado?: string | null
          status?: Database["public"]["Enums"]["budget_status"] | null
          telefone_paciente?: string | null
          total_value?: number
          treatment_plan_id?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          valid_until?: string | null
          vendedor?: string | null
        }
        Update: {
          budget_date?: string | null
          cidade?: string | null
          created_at?: string
          devolutiva_contato?: string | null
          down_payment?: number | null
          external_id?: string | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          notes?: string | null
          organization_id?: string
          patient_id?: string
          pdf_url?: string | null
          procedimento?: string | null
          procedure_id?: string | null
          proposta_paciente?: number | null
          proposta_vert?: number | null
          recall_date?: string | null
          recall_notes?: string | null
          recall_programado?: string | null
          status?: Database["public"]["Enums"]["budget_status"] | null
          telefone_paciente?: string | null
          total_value?: number
          treatment_plan_id?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          valid_until?: string | null
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string | null
          organization_id: string
          status: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          organization_id: string
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          installation_id: string | null
          message_template: string
          name: string
          organization_id: string
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          installation_id?: string | null
          message_template: string
          name: string
          organization_id: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          installation_id?: string | null
          message_template?: string
          name?: string
          organization_id?: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "crm_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clara_memories: {
        Row: {
          category: string | null
          config_id: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean | null
          organization_id: string
          source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          config_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string
          source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          config_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string
          source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clara_memories_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clara_memories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          organization_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          organization_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          organization_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignee_id: string | null
          conversation_id: string
          id: string
          organization_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_id?: string | null
          conversation_id: string
          id?: string
          organization_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_id?: string | null
          conversation_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_mode: string
          assignee_id: string | null
          away_sent_at: string | null
          connection_id: string | null
          contact_id: string
          created_at: string
          greeted_at: string | null
          id: string
          installation_id: string | null
          interest_procedure_id: string | null
          is_new_lead: boolean
          last_message_at: string | null
          last_message_preview: string | null
          organization_id: string
          priority: string | null
          routing_sector: string | null
          status: string
          unit_id: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          ai_mode?: string
          assignee_id?: string | null
          away_sent_at?: string | null
          connection_id?: string | null
          contact_id: string
          created_at?: string
          greeted_at?: string | null
          id?: string
          installation_id?: string | null
          interest_procedure_id?: string | null
          is_new_lead?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          organization_id: string
          priority?: string | null
          routing_sector?: string | null
          status?: string
          unit_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          ai_mode?: string
          assignee_id?: string | null
          away_sent_at?: string | null
          connection_id?: string | null
          contact_id?: string
          created_at?: string
          greeted_at?: string | null
          id?: string
          installation_id?: string | null
          interest_procedure_id?: string | null
          is_new_lead?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          organization_id?: string
          priority?: string | null
          routing_sector?: string | null
          status?: string
          unit_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "crm_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_interest_procedure_id_fkey"
            columns: ["interest_procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_auto_messages: {
        Row: {
          away_enabled: boolean
          away_text: string
          business_hours: Json
          greeting_enabled: boolean
          greeting_text: string
          organization_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          away_enabled?: boolean
          away_text?: string
          business_hours?: Json
          greeting_enabled?: boolean
          greeting_text?: string
          organization_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          away_enabled?: boolean
          away_text?: string
          business_hours?: Json
          greeting_enabled?: boolean
          greeting_text?: string
          organization_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_auto_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          avatar_source_key: string | null
          avatar_synced_at: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          installation_id: string | null
          is_lead: boolean
          name: string | null
          opt_out: boolean
          organization_id: string
          patient_id: string | null
          phone: string | null
          phone_normalized: string | null
          unit_id: string | null
          updated_at: string
          wa_jid: string | null
        }
        Insert: {
          avatar_source_key?: string | null
          avatar_synced_at?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          installation_id?: string | null
          is_lead?: boolean
          name?: string | null
          opt_out?: boolean
          organization_id: string
          patient_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          unit_id?: string | null
          updated_at?: string
          wa_jid?: string | null
        }
        Update: {
          avatar_source_key?: string | null
          avatar_synced_at?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          installation_id?: string | null
          is_lead?: boolean
          name?: string | null
          opt_out?: boolean
          organization_id?: string
          patient_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          unit_id?: string | null
          updated_at?: string
          wa_jid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "crm_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_installations: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          key: string
          manifest: Json
          name: string
          organization_id: string
          status: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          key: string
          manifest?: Json
          name: string
          organization_id: string
          status?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          key?: string
          manifest?: Json
          name?: string
          organization_id?: string
          status?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_installations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_installations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_keepalive_state: {
        Row: {
          guardian_secret: string | null
          id: number
          last_docker_restart_at: string | null
          last_ok_at: string | null
          last_restart_at: string | null
          last_state: string | null
          req_id: number | null
          updated_at: string
        }
        Insert: {
          guardian_secret?: string | null
          id?: number
          last_docker_restart_at?: string | null
          last_ok_at?: string | null
          last_restart_at?: string | null
          last_state?: string | null
          req_id?: number | null
          updated_at?: string
        }
        Update: {
          guardian_secret?: string | null
          id?: number
          last_docker_restart_at?: string | null
          last_ok_at?: string | null
          last_restart_at?: string | null
          last_state?: string | null
          req_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          budget_id: string | null
          consent: boolean
          contact_id: string | null
          created_at: string
          estimated_value: number | null
          id: string
          interest_procedure_id: string | null
          main_objection: string | null
          organization_id: string
          patient_id: string | null
          source: string | null
          status: string
          temperature: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          budget_id?: string | null
          consent?: boolean
          contact_id?: string | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          interest_procedure_id?: string | null
          main_objection?: string | null
          organization_id: string
          patient_id?: string | null
          source?: string | null
          status?: string
          temperature?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          budget_id?: string | null
          consent?: boolean
          contact_id?: string | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          interest_procedure_id?: string | null
          main_objection?: string | null
          organization_id?: string
          patient_id?: string | null
          source?: string | null
          status?: string
          temperature?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_interest_procedure_id_fkey"
            columns: ["interest_procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_members: {
        Row: {
          active: boolean
          created_at: string | null
          id: string
          organization_id: string
          permissions: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          id?: string
          organization_id: string
          permissions?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          id?: string
          organization_id?: string
          permissions?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      crm_receipt_entries: {
        Row: {
          amount: number | null
          confidence: number | null
          contact_id: string
          conversation_id: string
          created_at: string
          financial_entry_id: string | null
          id: string
          institution: string | null
          message_id: string | null
          mime_type: string
          organization_id: string
          paid_at: string | null
          patient_id: string | null
          payer: string | null
          payment_method: string | null
          provider_message_id: string
          raw_ocr: Json
          reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          confidence?: number | null
          contact_id: string
          conversation_id: string
          created_at?: string
          financial_entry_id?: string | null
          id?: string
          institution?: string | null
          message_id?: string | null
          mime_type: string
          organization_id: string
          paid_at?: string | null
          patient_id?: string | null
          payer?: string | null
          payment_method?: string | null
          provider_message_id: string
          raw_ocr?: Json
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          confidence?: number | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          financial_entry_id?: string | null
          id?: string
          institution?: string | null
          message_id?: string | null
          mime_type?: string
          organization_id?: string
          paid_at?: string | null
          patient_id?: string | null
          payer?: string | null
          payment_method?: string | null
          provider_message_id?: string
          raw_ocr?: Json
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_receipt_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_receipt_entries_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_receipt_entries_financial_entry_id_fkey"
            columns: ["financial_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_receipt_entries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_receipt_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_receipt_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      dental: {
        Row: {
          active: boolean | null
          address: string | null
          cnpj: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dental_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          active: boolean | null
          avatar_url: string | null
          color: string | null
          commission_percent: number | null
          created_at: string
          cro: string | null
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          schedulable: boolean
          specialty: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          avatar_url?: string | null
          color?: string | null
          commission_percent?: number | null
          created_at?: string
          cro?: string | null
          email?: string | null
          id?: string
          name: string
          organization_id?: string
          phone?: string | null
          schedulable?: boolean
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          avatar_url?: string | null
          color?: string | null
          commission_percent?: number | null
          created_at?: string
          cro?: string | null
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          schedulable?: boolean
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          active: boolean
          clara_memory_id: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          learned_at: string | null
          margins: Json
          name: string
          organization_id: string
          pdf_path: string | null
          questions: Json
          source_type: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          clara_memory_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          learned_at?: string | null
          margins?: Json
          name: string
          organization_id?: string
          pdf_path?: string | null
          questions?: Json
          source_type?: string
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          clara_memory_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          learned_at?: string | null
          margins?: Json
          name?: string
          organization_id?: string
          pdf_path?: string | null
          questions?: Json
          source_type?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          dispatched_at: string | null
          event_type: string
          event_version: number
          id: string
          organization_id: string
          payload: Json | null
          status: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          dispatched_at?: string | null
          event_type: string
          event_version?: number
          id?: string
          organization_id: string
          payload?: Json | null
          status?: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          dispatched_at?: string | null
          event_type?: string
          event_version?: number
          id?: string
          organization_id?: string
          payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          created_at: string
          developer_note: string | null
          error_message: string
          error_stack: string | null
          id: string
          page_url: string | null
          resolved_at: string | null
          severity: string
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          developer_note?: string | null
          error_message: string
          error_stack?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          developer_note?: string | null
          error_message?: string
          error_stack?: string | null
          id?: string
          page_url?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      exams: {
        Row: {
          consulta: string | null
          created_at: string
          exam_date: string | null
          exam_type: string
          file_url: string | null
          id: string
          notes: string | null
          organization_id: string
          patient_id: string
          status: string | null
          title: string
          treatment_plan_id: string | null
        }
        Insert: {
          consulta?: string | null
          created_at?: string
          exam_date?: string | null
          exam_type: string
          file_url?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          patient_id: string
          status?: string | null
          title: string
          treatment_plan_id?: string | null
        }
        Update: {
          consulta?: string | null
          created_at?: string
          exam_date?: string | null
          exam_type?: string
          file_url?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string
          status?: string | null
          title?: string
          treatment_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          label: string
          roles: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          label: string
          roles?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          label?: string
          roles?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          amount: number
          appointment_id: string | null
          category: string
          cidade: string | null
          created_at: string
          dentista: string | null
          description: string
          doctor_id: string | null
          entry_date: string
          external_id: string | null
          id: string
          installment_number: number | null
          installments: number | null
          nf_emitida: boolean | null
          nf_url: string | null
          notes: string | null
          organization_id: string
          paciente_nome: string | null
          patient_id: string | null
          payment_method: string | null
          receipt_url: string | null
          vendedor: string | null
        }
        Insert: {
          amount?: number
          appointment_id?: string | null
          category: string
          cidade?: string | null
          created_at?: string
          dentista?: string | null
          description: string
          doctor_id?: string | null
          entry_date?: string
          external_id?: string | null
          id?: string
          installment_number?: number | null
          installments?: number | null
          nf_emitida?: boolean | null
          nf_url?: string | null
          notes?: string | null
          organization_id?: string
          paciente_nome?: string | null
          patient_id?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          vendedor?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          category?: string
          cidade?: string | null
          created_at?: string
          dentista?: string | null
          description?: string
          doctor_id?: string | null
          entry_date?: string
          external_id?: string | null
          id?: string
          installment_number?: number | null
          installments?: number | null
          nf_emitida?: boolean | null
          nf_url?: string | null
          notes?: string | null
          organization_id?: string
          paciente_nome?: string | null
          patient_id?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_entries_dedup_audit: {
        Row: {
          created_at: string
          details: Json | null
          duplicates_removed: number
          groups_found: number
          id: string
          organization_id: string
          run_at: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          duplicates_removed?: number
          groups_found?: number
          id?: string
          organization_id?: string
          run_at?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          duplicates_removed?: number
          groups_found?: number
          id?: string
          organization_id?: string
          run_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_dedup_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_expenses: {
        Row: {
          amount: number
          category: string
          cost_center: string | null
          created_at: string
          description: string
          due_date: string | null
          expense_date: string
          external_id: string | null
          id: string
          installment_number: number | null
          installments: number | null
          notes: string | null
          organization_id: string
          paid_amount: number | null
          paid_at: string | null
          payment_link: string | null
          payment_method: string | null
          receipt_url: string | null
          recurrence_end_date: string | null
          recurrence_group_id: string | null
          recurrence_skip_dates: string[] | null
          recurrence_type: string | null
          supplier_id: string | null
        }
        Insert: {
          amount?: number
          category: string
          cost_center?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          expense_date?: string
          external_id?: string | null
          id?: string
          installment_number?: number | null
          installments?: number | null
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_link?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recurrence_end_date?: string | null
          recurrence_group_id?: string | null
          recurrence_skip_dates?: string[] | null
          recurrence_type?: string | null
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          cost_center?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          expense_date?: string
          external_id?: string | null
          id?: string
          installment_number?: number | null
          installments?: number | null
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_link?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recurrence_end_date?: string | null
          recurrence_group_id?: string | null
          recurrence_skip_dates?: string[] | null
          recurrence_type?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          due_at: string
          id: string
          note: string | null
          organization_id: string
          status: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          due_at: string
          id?: string
          note?: string | null
          organization_id: string
          status?: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "followups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          active: boolean | null
          created_at: string | null
          date: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          date: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          date?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inbox_itens: {
        Row: {
          created_at: string
          descricao: string
          id: string
          organization_id: string
          prioridade: string
          quantidade: number
          responsavel: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          organization_id?: string
          prioridade?: string
          quantidade?: number
          responsavel?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          organization_id?: string
          prioridade?: string
          quantidade?: number
          responsavel?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_itens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_registry: {
        Row: {
          created_at: string
          description: string | null
          id: string
          last_test_result: string | null
          last_tested_at: string | null
          name: string
          secret_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          last_test_result?: string | null
          last_tested_at?: string | null
          name: string
          secret_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          last_test_result?: string | null
          last_tested_at?: string | null
          name?: string
          secret_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      internal_notes: {
        Row: {
          author_id: string | null
          body: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      listas: {
        Row: {
          ativo: boolean | null
          created_at: string
          id: string
          organization_id: string
          tipo: string
          valor: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string
          id?: string
          organization_id?: string
          tipo: string
          valor: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string
          id?: string
          organization_id?: string
          tipo?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          blocked: boolean
          created_at: string
          email: string
          failed_count: number
          last_attempt_at: string
          reset_sent_at: string | null
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          email: string
          failed_count?: number
          last_attempt_at?: string
          reset_sent_at?: string | null
        }
        Update: {
          blocked?: boolean
          created_at?: string
          email?: string
          failed_count?: number
          last_attempt_at?: string
          reset_sent_at?: string | null
        }
        Relationships: []
      }
      media_library: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          name: string
          organization_id: string
          public_url: string
          size_bytes: number | null
          storage_path: string
          tags: string[]
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          organization_id?: string
          public_url: string
          size_bytes?: number | null
          storage_path: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          organization_id?: string
          public_url?: string
          size_bytes?: number | null
          storage_path?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_library_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          created_at: string
          group_label: string | null
          icon: string | null
          id: string
          label: string
          module_key: string | null
          parent_id: string | null
          required_role: string | null
          sort_order: number
          updated_at: string
          url: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          group_label?: string | null
          icon?: string | null
          id?: string
          label: string
          module_key?: string | null
          parent_id?: string | null
          required_role?: string | null
          sort_order?: number
          updated_at?: string
          url: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          group_label?: string | null
          icon?: string | null
          id?: string
          label?: string
          module_key?: string | null
          parent_id?: string | null
          required_role?: string | null
          sort_order?: number
          updated_at?: string
          url?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      message_status_history: {
        Row: {
          changed_at: string
          id: string
          message_id: string
          organization_id: string
          status: string
        }
        Insert: {
          changed_at?: string
          id?: string
          message_id: string
          organization_id: string
          status: string
        }
        Update: {
          changed_at?: string
          id?: string
          message_id?: string
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_status_history_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          delivery_status: string
          direction: string
          id: string
          is_ai: boolean
          media_url: string | null
          message_at: string
          organization_id: string
          provider_message_id: string | null
          sender_user_id: string | null
          type: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          delivery_status?: string
          direction: string
          id?: string
          is_ai?: boolean
          media_url?: string | null
          message_at?: string
          organization_id: string
          provider_message_id?: string | null
          sender_user_id?: string | null
          type?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivery_status?: string
          direction?: string
          id?: string
          is_ai?: boolean
          media_url?: string | null
          message_at?: string
          organization_id?: string
          provider_message_id?: string | null
          sender_user_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string
          organization_id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          organization_id?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          organization_id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          admin_notes: string | null
          created_at: string
          document: string | null
          id: string
          name: string
          owner_id: string | null
          phone: string | null
          plan: string
          show_whatsapp_groups: boolean
          slug: string | null
          status: string
          trial_ends_at: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          document?: string | null
          id?: string
          name: string
          owner_id?: string | null
          phone?: string | null
          plan?: string
          show_whatsapp_groups?: boolean
          slug?: string | null
          status?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          document?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          phone?: string | null
          plan?: string
          show_whatsapp_groups?: boolean
          slug?: string | null
          status?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      patient_clinical_records: {
        Row: {
          appointment_id: string | null
          content: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          kind: string
          organization_id: string
          patient_id: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          kind: string
          organization_id?: string
          patient_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          kind?: string
          organization_id?: string
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_clinical_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          apelido: string | null
          archived_at: string | null
          archived_by: string | null
          status_manual: boolean
          bairro: string | null
          birth_date: string | null
          campanha: string | null
          city: string | null
          clinical_notes: string | null
          cod_pasta: string | null
          codigo: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          email: string | null
          estado_civil: string | null
          id: string
          indicacao: string | null
          informacoes_adicionais: string | null
          insurance: string | null
          nacionalidade: string | null
          name: string
          numero: string | null
          organization_id: string
          pais: string | null
          phone: string | null
          photo_url: string | null
          profissao: string | null
          responsavel_celular: string | null
          responsavel_cpf: string | null
          responsavel_email: string | null
          responsavel_nome: string | null
          responsavel_rg: string | null
          responsavel_telefone_fixo: string | null
          responsavel_tipo: string | null
          responsavel_usar_dados: boolean | null
          rg: string | null
          sexo: string | null
          state: string | null
          status: Database["public"]["Enums"]["patient_status"] | null
          telefone_fixo: string | null
          updated_at: string
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          apelido?: string | null
          archived_at?: string | null
          archived_by?: string | null
          status_manual?: boolean
          bairro?: string | null
          birth_date?: string | null
          campanha?: string | null
          city?: string | null
          clinical_notes?: string | null
          cod_pasta?: string | null
          codigo?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          estado_civil?: string | null
          id?: string
          indicacao?: string | null
          informacoes_adicionais?: string | null
          insurance?: string | null
          nacionalidade?: string | null
          name: string
          numero?: string | null
          organization_id?: string
          pais?: string | null
          phone?: string | null
          photo_url?: string | null
          profissao?: string | null
          responsavel_celular?: string | null
          responsavel_cpf?: string | null
          responsavel_email?: string | null
          responsavel_nome?: string | null
          responsavel_rg?: string | null
          responsavel_telefone_fixo?: string | null
          responsavel_tipo?: string | null
          responsavel_usar_dados?: boolean | null
          rg?: string | null
          sexo?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["patient_status"] | null
          telefone_fixo?: string | null
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          apelido?: string | null
          archived_at?: string | null
          archived_by?: string | null
          status_manual?: boolean
          bairro?: string | null
          birth_date?: string | null
          campanha?: string | null
          city?: string | null
          clinical_notes?: string | null
          cod_pasta?: string | null
          codigo?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          estado_civil?: string | null
          id?: string
          indicacao?: string | null
          informacoes_adicionais?: string | null
          insurance?: string | null
          nacionalidade?: string | null
          name?: string
          numero?: string | null
          organization_id?: string
          pais?: string | null
          phone?: string | null
          photo_url?: string | null
          profissao?: string | null
          responsavel_celular?: string | null
          responsavel_cpf?: string | null
          responsavel_email?: string | null
          responsavel_nome?: string | null
          responsavel_rg?: string | null
          responsavel_telefone_fixo?: string | null
          responsavel_tipo?: string | null
          responsavel_usar_dados?: boolean | null
          rg?: string | null
          sexo?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["patient_status"] | null
          telefone_fixo?: string | null
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_rules: {
        Row: {
          adjustment_mode: string | null
          chat_id: string
          created_at: string | null
          enabled: boolean | null
          footer: string | null
          header: string | null
          id: string
          markup_pct: number | null
          organization_id: string
          rounding: number | null
          target_chat_ids: string[] | null
          updated_at: string | null
        }
        Insert: {
          adjustment_mode?: string | null
          chat_id: string
          created_at?: string | null
          enabled?: boolean | null
          footer?: string | null
          header?: string | null
          id?: string
          markup_pct?: number | null
          organization_id?: string
          rounding?: number | null
          target_chat_ids?: string[] | null
          updated_at?: string | null
        }
        Update: {
          adjustment_mode?: string | null
          chat_id?: string
          created_at?: string | null
          enabled?: boolean | null
          footer?: string | null
          header?: string | null
          id?: string
          markup_pct?: number | null
          organization_id?: string
          rounding?: number | null
          target_chat_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_doctors: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          organization_id: string
          procedure_id: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          organization_id?: string
          procedure_id: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          organization_id?: string
          procedure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_doctors_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_doctors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_doctors_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_items: {
        Row: {
          child_procedure_id: string
          created_at: string
          id: string
          organization_id: string
          parent_procedure_id: string
          quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          child_procedure_id: string
          created_at?: string
          id?: string
          organization_id?: string
          parent_procedure_id: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          child_procedure_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          parent_procedure_id?: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_items_child_procedure_id_fkey"
            columns: ["child_procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_items_parent_procedure_id_fkey"
            columns: ["parent_procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          active: boolean | null
          allow_quantity: boolean
          category: string | null
          color: string | null
          created_at: string
          default_price: number | null
          description: string | null
          duration_minutes: number | null
          focus_priority: number
          id: string
          internal_notes: string | null
          lab_cost: number | null
          max_discount_percent: number | null
          name: string
          organization_id: string
          price_max: number
          price_min: number
          price_plus: number
          price_table: number
          procedure_type: string | null
          setup_fee: number | null
          unit_label: string | null
        }
        Insert: {
          active?: boolean | null
          allow_quantity?: boolean
          category?: string | null
          color?: string | null
          created_at?: string
          default_price?: number | null
          description?: string | null
          duration_minutes?: number | null
          focus_priority?: number
          id?: string
          internal_notes?: string | null
          lab_cost?: number | null
          max_discount_percent?: number | null
          name: string
          organization_id?: string
          price_max?: number
          price_min?: number
          price_plus?: number
          price_table?: number
          procedure_type?: string | null
          setup_fee?: number | null
          unit_label?: string | null
        }
        Update: {
          active?: boolean | null
          allow_quantity?: boolean
          category?: string | null
          color?: string | null
          created_at?: string
          default_price?: number | null
          description?: string | null
          duration_minutes?: number | null
          focus_priority?: number
          id?: string
          internal_notes?: string | null
          lab_cost?: number | null
          max_discount_percent?: number | null
          name?: string
          organization_id?: string
          price_max?: number
          price_min?: number
          price_plus?: number
          price_table?: number
          procedure_type?: string | null
          setup_fee?: number | null
          unit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          barcode: string | null
          category: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          expiration_date: string | null
          id: string
          image_url: string | null
          location: string | null
          lot_number: string | null
          min_stock: number | null
          name: string
          organization_id: string
          sale_price: number | null
          sku: string | null
          stock_quantity: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          barcode?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          expiration_date?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          lot_number?: string | null
          min_stock?: number | null
          name: string
          organization_id?: string
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          barcode?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          expiration_date?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          lot_number?: string | null
          min_stock?: number | null
          name?: string
          organization_id?: string
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          approval_status: string
          created_at: string
          email: string | null
          force_logout_at: string | null
          full_name: string
          id: string
          is_blocked: boolean
          is_developer: boolean | null
          is_tester: boolean | null
          last_seen_at: string | null
          organization_id: string | null
          sector: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          approval_status?: string
          created_at?: string
          email?: string | null
          force_logout_at?: string | null
          full_name: string
          id: string
          is_blocked?: boolean
          is_developer?: boolean | null
          is_tester?: boolean | null
          last_seen_at?: string | null
          organization_id?: string | null
          sector?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          approval_status?: string
          created_at?: string
          email?: string | null
          force_logout_at?: string | null
          full_name?: string
          id?: string
          is_blocked?: boolean
          is_developer?: boolean | null
          is_tester?: boolean | null
          last_seen_at?: string | null
          organization_id?: string | null
          sector?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proteticos: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          name: string
          organization_id?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proteticos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_events: {
        Row: {
          connection_id: string | null
          created_at: string
          dedupe_key: string
          event_type: string | null
          id: string
          organization_id: string | null
          provider: string
          status: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          dedupe_key: string
          event_type?: string | null
          id?: string
          organization_id?: string | null
          provider?: string
          status?: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          dedupe_key?: string
          event_type?: string | null
          id?: string
          organization_id?: string | null
          provider?: string
          status?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount: number
          category: string
          cost_center: string | null
          created_at: string
          dental_id: string | null
          description: string
          due_date: string | null
          id: string
          installments: number | null
          notes: string | null
          organization_id: string
          paid_installments: number | null
          payment_link: string | null
          payment_method: string | null
          payment_status: string
          pix_code: string | null
          purchase_date: string
          receipt_url: string | null
          source_type: string | null
          supplier_id: string | null
        }
        Insert: {
          amount?: number
          category: string
          cost_center?: string | null
          created_at?: string
          dental_id?: string | null
          description: string
          due_date?: string | null
          id?: string
          installments?: number | null
          notes?: string | null
          organization_id?: string
          paid_installments?: number | null
          payment_link?: string | null
          payment_method?: string | null
          payment_status?: string
          pix_code?: string | null
          purchase_date?: string
          receipt_url?: string | null
          source_type?: string | null
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          cost_center?: string | null
          created_at?: string
          dental_id?: string | null
          description?: string
          due_date?: string | null
          id?: string
          installments?: number | null
          notes?: string | null
          organization_id?: string
          paid_installments?: number | null
          payment_link?: string | null
          payment_method?: string | null
          payment_status?: string
          pix_code?: string | null
          purchase_date?: string
          receipt_url?: string | null
          source_type?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_dental_id_fkey"
            columns: ["dental_id"]
            isOneToOne: false
            referencedRelation: "dental"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          body: string
          category: string | null
          created_at: string
          id: string
          installation_id: string | null
          organization_id: string
          shortcut: string | null
          title: string
          uses: number
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          id?: string
          installation_id?: string | null
          organization_id: string
          shortcut?: string | null
          title: string
          uses?: number
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          installation_id?: string | null
          organization_id?: string
          shortcut?: string | null
          title?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "crm_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          has_access: boolean
          id: string
          module_key: string
          role: string
        }
        Insert: {
          created_at?: string
          has_access?: boolean
          id?: string
          module_key: string
          role: string
        }
        Update: {
          created_at?: string
          has_access?: boolean
          id?: string
          module_key?: string
          role?: string
        }
        Relationships: []
      }
      room_renters: {
        Row: {
          active: boolean
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_renters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          active: boolean | null
          city: string | null
          created_at: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          city?: string | null
          created_at?: string | null
          id?: string
          name: string
          organization_id?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          city?: string | null
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          patient_id: string | null
          payment_method: string | null
          product_id: string
          quantity: number
          sale_date: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string | null
          payment_method?: string | null
          product_id: string
          quantity?: number
          sale_date?: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string | null
          payment_method?: string | null
          product_id?: string
          quantity?: number
          sale_date?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_tasks: {
        Row: {
          created_at: string
          cron_expression: string
          description: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          last_status: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cron_expression: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cron_expression?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      shopping_list: {
        Row: {
          auto_generated: boolean | null
          category: string
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string
          priority: string | null
          product_id: string | null
          quantity: number
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean | null
          category?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id?: string
          priority?: string | null
          product_id?: string | null
          quantity?: number
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean | null
          category?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          priority?: string | null
          product_id?: string | null
          quantity?: number
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          name: string
          organization_id?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          expiration_date: string | null
          id: string
          location_id: string | null
          lot_number: string | null
          movement_type: string
          notes: string | null
          organization_id: string
          product_id: string
          quantity: number
          reason: string
          reference_id: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          id?: string
          location_id?: string | null
          lot_number?: string | null
          movement_type: string
          notes?: string | null
          organization_id?: string
          product_id: string
          quantity: number
          reason: string
          reference_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          id?: string
          location_id?: string | null
          lot_number?: string | null
          movement_type?: string
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          reason?: string
          reference_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean | null
          address: string | null
          category: string | null
          cnpj: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          category?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          category?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          audience_roles: string[]
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          severity: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_roles?: string[]
          body: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          severity?: string
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_roles?: string[]
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          severity?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          allow_public_signup: boolean
          app_name: string
          created_at: string
          id: string
          maintenance_message: string | null
          maintenance_mode: boolean
          organization_id: string
          session_timeout_minutes: number
          support_email: string | null
          support_phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_public_signup?: boolean
          app_name?: string
          created_at?: string
          id?: string
          maintenance_message?: string | null
          maintenance_mode?: boolean
          organization_id?: string
          session_timeout_minutes?: number
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_public_signup?: boolean
          app_name?: string
          created_at?: string
          id?: string
          maintenance_message?: string | null
          maintenance_mode?: boolean
          organization_id?: string
          session_timeout_minutes?: number
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_versions: {
        Row: {
          config_snapshot: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          module: string
          version_name: string
        }
        Insert: {
          config_snapshot: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          module: string
          version_name: string
        }
        Update: {
          config_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          module?: string
          version_name?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          external_id: string | null
          id: string
          installation_id: string | null
          label: string
          organization_id: string
          source: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          installation_id?: string | null
          label: string
          organization_id: string
          source?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          installation_id?: string | null
          label?: string
          organization_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "crm_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          done: boolean
          due_at: string | null
          id: string
          organization_id: string
          title: string
        }
        Insert: {
          assignee_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          done?: boolean
          due_at?: string | null
          id?: string
          organization_id: string
          title: string
        }
        Update: {
          assignee_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          done?: boolean
          due_at?: string | null
          id?: string
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_settings: {
        Row: {
          accent_color: string | null
          app_name: string | null
          background_color: string | null
          created_at: string
          favicon_url: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          primary_color: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          app_name?: string | null
          background_color?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          primary_color?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          app_name?: string | null
          background_color?: string | null
          created_at?: string
          favicon_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          primary_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tpd_orders: {
        Row: {
          amount: number | null
          cidade: string | null
          created_at: string
          description: string | null
          doctor_id: string | null
          expected_return: string | null
          id: string
          lab_name: string | null
          notes: string | null
          organization_id: string
          patient_id: string
          piece_type: string
          protetico_id: string | null
          returned_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["tpd_status"] | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          cidade?: string | null
          created_at?: string
          description?: string | null
          doctor_id?: string | null
          expected_return?: string | null
          id?: string
          lab_name?: string | null
          notes?: string | null
          organization_id?: string
          patient_id: string
          piece_type: string
          protetico_id?: string | null
          returned_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["tpd_status"] | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          cidade?: string | null
          created_at?: string
          description?: string | null
          doctor_id?: string | null
          expected_return?: string | null
          id?: string
          lab_name?: string | null
          notes?: string | null
          organization_id?: string
          patient_id?: string
          piece_type?: string
          protetico_id?: string | null
          returned_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["tpd_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tpd_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tpd_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tpd_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tpd_orders_protetico_id_fkey"
            columns: ["protetico_id"]
            isOneToOne: false
            referencedRelation: "proteticos"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          procedure_id: string | null
          procedure_name: string
          quantity: number | null
          total_price: number | null
          treatment_plan_id: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          procedure_id?: string | null
          procedure_name: string
          quantity?: number | null
          total_price?: number | null
          treatment_plan_id: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          procedure_id?: string | null
          procedure_name?: string
          quantity?: number | null
          total_price?: number | null
          treatment_plan_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_items_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_items_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          cidade: string | null
          consulta: string | null
          created_at: string
          description: string | null
          doctor_id: string | null
          id: string
          initial_photos: Json | null
          organization_id: string
          patient_id: string
          quantity: number
          recall: boolean | null
          recall_date: string | null
          recall_notes: string | null
          signature_url: string | null
          signed_at: string | null
          situacao: string | null
          status: Database["public"]["Enums"]["evaluation_status"] | null
          status_exame: string | null
          tipo_exame: string | null
          title: string
          total_value: number | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          consulta?: string | null
          created_at?: string
          description?: string | null
          doctor_id?: string | null
          id?: string
          initial_photos?: Json | null
          organization_id?: string
          patient_id: string
          quantity?: number
          recall?: boolean | null
          recall_date?: string | null
          recall_notes?: string | null
          signature_url?: string | null
          signed_at?: string | null
          situacao?: string | null
          status?: Database["public"]["Enums"]["evaluation_status"] | null
          status_exame?: string | null
          tipo_exame?: string | null
          title: string
          total_value?: number | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          consulta?: string | null
          created_at?: string
          description?: string | null
          doctor_id?: string | null
          id?: string
          initial_photos?: Json | null
          organization_id?: string
          patient_id?: string
          quantity?: number
          recall?: boolean | null
          recall_date?: string | null
          recall_notes?: string | null
          signature_url?: string | null
          signed_at?: string | null
          situacao?: string | null
          status?: Database["public"]["Enums"]["evaluation_status"] | null
          status_exame?: string | null
          tipo_exame?: string | null
          title?: string
          total_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      triage_progress: {
        Row: {
          appointment_id: string
          arrived_at: string | null
          attendance_done_at: string | null
          contacts_ok_at: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          payment_done_at: string | null
          post_done_at: string | null
          signature_at: string | null
          updated_at: string
        }
        Insert: {
          appointment_id: string
          arrived_at?: string | null
          attendance_done_at?: string | null
          contacts_ok_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payment_done_at?: string | null
          post_done_at?: string | null
          signature_at?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          arrived_at?: string | null
          attendance_done_at?: string | null
          contacts_ok_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payment_done_at?: string | null
          post_done_at?: string | null
          signature_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "triage_progress_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_progress_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      triage_stage_progress: {
        Row: {
          appointment_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          payload: Json | null
          stage_id: string
          stage_key: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payload?: Json | null
          stage_id: string
          stage_key: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payload?: Json | null
          stage_id?: string
          stage_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "triage_stage_progress_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "triage_stage_progress_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "triage_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      triage_stages: {
        Row: {
          action_type: string
          active: boolean
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          key: string
          label: string
          organization_id: string
          required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          action_type?: string
          active?: boolean
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          key: string
          label: string
          organization_id?: string
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          active?: boolean
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          key?: string
          label?: string
          organization_id?: string
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "triage_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          phone: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          phone?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      webhook_inbox: {
        Row: {
          connection_id: string | null
          event_type: string | null
          id: string
          organization_id: string | null
          payload: Json | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          connection_id?: string | null
          event_type?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
          provider?: string
          received_at?: string
          status?: string
        }
        Update: {
          connection_id?: string | null
          event_type?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      whatsapp_connections: {
        Row: {
          api_key: string | null
          base_url: string | null
          created_at: string
          default_assignee_id: string | null
          display_name: string | null
          id: string
          installation_id: string | null
          instance_id: string | null
          instance_name: string | null
          is_active: boolean
          is_default: boolean
          keepalive_last_ok_at: string | null
          keepalive_last_restart_at: string | null
          keepalive_last_state: string | null
          keepalive_req_id: number | null
          last_import_at: string | null
          last_import_stats: Json | null
          last_status_at: string | null
          organization_id: string
          phone_number: string | null
          provider: string
          secret_reference: string | null
          sector: string | null
          status: string
          unit_id: string | null
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          default_assignee_id?: string | null
          display_name?: string | null
          id?: string
          installation_id?: string | null
          instance_id?: string | null
          instance_name?: string | null
          is_active?: boolean
          is_default?: boolean
          keepalive_last_ok_at?: string | null
          keepalive_last_restart_at?: string | null
          keepalive_last_state?: string | null
          keepalive_req_id?: number | null
          last_import_at?: string | null
          last_import_stats?: Json | null
          last_status_at?: string | null
          organization_id: string
          phone_number?: string | null
          provider?: string
          secret_reference?: string | null
          sector?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          default_assignee_id?: string | null
          display_name?: string | null
          id?: string
          installation_id?: string | null
          instance_id?: string | null
          instance_name?: string | null
          is_active?: boolean
          is_default?: boolean
          keepalive_last_ok_at?: string | null
          keepalive_last_restart_at?: string | null
          keepalive_last_state?: string | null
          keepalive_req_id?: number | null
          last_import_at?: string | null
          last_import_stats?: Json | null
          last_status_at?: string | null
          organization_id?: string
          phone_number?: string | null
          provider?: string
          secret_reference?: string | null
          sector?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_default_assignee_id_fkey"
            columns: ["default_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "crm_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          active: boolean
          classification: string | null
          created_at: string
          end_time: string
          id: string
          lunch_end: string | null
          lunch_start: string | null
          organization_id: string
          scope: string
          scope_id: string | null
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          classification?: string | null
          created_at?: string
          end_time: string
          id?: string
          lunch_end?: string | null
          lunch_start?: string | null
          organization_id?: string
          scope: string
          scope_id?: string | null
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          classification?: string | null
          created_at?: string
          end_time?: string
          id?: string
          lunch_end?: string | null
          lunch_start?: string | null
          organization_id?: string
          scope?: string
          scope_id?: string | null
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      audit_financial_entries_duplicates: {
        Args: never
        Returns: {
          created_at: string
          details: Json | null
          duplicates_removed: number
          groups_found: number
          id: string
          organization_id: string
          run_at: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_entries_dedup_audit"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clean_phone_number: { Args: { phone: string }; Returns: string }
      create_organization: {
        Args: { _document?: string; _name: string; _phone?: string }
        Returns: string
      }
      crm_apply_chat_labels: {
        Args: { _org: string; _rows: Json }
        Returns: number
      }
      crm_can_access: { Args: never; Returns: boolean }
      crm_current_org: { Args: never; Returns: string }
      crm_import_chats:
        | {
            Args: { _connection: string; _org: string; _rows: Json }
            Returns: number
          }
        | { Args: { _org: string; _rows: Json }; Returns: number }
      crm_import_contacts: {
        Args: { _org: string; _rows: Json }
        Returns: number
      }
      crm_import_labels: {
        Args: { _org: string; _rows: Json }
        Returns: number
      }
      crm_ingest_message: {
        Args: {
          _connection: string
          _content: string
          _direction: string
          _msg_at: string
          _org: string
          _phone: string
          _provider_msg_id: string
          _push_name: string
          _type?: string
        }
        Returns: string
      }
      crm_match_patient: {
        Args: { _org: string; _phone_norm: string }
        Returns: string
      }
      crm_nome_de_pessoa: { Args: { _v: string }; Returns: string }
      crm_normalize_phone: { Args: { p: string }; Returns: string }
      crm_remove_whatsapp_connection: {
        Args: { _connection: string }
        Returns: boolean
      }
      crm_report: { Args: { _from: string; _to: string }; Returns: Json }
      crm_review_receipt: {
        Args: { _decision: string; _receipt_id: string }
        Returns: Json
      }
      crm_start_conversation:
        | {
            Args: { _name?: string; _patient?: string; _phone: string }
            Returns: string
          }
        | {
            Args: {
              _connection: string
              _name: string
              _patient: string
              _phone: string
            }
            Returns: string
          }
      crm_toggle_chat_label: {
        Args: {
          _add: boolean
          _label_ext: string
          _org: string
          _phone: string
        }
        Returns: boolean
      }
      crm_whatsapp_keepalive: { Args: never; Returns: undefined }
      fe_name_tokens: { Args: { input: string }; Returns: string[] }
      fe_same_person: { Args: { a: string; b: string }; Returns: boolean }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_org_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_dev_or_super: { Args: { _user_id: string }; Returns: boolean }
      is_org_active: { Args: { _org_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      my_organizations: {
        Args: never
        Returns: {
          admin_notes: string | null
          created_at: string
          document: string | null
          id: string
          name: string
          owner_id: string | null
          phone: string | null
          plan: string
          show_whatsapp_groups: boolean
          slug: string | null
          status: string
          trial_ends_at: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      normalize_cidade: { Args: { input: string }; Returns: string }
      replace_budget_items: {
        Args: {
          _budget_id: string
          _items: Json
          _organization_id: string
          _procedimento: string | null
          _procedure_id: string | null
          _total_value: number
        }
        Returns: undefined
      }
      set_active_organization: { Args: { _org: string }; Returns: undefined }
      unaccent_safe: { Args: { input: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "financeiro"
        | "recepcao"
        | "doutor"
        | "super_admin"
        | "atendente"
        | "gestor"
      appointment_status:
        | "confirmado"
        | "aguardando"
        | "cancelado"
        | "realizado"
      budget_status:
        | "pendente"
        | "aprovado"
        | "recusado"
        | "em_negociacao"
        | "cancelado"
      evaluation_status: "em_avaliacao" | "aprovado" | "iniciado"
      patient_status: "ativo" | "em_tratamento" | "finalizado"
      tpd_status: "em_producao" | "entregue"
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
        "admin",
        "financeiro",
        "recepcao",
        "doutor",
        "super_admin",
        "atendente",
        "gestor",
      ],
      appointment_status: [
        "confirmado",
        "aguardando",
        "cancelado",
        "realizado",
      ],
      budget_status: [
        "pendente",
        "aprovado",
        "recusado",
        "em_negociacao",
        "cancelado",
      ],
      evaluation_status: ["em_avaliacao", "aprovado", "iniciado"],
      patient_status: ["ativo", "em_tratamento", "finalizado"],
      tpd_status: ["em_producao", "entregue"],
    },
  },
} as const
