export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      agent_actions: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          decided_at: string | null;
          error: string | null;
          id: string;
          kind: string;
          payload: NonNullable<Json>;
          profile_id: string;
          result: Json | null;
          status: string;
          summary: string;
        };
        Insert: {
          conversation_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          error?: string | null;
          id?: string;
          kind: string;
          payload: NonNullable<Json>;
          profile_id?: string;
          result?: Json | null;
          status?: string;
          summary: string;
        };
        Update: {
          conversation_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          error?: string | null;
          id?: string;
          kind?: string;
          payload?: NonNullable<Json>;
          profile_id?: string;
          result?: Json | null;
          status?: string;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_actions_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'agent_conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_actions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_briefings: {
        Row: {
          cache_read_tokens: number;
          cache_write_tokens: number;
          created_at: string;
          day: string;
          generations: number;
          id: string;
          input_tokens: number;
          output_tokens: number;
          phrases: NonNullable<Json>;
          profile_id: string;
          text: string;
          tools: string[];
          updated_at: string;
        };
        Insert: {
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          created_at?: string;
          day: string;
          generations?: number;
          id?: string;
          input_tokens?: number;
          output_tokens?: number;
          phrases?: NonNullable<Json>;
          profile_id: string;
          text: string;
          tools?: string[];
          updated_at?: string;
        };
        Update: {
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          created_at?: string;
          day?: string;
          generations?: number;
          id?: string;
          input_tokens?: number;
          output_tokens?: number;
          phrases?: NonNullable<Json>;
          profile_id?: string;
          text?: string;
          tools?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_briefings_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_conversations: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          title: string;
          transcript: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          title: string;
          transcript?: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          title?: string;
          transcript?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_conversations_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_turns: {
        Row: {
          answer: string;
          cache_read_tokens: number;
          cache_write_tokens: number;
          conversation_id: string;
          created_at: string;
          id: string;
          input_tokens: number;
          output_tokens: number;
          profile_id: string;
          question: string;
          spoken: boolean;
          tools: string[];
        };
        Insert: {
          answer: string;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          conversation_id: string;
          created_at?: string;
          id?: string;
          input_tokens?: number;
          output_tokens?: number;
          profile_id: string;
          question: string;
          spoken?: boolean;
          tools?: string[];
        };
        Update: {
          answer?: string;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          input_tokens?: number;
          output_tokens?: number;
          profile_id?: string;
          question?: string;
          spoken?: boolean;
          tools?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'agent_turns_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'agent_conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_turns_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      app_settings: {
        Row: {
          agent_enabled: boolean;
          agent_memo: string;
          auto_mails_enabled: boolean;
          clock_photo_retention_months: number;
          daily_hours: number;
          expected_arrival: string;
          friday_hours: number;
          friday_lunch_start: string;
          id: boolean;
          label_scan_enabled: boolean;
          late_tolerance: string;
          lunch_end: string;
          lunch_start: string;
          mail_billing_local: string;
          mail_domain: string | null;
          mail_send_enabled: boolean;
          mail_signature_local: string;
          mail_workshop_local: string;
          overtime_start: string;
          rest_reference_monday: string | null;
          roadside_flat_fee: number;
          roadside_price_per_km: number;
          roadside_travel_hourly_rate: number;
          tts_monthly_limit: number;
          tts_provider: string;
          tts_voice: string;
          updated_at: string;
          workday_end: string;
          workday_start: string;
        };
        Insert: {
          agent_enabled?: boolean;
          agent_memo?: string;
          auto_mails_enabled?: boolean;
          clock_photo_retention_months?: number;
          daily_hours?: number;
          expected_arrival?: string;
          friday_hours?: number;
          friday_lunch_start?: string;
          id?: boolean;
          label_scan_enabled?: boolean;
          late_tolerance?: string;
          lunch_end?: string;
          lunch_start?: string;
          mail_billing_local?: string;
          mail_domain?: string | null;
          mail_send_enabled?: boolean;
          mail_signature_local?: string;
          mail_workshop_local?: string;
          overtime_start?: string;
          rest_reference_monday?: string | null;
          roadside_flat_fee?: number;
          roadside_price_per_km?: number;
          roadside_travel_hourly_rate?: number;
          tts_monthly_limit?: number;
          tts_provider?: string;
          tts_voice?: string;
          updated_at?: string;
          workday_end?: string;
          workday_start?: string;
        };
        Update: {
          agent_enabled?: boolean;
          agent_memo?: string;
          auto_mails_enabled?: boolean;
          clock_photo_retention_months?: number;
          daily_hours?: number;
          expected_arrival?: string;
          friday_hours?: number;
          friday_lunch_start?: string;
          id?: boolean;
          label_scan_enabled?: boolean;
          late_tolerance?: string;
          lunch_end?: string;
          lunch_start?: string;
          mail_billing_local?: string;
          mail_domain?: string | null;
          mail_send_enabled?: boolean;
          mail_signature_local?: string;
          mail_workshop_local?: string;
          overtime_start?: string;
          rest_reference_monday?: string | null;
          roadside_flat_fee?: number;
          roadside_price_per_km?: number;
          roadside_travel_hourly_rate?: number;
          tts_monthly_limit?: number;
          tts_provider?: string;
          tts_voice?: string;
          updated_at?: string;
          workday_end?: string;
          workday_start?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          end_time: string | null;
          id: string;
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          reason: string | null;
          reminder_sent_at: string | null;
          repair_order_id: string | null;
          scheduled_date: string;
          start_time: string;
          status: Database['public']['Enums']['appointment_status'];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          end_time?: string | null;
          id?: string;
          legacy_id?: string | null;
          maintenance_contract_id?: string | null;
          reason?: string | null;
          reminder_sent_at?: string | null;
          repair_order_id?: string | null;
          scheduled_date: string;
          start_time: string;
          status?: Database['public']['Enums']['appointment_status'];
          technician_id?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          vehicle_type?: Database['public']['Enums']['vehicle_type'];
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          end_time?: string | null;
          id?: string;
          legacy_id?: string | null;
          maintenance_contract_id?: string | null;
          reason?: string | null;
          reminder_sent_at?: string | null;
          repair_order_id?: string | null;
          scheduled_date?: string;
          start_time?: string;
          status?: Database['public']['Enums']['appointment_status'];
          technician_id?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
          vehicle_type?: Database['public']['Enums']['vehicle_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'appointments_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'maintenance_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contract_vehicle_status';
            referencedColumns: ['contract_id'];
          },
          {
            foreignKeyName: 'appointments_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contracts_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'appointments_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'appointments_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      auto_mail_log: {
        Row: {
          appointment_id: string | null;
          attempts: number;
          client_id: string | null;
          created_at: string;
          error: string | null;
          key: string;
          kind: string;
          provider_message_id: string | null;
          recipient: string;
          rental_id: string | null;
          sent_at: string | null;
          vehicle_id: string | null;
        };
        Insert: {
          appointment_id?: string | null;
          attempts?: number;
          client_id?: string | null;
          created_at?: string;
          error?: string | null;
          key: string;
          kind: string;
          provider_message_id?: string | null;
          recipient: string;
          rental_id?: string | null;
          sent_at?: string | null;
          vehicle_id?: string | null;
        };
        Update: {
          appointment_id?: string | null;
          attempts?: number;
          client_id?: string | null;
          created_at?: string;
          error?: string | null;
          key?: string;
          kind?: string;
          provider_message_id?: string | null;
          recipient?: string;
          rental_id?: string | null;
          sent_at?: string | null;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'auto_mail_log_appointment_id_fkey';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'auto_mail_log_appointment_id_fkey';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'v_appointments_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'auto_mail_log_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'auto_mail_log_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'auto_mail_log_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'rentals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'auto_mail_log_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'v_rentals_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'auto_mail_log_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'auto_mail_log_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'auto_mail_log_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      booking_links: {
        Row: {
          appointment_id: string | null;
          client_id: string;
          created_at: string;
          due_date: string | null;
          expires_at: string;
          kind: string;
          maintenance_contract_id: string | null;
          token: string;
          vehicle_id: string;
        };
        Insert: {
          appointment_id?: string | null;
          client_id: string;
          created_at?: string;
          due_date?: string | null;
          expires_at?: string;
          kind: string;
          maintenance_contract_id?: string | null;
          token?: string;
          vehicle_id: string;
        };
        Update: {
          appointment_id?: string | null;
          client_id?: string;
          created_at?: string;
          due_date?: string | null;
          expires_at?: string;
          kind?: string;
          maintenance_contract_id?: string | null;
          token?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_links_appointment_id_fkey';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_links_appointment_id_fkey';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'v_appointments_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_links_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_links_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_links_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'maintenance_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_links_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contract_vehicle_status';
            referencedColumns: ['contract_id'];
          },
          {
            foreignKeyName: 'booking_links_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contracts_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_links_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'booking_links_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_links_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      client_messages: {
        Row: {
          appointment_id: string | null;
          body: string | null;
          channel: Database['public']['Enums']['message_channel'];
          client_id: string | null;
          id: string;
          invoice_id: string | null;
          message_type: Database['public']['Enums']['client_message_type'];
          provider_message_id: string | null;
          quote_id: string | null;
          recipient: string | null;
          repair_order_id: string | null;
          sent_at: string;
          sent_by: string | null;
          subject: string | null;
        };
        Insert: {
          appointment_id?: string | null;
          body?: string | null;
          channel: Database['public']['Enums']['message_channel'];
          client_id?: string | null;
          id?: string;
          invoice_id?: string | null;
          message_type: Database['public']['Enums']['client_message_type'];
          provider_message_id?: string | null;
          quote_id?: string | null;
          recipient?: string | null;
          repair_order_id?: string | null;
          sent_at?: string;
          sent_by?: string | null;
          subject?: string | null;
        };
        Update: {
          appointment_id?: string | null;
          body?: string | null;
          channel?: Database['public']['Enums']['message_channel'];
          client_id?: string | null;
          id?: string;
          invoice_id?: string | null;
          message_type?: Database['public']['Enums']['client_message_type'];
          provider_message_id?: string | null;
          quote_id?: string | null;
          recipient?: string | null;
          repair_order_id?: string | null;
          sent_at?: string;
          sent_by?: string | null;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_messages_appointment_id_fkey';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_appointment_id_fkey';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'v_appointments_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'client_messages_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'client_messages_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quote_totals';
            referencedColumns: ['quote_id'];
          },
          {
            foreignKeyName: 'client_messages_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quotes_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'client_messages_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_messages_sent_by_fkey';
            columns: ['sent_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      clients: {
        Row: {
          account_type: string;
          archived_at: string | null;
          billing_address: string | null;
          birth_date: string | null;
          birth_place: string | null;
          civility: string | null;
          contact_name: string | null;
          created_at: string;
          discount_percent: number | null;
          email: string | null;
          first_name: string | null;
          hourly_rate: number | null;
          id: string;
          kind: Database['public']['Enums']['client_kind'];
          last_name: string | null;
          legacy_key: string | null;
          name: string;
          name_key: string | null;
          notes: string | null;
          other_phones: NonNullable<Json>;
          phone: string | null;
          portal_token: string | null;
          siret: string | null;
          updated_at: string;
          vat_checked_at: string | null;
          vat_number: string | null;
          vat_registered_name: string | null;
          vat_status: string;
        };
        Insert: {
          account_type?: string;
          archived_at?: string | null;
          billing_address?: string | null;
          birth_date?: string | null;
          birth_place?: string | null;
          civility?: string | null;
          contact_name?: string | null;
          created_at?: string;
          discount_percent?: number | null;
          email?: string | null;
          first_name?: string | null;
          hourly_rate?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['client_kind'];
          last_name?: string | null;
          legacy_key?: string | null;
          name: string;
          name_key?: never;
          notes?: string | null;
          other_phones?: NonNullable<Json>;
          phone?: string | null;
          portal_token?: string | null;
          siret?: string | null;
          updated_at?: string;
          vat_checked_at?: string | null;
          vat_number?: string | null;
          vat_registered_name?: string | null;
          vat_status?: string;
        };
        Update: {
          account_type?: string;
          archived_at?: string | null;
          billing_address?: string | null;
          birth_date?: string | null;
          birth_place?: string | null;
          civility?: string | null;
          contact_name?: string | null;
          created_at?: string;
          discount_percent?: number | null;
          email?: string | null;
          first_name?: string | null;
          hourly_rate?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['client_kind'];
          last_name?: string | null;
          legacy_key?: string | null;
          name?: string;
          name_key?: never;
          notes?: string | null;
          other_phones?: NonNullable<Json>;
          phone?: string | null;
          portal_token?: string | null;
          siret?: string | null;
          updated_at?: string;
          vat_checked_at?: string | null;
          vat_number?: string | null;
          vat_registered_name?: string | null;
          vat_status?: string;
        };
        Relationships: [];
      };
      clock_events: {
        Row: {
          created_at: string;
          during_leave_type: Database['public']['Enums']['leave_type'] | null;
          entered_by: string | null;
          event_type: Database['public']['Enums']['clock_event_type'];
          id: string;
          legacy_id: string | null;
          occurred_at: string;
          photo_file_id: string | null;
          photo_purged_at: string | null;
          reason: string | null;
          source: Database['public']['Enums']['clock_source'];
          technician_id: string;
          work_date: string;
        };
        Insert: {
          created_at?: string;
          during_leave_type?: Database['public']['Enums']['leave_type'] | null;
          entered_by?: string | null;
          event_type: Database['public']['Enums']['clock_event_type'];
          id?: string;
          legacy_id?: string | null;
          occurred_at?: string;
          photo_file_id?: string | null;
          photo_purged_at?: string | null;
          reason?: string | null;
          source: Database['public']['Enums']['clock_source'];
          technician_id: string;
          work_date: string;
        };
        Update: {
          created_at?: string;
          during_leave_type?: Database['public']['Enums']['leave_type'] | null;
          entered_by?: string | null;
          event_type?: Database['public']['Enums']['clock_event_type'];
          id?: string;
          legacy_id?: string | null;
          occurred_at?: string;
          photo_file_id?: string | null;
          photo_purged_at?: string | null;
          reason?: string | null;
          source?: Database['public']['Enums']['clock_source'];
          technician_id?: string;
          work_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clock_events_entered_by_fkey';
            columns: ['entered_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clock_events_photo_file_id_fkey';
            columns: ['photo_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clock_events_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
        ];
      };
      company_settings: {
        Row: {
          address_line: string;
          bic: string | null;
          city: string;
          default_vat_rate: number;
          email: string | null;
          iban: string | null;
          id: boolean;
          invoice_legal_mentions: string[];
          legal_form: string | null;
          legal_name: string;
          logo_file_id: string | null;
          payment_terms_days: number;
          phone: string | null;
          postal_code: string;
          quote_validity_days: number;
          rcs: string | null;
          share_capital: string | null;
          siret: string | null;
          supplies_fee_ht: number | null;
          updated_at: string;
          vat_exempt_mention_eu: string;
          vat_exempt_mention_other: string;
          vat_number: string | null;
        };
        Insert: {
          address_line: string;
          bic?: string | null;
          city: string;
          default_vat_rate?: number;
          email?: string | null;
          iban?: string | null;
          id?: boolean;
          invoice_legal_mentions?: string[];
          legal_form?: string | null;
          legal_name: string;
          logo_file_id?: string | null;
          payment_terms_days?: number;
          phone?: string | null;
          postal_code: string;
          quote_validity_days?: number;
          rcs?: string | null;
          share_capital?: string | null;
          siret?: string | null;
          supplies_fee_ht?: number | null;
          updated_at?: string;
          vat_exempt_mention_eu?: string;
          vat_exempt_mention_other?: string;
          vat_number?: string | null;
        };
        Update: {
          address_line?: string;
          bic?: string | null;
          city?: string;
          default_vat_rate?: number;
          email?: string | null;
          iban?: string | null;
          id?: boolean;
          invoice_legal_mentions?: string[];
          legal_form?: string | null;
          legal_name?: string;
          logo_file_id?: string | null;
          payment_terms_days?: number;
          phone?: string | null;
          postal_code?: string;
          quote_validity_days?: number;
          rcs?: string | null;
          share_capital?: string | null;
          siret?: string | null;
          supplies_fee_ht?: number | null;
          updated_at?: string;
          vat_exempt_mention_eu?: string;
          vat_exempt_mention_other?: string;
          vat_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'company_settings_logo_file_id_fkey';
            columns: ['logo_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      consumable_movements: {
        Row: {
          consumable_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          quantity: number;
          reason: Database['public']['Enums']['consumable_movement_reason'];
          repair_order_id: string | null;
          ro_consumable_id: string | null;
        };
        Insert: {
          consumable_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          quantity: number;
          reason: Database['public']['Enums']['consumable_movement_reason'];
          repair_order_id?: string | null;
          ro_consumable_id?: string | null;
        };
        Update: {
          consumable_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          quantity?: number;
          reason?: Database['public']['Enums']['consumable_movement_reason'];
          repair_order_id?: string | null;
          ro_consumable_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'consumable_movements_consumable_id_fkey';
            columns: ['consumable_id'];
            isOneToOne: false;
            referencedRelation: 'consumables';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consumable_movements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consumable_movements_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consumable_movements_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'consumable_movements_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'consumable_movements_ro_consumable_id_fkey';
            columns: ['ro_consumable_id'];
            isOneToOne: false;
            referencedRelation: 'ro_consumables';
            referencedColumns: ['id'];
          },
        ];
      };
      consumables: {
        Row: {
          alert_threshold: number | null;
          created_at: string;
          id: string;
          is_active: boolean;
          legacy_id: string | null;
          name: string;
          purchase_price: number;
          sale_price: number;
          stock_qty: number;
          unit: string;
          updated_at: string;
        };
        Insert: {
          alert_threshold?: number | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          legacy_id?: string | null;
          name: string;
          purchase_price?: number;
          sale_price?: number;
          stock_qty?: number;
          unit?: string;
          updated_at?: string;
        };
        Update: {
          alert_threshold?: number | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          legacy_id?: string | null;
          name?: string;
          purchase_price?: number;
          sale_price?: number;
          stock_qty?: number;
          unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_notes: {
        Row: {
          amount_ht: number;
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_id: string;
          issued_at: string;
          legacy_id: string | null;
          number: string;
          pdf_file_id: string | null;
          reason: string | null;
          total_ttc: number | null;
          total_vat: number | null;
          vat_rate: number;
        };
        Insert: {
          amount_ht: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id: string;
          issued_at?: string;
          legacy_id?: string | null;
          number: string;
          pdf_file_id?: string | null;
          reason?: string | null;
          total_ttc?: never;
          total_vat?: never;
          vat_rate?: number;
        };
        Update: {
          amount_ht?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string;
          issued_at?: string;
          legacy_id?: string | null;
          number?: string;
          pdf_file_id?: string | null;
          reason?: string | null;
          total_ttc?: never;
          total_vat?: never;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_notes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_notes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_notes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'credit_notes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'credit_notes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_notes_pdf_file_id_fkey';
            columns: ['pdf_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      diagnostic_requests: {
        Row: {
          answer: string;
          created_at: string;
          id: string;
          input_tokens: number;
          output_tokens: number;
          profile_id: string | null;
          question: string;
          repair_order_id: string | null;
          sources: NonNullable<Json>;
        };
        Insert: {
          answer: string;
          created_at?: string;
          id?: string;
          input_tokens?: number;
          output_tokens?: number;
          profile_id?: string | null;
          question: string;
          repair_order_id?: string | null;
          sources?: NonNullable<Json>;
        };
        Update: {
          answer?: string;
          created_at?: string;
          id?: string;
          input_tokens?: number;
          output_tokens?: number;
          profile_id?: string | null;
          question?: string;
          repair_order_id?: string | null;
          sources?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'diagnostic_requests_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'diagnostic_requests_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'diagnostic_requests_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'diagnostic_requests_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      document_sequences: {
        Row: {
          key: string;
          last_value: number;
          pad_length: number;
          prefix: string;
        };
        Insert: {
          key: string;
          last_value?: number;
          pad_length?: number;
          prefix: string;
        };
        Update: {
          key?: string;
          last_value?: number;
          pad_length?: number;
          prefix?: string;
        };
        Relationships: [];
      };
      driving_licenses: {
        Row: {
          birth_date: string | null;
          birth_place: string | null;
          categories: string[];
          client_id: string;
          created_at: string;
          created_by: string | null;
          first_name: string;
          id: string;
          issued_on: string | null;
          last_name: string;
          license_number: string | null;
          read_automatically: boolean;
          recto_file_id: string | null;
          updated_at: string;
          valid_until: string | null;
          verso_file_id: string | null;
        };
        Insert: {
          birth_date?: string | null;
          birth_place?: string | null;
          categories?: string[];
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          first_name: string;
          id?: string;
          issued_on?: string | null;
          last_name: string;
          license_number?: string | null;
          read_automatically?: boolean;
          recto_file_id?: string | null;
          updated_at?: string;
          valid_until?: string | null;
          verso_file_id?: string | null;
        };
        Update: {
          birth_date?: string | null;
          birth_place?: string | null;
          categories?: string[];
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          first_name?: string;
          id?: string;
          issued_on?: string | null;
          last_name?: string;
          license_number?: string | null;
          read_automatically?: boolean;
          recto_file_id?: string | null;
          updated_at?: string;
          valid_until?: string | null;
          verso_file_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'driving_licenses_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'driving_licenses_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'driving_licenses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'driving_licenses_recto_file_id_fkey';
            columns: ['recto_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'driving_licenses_verso_file_id_fkey';
            columns: ['verso_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      email_deliveries: {
        Row: {
          attachments: string[];
          id: string;
          provider_message_id: string | null;
          recipient: string;
          sender: string | null;
          sent_at: string;
          sent_by: string | null;
          subject: string;
        };
        Insert: {
          attachments?: string[];
          id?: string;
          provider_message_id?: string | null;
          recipient: string;
          sender?: string | null;
          sent_at?: string;
          sent_by?: string | null;
          subject: string;
        };
        Update: {
          attachments?: string[];
          id?: string;
          provider_message_id?: string | null;
          recipient?: string;
          sender?: string | null;
          sent_at?: string;
          sent_by?: string | null;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_deliveries_sent_by_fkey';
            columns: ['sent_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      files: {
        Row: {
          bucket: string;
          category: Database['public']['Enums']['file_category'];
          created_at: string;
          deleted_at: string | null;
          id: string;
          mime_type: string;
          original_name: string | null;
          purged_at: string | null;
          size_bytes: number | null;
          storage_key: string;
          uploaded_at: string | null;
          uploaded_by: string | null;
        };
        Insert: {
          bucket?: string;
          category: Database['public']['Enums']['file_category'];
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime_type: string;
          original_name?: string | null;
          purged_at?: string | null;
          size_bytes?: number | null;
          storage_key: string;
          uploaded_at?: string | null;
          uploaded_by?: string | null;
        };
        Update: {
          bucket?: string;
          category?: Database['public']['Enums']['file_category'];
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime_type?: string;
          original_name?: string | null;
          purged_at?: string | null;
          size_bytes?: number | null;
          storage_key?: string;
          uploaded_at?: string | null;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'files_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      fleet_documents: {
        Row: {
          created_at: string;
          created_by: string | null;
          file_id: string;
          fleet_vehicle_id: string;
          id: string;
          kind: Database['public']['Enums']['fleet_document_kind'];
          label: string;
          valid_until: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          file_id: string;
          fleet_vehicle_id: string;
          id?: string;
          kind: Database['public']['Enums']['fleet_document_kind'];
          label: string;
          valid_until?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          file_id?: string;
          fleet_vehicle_id?: string;
          id?: string;
          kind?: Database['public']['Enums']['fleet_document_kind'];
          label?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fleet_documents_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fleet_documents_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fleet_documents_fleet_vehicle_id_fkey';
            columns: ['fleet_vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'fleet_vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      fleet_vehicles: {
        Row: {
          brand: string;
          category: Database['public']['Enums']['fleet_category'];
          cleaning_fee: number;
          created_at: string;
          ct_due_date: string | null;
          daily_rate: number;
          deposit: number;
          extra_km_price: number | null;
          first_registration: string | null;
          franchise: number | null;
          fuel_price_per_liter: number;
          fuel_type: string | null;
          id: string;
          in_maintenance: boolean;
          insurance_due_date: string | null;
          is_active: boolean;
          km_included_per_day: number | null;
          late_fee_per_hour: number;
          license_category: string;
          loanable: boolean;
          maintenance_note: string | null;
          mileage: number | null;
          model: string;
          month_rate: number | null;
          next_service_km: number | null;
          notes: string | null;
          photo_file_id: string | null;
          plate: string;
          plate_key: string | null;
          tank_liters: number | null;
          updated_at: string;
          vin: string | null;
          week_rate: number | null;
          weekend_rate: number | null;
          year_rate: number | null;
        };
        Insert: {
          brand: string;
          category: Database['public']['Enums']['fleet_category'];
          cleaning_fee?: number;
          created_at?: string;
          ct_due_date?: string | null;
          daily_rate: number;
          deposit?: number;
          extra_km_price?: number | null;
          first_registration?: string | null;
          franchise?: number | null;
          fuel_price_per_liter?: number;
          fuel_type?: string | null;
          id?: string;
          in_maintenance?: boolean;
          insurance_due_date?: string | null;
          is_active?: boolean;
          km_included_per_day?: number | null;
          late_fee_per_hour?: number;
          license_category?: string;
          loanable?: boolean;
          maintenance_note?: string | null;
          mileage?: number | null;
          model: string;
          month_rate?: number | null;
          next_service_km?: number | null;
          notes?: string | null;
          photo_file_id?: string | null;
          plate: string;
          plate_key?: never;
          tank_liters?: number | null;
          updated_at?: string;
          vin?: string | null;
          week_rate?: number | null;
          weekend_rate?: number | null;
          year_rate?: number | null;
        };
        Update: {
          brand?: string;
          category?: Database['public']['Enums']['fleet_category'];
          cleaning_fee?: number;
          created_at?: string;
          ct_due_date?: string | null;
          daily_rate?: number;
          deposit?: number;
          extra_km_price?: number | null;
          first_registration?: string | null;
          franchise?: number | null;
          fuel_price_per_liter?: number;
          fuel_type?: string | null;
          id?: string;
          in_maintenance?: boolean;
          insurance_due_date?: string | null;
          is_active?: boolean;
          km_included_per_day?: number | null;
          late_fee_per_hour?: number;
          license_category?: string;
          loanable?: boolean;
          maintenance_note?: string | null;
          mileage?: number | null;
          model?: string;
          month_rate?: number | null;
          next_service_km?: number | null;
          notes?: string | null;
          photo_file_id?: string | null;
          plate?: string;
          plate_key?: never;
          tank_liters?: number | null;
          updated_at?: string;
          vin?: string | null;
          week_rate?: number | null;
          weekend_rate?: number | null;
          year_rate?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fleet_vehicles_photo_file_id_fkey';
            columns: ['photo_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      inbox_emails: {
        Row: {
          attachments: NonNullable<Json>;
          body: string;
          category: string | null;
          client_id: string | null;
          created_at: string;
          from_address: string;
          from_name: string;
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          input_tokens: number;
          mailbox: string | null;
          message_id: string | null;
          needs_reply: boolean | null;
          output_tokens: number;
          provider_id: string;
          received_at: string;
          reply_attempts: number;
          reply_basis: string | null;
          reply_body: string | null;
          reply_input_tokens: number;
          reply_output_tokens: number;
          reply_prepared_at: string | null;
          reply_provider_id: string | null;
          reply_request: string | null;
          reply_sent_at: string | null;
          reply_sent_by: string | null;
          reply_status: string;
          reply_subject: string | null;
          reply_tools: string[];
          subject: string;
          summary: string | null;
          to_addresses: string[];
          triage_attempts: number;
          triage_status: string;
          urgency: string | null;
        };
        Insert: {
          attachments?: NonNullable<Json>;
          body?: string;
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          from_address: string;
          from_name?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          input_tokens?: number;
          mailbox?: string | null;
          message_id?: string | null;
          needs_reply?: boolean | null;
          output_tokens?: number;
          provider_id: string;
          received_at: string;
          reply_attempts?: number;
          reply_basis?: string | null;
          reply_body?: string | null;
          reply_input_tokens?: number;
          reply_output_tokens?: number;
          reply_prepared_at?: string | null;
          reply_provider_id?: string | null;
          reply_request?: string | null;
          reply_sent_at?: string | null;
          reply_sent_by?: string | null;
          reply_status?: string;
          reply_subject?: string | null;
          reply_tools?: string[];
          subject?: string;
          summary?: string | null;
          to_addresses?: string[];
          triage_attempts?: number;
          triage_status?: string;
          urgency?: string | null;
        };
        Update: {
          attachments?: NonNullable<Json>;
          body?: string;
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          from_address?: string;
          from_name?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          input_tokens?: number;
          mailbox?: string | null;
          message_id?: string | null;
          needs_reply?: boolean | null;
          output_tokens?: number;
          provider_id?: string;
          received_at?: string;
          reply_attempts?: number;
          reply_basis?: string | null;
          reply_body?: string | null;
          reply_input_tokens?: number;
          reply_output_tokens?: number;
          reply_prepared_at?: string | null;
          reply_provider_id?: string | null;
          reply_request?: string | null;
          reply_sent_at?: string | null;
          reply_sent_by?: string | null;
          reply_status?: string;
          reply_subject?: string | null;
          reply_tools?: string[];
          subject?: string;
          summary?: string | null;
          to_addresses?: string[];
          triage_attempts?: number;
          triage_status?: string;
          urgency?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inbox_emails_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inbox_emails_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inbox_emails_handled_by_fkey';
            columns: ['handled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inbox_emails_reply_sent_by_fkey';
            columns: ['reply_sent_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      inbox_webhook_status: {
        Row: {
          domain: string | null;
          id: boolean;
          received_at: string;
          recipients: string[];
          result: string;
        };
        Insert: {
          domain?: string | null;
          id?: boolean;
          received_at?: string;
          recipients?: string[];
          result: string;
        };
        Update: {
          domain?: string | null;
          id?: boolean;
          received_at?: string;
          recipients?: string[];
          result?: string;
        };
        Relationships: [];
      };
      inspections: {
        Row: {
          data: NonNullable<Json>;
          repair_order_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          data?: NonNullable<Json>;
          repair_order_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          data?: NonNullable<Json>;
          repair_order_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inspections_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: true;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inspections_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: true;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'inspections_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: true;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inspections_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_due_date_changes: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          id: string;
          invoice_id: string;
          new_date: string;
          old_date: string | null;
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          id?: string;
          invoice_id: string;
          new_date: string;
          old_date?: string | null;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          id?: string;
          invoice_id?: string;
          new_date?: string;
          old_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_due_date_changes_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_due_date_changes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_due_date_changes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_due_date_changes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_due_date_changes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_line_employee_changes: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          id: string;
          invoice_id: string;
          invoice_line_id: string | null;
          line_description: string;
          new_name: string | null;
          old_name: string | null;
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          id?: string;
          invoice_id: string;
          invoice_line_id?: string | null;
          line_description: string;
          new_name?: string | null;
          old_name?: string | null;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          id?: string;
          invoice_id?: string;
          invoice_line_id?: string | null;
          line_description?: string;
          new_name?: string | null;
          old_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_line_employee_changes_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_line_employee_changes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_line_employee_changes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_line_employee_changes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_line_employee_changes_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_line_employee_changes_invoice_line_id_fkey';
            columns: ['invoice_line_id'];
            isOneToOne: false;
            referencedRelation: 'invoice_lines';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_line_employees: {
        Row: {
          invoice_line_id: string;
          profile_id: string | null;
          technician_id: string | null;
          updated_at: string;
        };
        Insert: {
          invoice_line_id: string;
          profile_id?: string | null;
          technician_id?: string | null;
          updated_at?: string;
        };
        Update: {
          invoice_line_id?: string;
          profile_id?: string | null;
          technician_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_line_employees_invoice_line_id_fkey';
            columns: ['invoice_line_id'];
            isOneToOne: true;
            referencedRelation: 'invoice_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_line_employees_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_line_employees_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_lines: {
        Row: {
          billed_hours: number | null;
          brand: string | null;
          created_at: string;
          description: string;
          discount_percent: number;
          id: string;
          invoice_id: string;
          labor_category: Database['public']['Enums']['labor_category'] | null;
          line_type: Database['public']['Enums']['line_type'];
          manufacturer_ref: string | null;
          net_ht: number | null;
          oem_ref: string | null;
          package_id: string | null;
          part_id: string | null;
          position: number;
          purchase_price: number | null;
          quantity: number;
          repair_order_id: string | null;
          shipping_cost: number | null;
          source_quote_line_id: string | null;
          source_ro_consumable_id: string | null;
          source_ro_line_id: string | null;
          source_subcontract_id: string | null;
          standard_hours: number | null;
          supplier_id: string | null;
          unit_price: number | null;
          updated_at: string;
          vat_rate: number;
        };
        Insert: {
          billed_hours?: number | null;
          brand?: string | null;
          created_at?: string;
          description?: string;
          discount_percent?: number;
          id?: string;
          invoice_id: string;
          labor_category?: Database['public']['Enums']['labor_category'] | null;
          line_type?: Database['public']['Enums']['line_type'];
          manufacturer_ref?: string | null;
          net_ht?: never;
          oem_ref?: string | null;
          package_id?: string | null;
          part_id?: string | null;
          position?: number;
          purchase_price?: number | null;
          quantity?: number;
          repair_order_id?: string | null;
          shipping_cost?: number | null;
          source_quote_line_id?: string | null;
          source_ro_consumable_id?: string | null;
          source_ro_line_id?: string | null;
          source_subcontract_id?: string | null;
          standard_hours?: number | null;
          supplier_id?: string | null;
          unit_price?: number | null;
          updated_at?: string;
          vat_rate?: number;
        };
        Update: {
          billed_hours?: number | null;
          brand?: string | null;
          created_at?: string;
          description?: string;
          discount_percent?: number;
          id?: string;
          invoice_id?: string;
          labor_category?: Database['public']['Enums']['labor_category'] | null;
          line_type?: Database['public']['Enums']['line_type'];
          manufacturer_ref?: string | null;
          net_ht?: never;
          oem_ref?: string | null;
          package_id?: string | null;
          part_id?: string | null;
          position?: number;
          purchase_price?: number | null;
          quantity?: number;
          repair_order_id?: string | null;
          shipping_cost?: number | null;
          source_quote_line_id?: string | null;
          source_ro_consumable_id?: string | null;
          source_ro_line_id?: string | null;
          source_subcontract_id?: string | null;
          standard_hours?: number | null;
          supplier_id?: string | null;
          unit_price?: number | null;
          updated_at?: string;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_package_id_fkey';
            columns: ['package_id'];
            isOneToOne: false;
            referencedRelation: 'service_packages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: false;
            referencedRelation: 'parts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: false;
            referencedRelation: 'v_part_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'invoice_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_source_quote_line_id_fkey';
            columns: ['source_quote_line_id'];
            isOneToOne: false;
            referencedRelation: 'quote_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_source_ro_consumable_id_fkey';
            columns: ['source_ro_consumable_id'];
            isOneToOne: false;
            referencedRelation: 'ro_consumables';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_source_ro_line_id_fkey';
            columns: ['source_ro_line_id'];
            isOneToOne: false;
            referencedRelation: 'ro_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_source_subcontract_id_fkey';
            columns: ['source_subcontract_id'];
            isOneToOne: false;
            referencedRelation: 'subcontracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_reminders: {
        Row: {
          id: string;
          invoice_id: string;
          sent_at: string;
          sent_by: string | null;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          sent_at?: string;
          sent_by?: string | null;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          sent_at?: string;
          sent_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_reminders_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_reminders_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_reminders_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_reminders_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_reminders_sent_by_fkey';
            columns: ['sent_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_repair_orders: {
        Row: {
          invoice_id: string;
          repair_order_id: string;
        };
        Insert: {
          invoice_id: string;
          repair_order_id: string;
        };
        Update: {
          invoice_id?: string;
          repair_order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_repair_orders_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_repair_orders_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_repair_orders_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_repair_orders_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_repair_orders_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_repair_orders_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'invoice_repair_orders_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      invoices: {
        Row: {
          client_address: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string | null;
          client_siret: string | null;
          client_vat_number: string | null;
          created_at: string;
          created_by: string | null;
          due_date: string | null;
          id: string;
          is_legacy_import: boolean;
          issued_at: string | null;
          issued_by: string | null;
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          mileage: number | null;
          number: string | null;
          pdf_file_id: string | null;
          public_token: string | null;
          rental_id: string | null;
          service_date: string | null;
          status: Database['public']['Enums']['invoice_status'];
          total_ht: number | null;
          total_ttc: number | null;
          total_vat: number | null;
          updated_at: string;
          vat_exempt: boolean;
          vat_exempt_mention: string | null;
          vehicle_label: string | null;
        };
        Insert: {
          client_address?: string | null;
          client_email?: string | null;
          client_id: string;
          client_name?: string | null;
          client_siret?: string | null;
          client_vat_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_date?: string | null;
          id?: string;
          is_legacy_import?: boolean;
          issued_at?: string | null;
          issued_by?: string | null;
          legacy_id?: string | null;
          maintenance_contract_id?: string | null;
          mileage?: number | null;
          number?: string | null;
          pdf_file_id?: string | null;
          public_token?: string | null;
          rental_id?: string | null;
          service_date?: string | null;
          status?: Database['public']['Enums']['invoice_status'];
          total_ht?: number | null;
          total_ttc?: number | null;
          total_vat?: number | null;
          updated_at?: string;
          vat_exempt?: boolean;
          vat_exempt_mention?: string | null;
          vehicle_label?: string | null;
        };
        Update: {
          client_address?: string | null;
          client_email?: string | null;
          client_id?: string;
          client_name?: string | null;
          client_siret?: string | null;
          client_vat_number?: string | null;
          created_at?: string;
          created_by?: string | null;
          due_date?: string | null;
          id?: string;
          is_legacy_import?: boolean;
          issued_at?: string | null;
          issued_by?: string | null;
          legacy_id?: string | null;
          maintenance_contract_id?: string | null;
          mileage?: number | null;
          number?: string | null;
          pdf_file_id?: string | null;
          public_token?: string | null;
          rental_id?: string | null;
          service_date?: string | null;
          status?: Database['public']['Enums']['invoice_status'];
          total_ht?: number | null;
          total_ttc?: number | null;
          total_vat?: number | null;
          updated_at?: string;
          vat_exempt?: boolean;
          vat_exempt_mention?: string | null;
          vehicle_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_issued_by_fkey';
            columns: ['issued_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'maintenance_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contract_vehicle_status';
            referencedColumns: ['contract_id'];
          },
          {
            foreignKeyName: 'invoices_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contracts_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_pdf_file_id_fkey';
            columns: ['pdf_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'rentals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'v_rentals_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      kiosk_failed_attempts: {
        Row: {
          attempted_at: string;
          attempted_by: string | null;
          id: number;
        };
        Insert: {
          attempted_at?: string;
          attempted_by?: string | null;
          id?: never;
        };
        Update: {
          attempted_at?: string;
          attempted_by?: string | null;
          id?: never;
        };
        Relationships: [];
      };
      kiosk_presence: {
        Row: {
          last_seen_at: string;
          profile_id: string;
        };
        Insert: {
          last_seen_at?: string;
          profile_id: string;
        };
        Update: {
          last_seen_at?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kiosk_presence_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      kiosk_secrets: {
        Row: {
          exit_code_hash: string | null;
          id: boolean;
          updated_at: string;
        };
        Insert: {
          exit_code_hash?: string | null;
          id?: boolean;
          updated_at?: string;
        };
        Update: {
          exit_code_hash?: string | null;
          id?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      knowledge_chunks: {
        Row: {
          content: string;
          document_id: string;
          id: string;
          page: number;
          position: number;
          tsv: unknown;
        };
        Insert: {
          content: string;
          document_id: string;
          id?: string;
          page: number;
          position?: number;
          tsv?: never;
        };
        Update: {
          content?: string;
          document_id?: string;
          id?: string;
          page?: number;
          position?: number;
          tsv?: never;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_chunks_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_documents: {
        Row: {
          chunks: number;
          created_at: string;
          created_by: string | null;
          error: string | null;
          file_id: string | null;
          id: string;
          pages: number | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          chunks?: number;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          file_id?: string | null;
          id?: string;
          pages?: number | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          chunks?: number;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          file_id?: string | null;
          id?: string;
          pages?: number | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_documents_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_documents_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      labor_rates: {
        Row: {
          category: Database['public']['Enums']['labor_category'];
          hourly_rate: number;
          label: string;
          labor_line_label: string;
          updated_at: string;
        };
        Insert: {
          category: Database['public']['Enums']['labor_category'];
          hourly_rate: number;
          label: string;
          labor_line_label: string;
          updated_at?: string;
        };
        Update: {
          category?: Database['public']['Enums']['labor_category'];
          hourly_rate?: number;
          label?: string;
          labor_line_label?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      leave_requests: {
        Row: {
          comment: string | null;
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          end_time: string | null;
          ends_on: string;
          id: string;
          is_deleted: boolean;
          leave_type: Database['public']['Enums']['leave_type'];
          legacy_id: string | null;
          start_time: string | null;
          starts_on: string;
          status: Database['public']['Enums']['leave_status'];
          technician_id: string;
          updated_at: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          end_time?: string | null;
          ends_on: string;
          id?: string;
          is_deleted?: boolean;
          leave_type: Database['public']['Enums']['leave_type'];
          legacy_id?: string | null;
          start_time?: string | null;
          starts_on: string;
          status?: Database['public']['Enums']['leave_status'];
          technician_id: string;
          updated_at?: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          end_time?: string | null;
          ends_on?: string;
          id?: string;
          is_deleted?: boolean;
          leave_type?: Database['public']['Enums']['leave_type'];
          legacy_id?: string | null;
          start_time?: string | null;
          starts_on?: string;
          status?: Database['public']['Enums']['leave_status'];
          technician_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'leave_requests_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leave_requests_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leave_requests_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
        ];
      };
      maintenance_contract_vehicles: {
        Row: {
          contract_id: string;
          start_mileage: number | null;
          vehicle_id: string;
        };
        Insert: {
          contract_id: string;
          start_mileage?: number | null;
          vehicle_id: string;
        };
        Update: {
          contract_id?: string;
          start_mileage?: number | null;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'maintenance_contract_vehicles_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'maintenance_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_contract_vehicles_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contract_vehicle_status';
            referencedColumns: ['contract_id'];
          },
          {
            foreignKeyName: 'maintenance_contract_vehicles_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contracts_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_contract_vehicles_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'maintenance_contract_vehicles_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_contract_vehicles_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      maintenance_contracts: {
        Row: {
          client_id: string;
          created_at: string;
          ended_on: string | null;
          frequency_km: number | null;
          frequency_months: number | null;
          id: string;
          is_active: boolean;
          legacy_id: string | null;
          monthly_price_ht: number | null;
          service_description: string;
          starts_on: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          ended_on?: string | null;
          frequency_km?: number | null;
          frequency_months?: number | null;
          id?: string;
          is_active?: boolean;
          legacy_id?: string | null;
          monthly_price_ht?: number | null;
          service_description?: string;
          starts_on?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          ended_on?: string | null;
          frequency_km?: number | null;
          frequency_months?: number | null;
          id?: string;
          is_active?: boolean;
          legacy_id?: string | null;
          monthly_price_ht?: number | null;
          service_description?: string;
          starts_on?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'maintenance_contracts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_contracts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_reads: {
        Row: {
          notification_id: string;
          profile_id: string;
          read_at: string;
        };
        Insert: {
          notification_id: string;
          profile_id: string;
          read_at?: string;
        };
        Update: {
          notification_id?: string;
          profile_id?: string;
          read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_reads_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notifications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_reads_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'v_my_notifications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_reads_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          dedupe_key: string | null;
          id: string;
          link: string | null;
          recipient_profile_id: string | null;
          recipient_role: Database['public']['Enums']['app_role'] | null;
          repair_order_id: string | null;
          title: string;
          type: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          link?: string | null;
          recipient_profile_id?: string | null;
          recipient_role?: Database['public']['Enums']['app_role'] | null;
          repair_order_id?: string | null;
          title: string;
          type: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          link?: string | null;
          recipient_profile_id?: string | null;
          recipient_role?: Database['public']['Enums']['app_role'] | null;
          repair_order_id?: string | null;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_recipient_profile_id_fkey';
            columns: ['recipient_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'notifications_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      parts: {
        Row: {
          brand: string | null;
          created_at: string;
          designation: string;
          id: string;
          is_active: boolean;
          is_tire: boolean;
          legacy_id: string | null;
          manufacturer_ref: string | null;
          margin_kind: Database['public']['Enums']['margin_kind'];
          margin_value: number | null;
          oem_ref: string | null;
          purchase_price: number | null;
          sale_price: number | null;
          shipping_cost: number | null;
          supplier_id: string | null;
          updated_at: string;
          vehicle_ref: string | null;
        };
        Insert: {
          brand?: string | null;
          created_at?: string;
          designation: string;
          id?: string;
          is_active?: boolean;
          is_tire?: boolean;
          legacy_id?: string | null;
          manufacturer_ref?: string | null;
          margin_kind?: Database['public']['Enums']['margin_kind'];
          margin_value?: number | null;
          oem_ref?: string | null;
          purchase_price?: number | null;
          sale_price?: number | null;
          shipping_cost?: number | null;
          supplier_id?: string | null;
          updated_at?: string;
          vehicle_ref?: string | null;
        };
        Update: {
          brand?: string | null;
          created_at?: string;
          designation?: string;
          id?: string;
          is_active?: boolean;
          is_tire?: boolean;
          legacy_id?: string | null;
          manufacturer_ref?: string | null;
          margin_kind?: Database['public']['Enums']['margin_kind'];
          margin_value?: number | null;
          oem_ref?: string | null;
          purchase_price?: number | null;
          sale_price?: number | null;
          shipping_cost?: number | null;
          supplier_id?: string | null;
          updated_at?: string;
          vehicle_ref?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'parts_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_ttc: number;
          created_at: string;
          id: string;
          invoice_id: string;
          method: Database['public']['Enums']['payment_method'];
          note: string | null;
          paid_on: string;
          recorded_by: string | null;
        };
        Insert: {
          amount_ttc: number;
          created_at?: string;
          id?: string;
          invoice_id: string;
          method: Database['public']['Enums']['payment_method'];
          note?: string | null;
          paid_on?: string;
          recorded_by?: string | null;
        };
        Update: {
          amount_ttc?: number;
          created_at?: string;
          id?: string;
          invoice_id?: string;
          method?: Database['public']['Enums']['payment_method'];
          note?: string | null;
          paid_on?: string;
          recorded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'payments_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'payments_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_recorded_by_fkey';
            columns: ['recorded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          role: Database['public']['Enums']['app_role'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          is_active?: boolean;
          role: Database['public']['Enums']['app_role'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          role?: Database['public']['Enums']['app_role'];
          updated_at?: string;
        };
        Relationships: [];
      };
      public_link_misses: {
        Row: {
          created_at: string;
          id: number;
          token_length: number;
          token_prefix: string;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          id?: never;
          token_length: number;
          token_prefix: string;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          token_length?: number;
          token_prefix?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      push_outbox: {
        Row: {
          attempts: number;
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
          not_before: string | null;
          profile_id: string;
          sent_at: string | null;
          tag: string | null;
          title: string;
        };
        Insert: {
          attempts?: number;
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          not_before?: string | null;
          profile_id: string;
          sent_at?: string | null;
          tag?: string | null;
          title: string;
        };
        Update: {
          attempts?: number;
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          not_before?: string | null;
          profile_id?: string;
          sent_at?: string | null;
          tag?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_outbox_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth_key: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_used_at: string | null;
          p256dh: string;
          profile_id: string;
          user_agent: string | null;
        };
        Insert: {
          auth_key: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          last_used_at?: string | null;
          p256dh: string;
          profile_id: string;
          user_agent?: string | null;
        };
        Update: {
          auth_key?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          last_used_at?: string | null;
          p256dh?: string;
          profile_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      quote_lines: {
        Row: {
          billed_hours: number | null;
          brand: string | null;
          created_at: string;
          description: string;
          discount_percent: number;
          done_line_decision: Database['public']['Enums']['done_line_decision'] | null;
          estimated_hours: number | null;
          id: string;
          labor_category: Database['public']['Enums']['labor_category'] | null;
          line_type: Database['public']['Enums']['line_type'];
          manufacturer_ref: string | null;
          net_ht: number | null;
          oem_ref: string | null;
          package_id: string | null;
          part_id: string | null;
          position: number;
          purchase_price: number | null;
          quantity: number;
          quote_id: string;
          section: Database['public']['Enums']['quote_section'];
          shipping_cost: number | null;
          source_ro_line_id: string | null;
          standard_hours: number | null;
          supplier_id: string | null;
          unit_price: number | null;
          updated_at: string;
          vat_rate: number;
        };
        Insert: {
          billed_hours?: number | null;
          brand?: string | null;
          created_at?: string;
          description?: string;
          discount_percent?: number;
          done_line_decision?: Database['public']['Enums']['done_line_decision'] | null;
          estimated_hours?: number | null;
          id?: string;
          labor_category?: Database['public']['Enums']['labor_category'] | null;
          line_type?: Database['public']['Enums']['line_type'];
          manufacturer_ref?: string | null;
          net_ht?: never;
          oem_ref?: string | null;
          package_id?: string | null;
          part_id?: string | null;
          position?: number;
          purchase_price?: number | null;
          quantity?: number;
          quote_id: string;
          section?: Database['public']['Enums']['quote_section'];
          shipping_cost?: number | null;
          source_ro_line_id?: string | null;
          standard_hours?: number | null;
          supplier_id?: string | null;
          unit_price?: number | null;
          updated_at?: string;
          vat_rate?: number;
        };
        Update: {
          billed_hours?: number | null;
          brand?: string | null;
          created_at?: string;
          description?: string;
          discount_percent?: number;
          done_line_decision?: Database['public']['Enums']['done_line_decision'] | null;
          estimated_hours?: number | null;
          id?: string;
          labor_category?: Database['public']['Enums']['labor_category'] | null;
          line_type?: Database['public']['Enums']['line_type'];
          manufacturer_ref?: string | null;
          net_ht?: never;
          oem_ref?: string | null;
          package_id?: string | null;
          part_id?: string | null;
          position?: number;
          purchase_price?: number | null;
          quantity?: number;
          quote_id?: string;
          section?: Database['public']['Enums']['quote_section'];
          shipping_cost?: number | null;
          source_ro_line_id?: string | null;
          standard_hours?: number | null;
          supplier_id?: string | null;
          unit_price?: number | null;
          updated_at?: string;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'quote_lines_package_id_fkey';
            columns: ['package_id'];
            isOneToOne: false;
            referencedRelation: 'service_packages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_lines_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: false;
            referencedRelation: 'parts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_lines_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: false;
            referencedRelation: 'v_part_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_lines_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_lines_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quote_totals';
            referencedColumns: ['quote_id'];
          },
          {
            foreignKeyName: 'quote_lines_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quotes_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_lines_source_ro_line_id_fkey';
            columns: ['source_ro_line_id'];
            isOneToOne: false;
            referencedRelation: 'ro_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_lines_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      quotes: {
        Row: {
          accepted_at: string | null;
          accepted_by_name: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          issued_at: string | null;
          legacy_id: string | null;
          merged_into_repair_order_id: string | null;
          notes: string | null;
          number: string | null;
          public_token: string | null;
          refused_at: string | null;
          repair_order_id: string | null;
          response_processed_at: string | null;
          resulting_repair_order_id: string | null;
          sent_at: string | null;
          signature_file_id: string | null;
          status: Database['public']['Enums']['quote_status'];
          updated_at: string;
          valid_until: string | null;
          vehicle_id: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by_name?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          issued_at?: string | null;
          legacy_id?: string | null;
          merged_into_repair_order_id?: string | null;
          notes?: string | null;
          number?: string | null;
          public_token?: string | null;
          refused_at?: string | null;
          repair_order_id?: string | null;
          response_processed_at?: string | null;
          resulting_repair_order_id?: string | null;
          sent_at?: string | null;
          signature_file_id?: string | null;
          status?: Database['public']['Enums']['quote_status'];
          updated_at?: string;
          valid_until?: string | null;
          vehicle_id?: string | null;
          vehicle_type?: Database['public']['Enums']['vehicle_type'];
        };
        Update: {
          accepted_at?: string | null;
          accepted_by_name?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          issued_at?: string | null;
          legacy_id?: string | null;
          merged_into_repair_order_id?: string | null;
          notes?: string | null;
          number?: string | null;
          public_token?: string | null;
          refused_at?: string | null;
          repair_order_id?: string | null;
          response_processed_at?: string | null;
          resulting_repair_order_id?: string | null;
          sent_at?: string | null;
          signature_file_id?: string | null;
          status?: Database['public']['Enums']['quote_status'];
          updated_at?: string;
          valid_until?: string | null;
          vehicle_id?: string | null;
          vehicle_type?: Database['public']['Enums']['vehicle_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'quotes_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_merged_into_repair_order_id_fkey';
            columns: ['merged_into_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_merged_into_repair_order_id_fkey';
            columns: ['merged_into_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'quotes_merged_into_repair_order_id_fkey';
            columns: ['merged_into_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'quotes_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_resulting_repair_order_id_fkey';
            columns: ['resulting_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_resulting_repair_order_id_fkey';
            columns: ['resulting_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'quotes_resulting_repair_order_id_fkey';
            columns: ['resulting_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_signature_file_id_fkey';
            columns: ['signature_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'quotes_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      rental_damages: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          label: string;
          phase: Database['public']['Enums']['rental_phase'];
          photo_file_id: string | null;
          rental_id: string;
          x: number;
          y: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label: string;
          phase: Database['public']['Enums']['rental_phase'];
          photo_file_id?: string | null;
          rental_id: string;
          x: number;
          y: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string;
          phase?: Database['public']['Enums']['rental_phase'];
          photo_file_id?: string | null;
          rental_id?: string;
          x?: number;
          y?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rental_damages_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rental_damages_photo_file_id_fkey';
            columns: ['photo_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rental_damages_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'rentals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rental_damages_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'v_rentals_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      rental_inspections: {
        Row: {
          clean: boolean | null;
          equipment: string[];
          fuel_eighths: number | null;
          id: string;
          inspected_at: string;
          inspected_by: string | null;
          mileage: number | null;
          notes: string | null;
          phase: Database['public']['Enums']['rental_phase'];
          rental_id: string;
          updated_at: string;
        };
        Insert: {
          clean?: boolean | null;
          equipment?: string[];
          fuel_eighths?: number | null;
          id?: string;
          inspected_at?: string;
          inspected_by?: string | null;
          mileage?: number | null;
          notes?: string | null;
          phase: Database['public']['Enums']['rental_phase'];
          rental_id: string;
          updated_at?: string;
        };
        Update: {
          clean?: boolean | null;
          equipment?: string[];
          fuel_eighths?: number | null;
          id?: string;
          inspected_at?: string;
          inspected_by?: string | null;
          mileage?: number | null;
          notes?: string | null;
          phase?: Database['public']['Enums']['rental_phase'];
          rental_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rental_inspections_inspected_by_fkey';
            columns: ['inspected_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rental_inspections_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'rentals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rental_inspections_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'v_rentals_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      rental_photos: {
        Row: {
          created_at: string;
          created_by: string | null;
          file_id: string;
          id: string;
          phase: Database['public']['Enums']['rental_phase'];
          rental_id: string;
          slot: Database['public']['Enums']['rental_photo_slot'];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          file_id: string;
          id?: string;
          phase: Database['public']['Enums']['rental_phase'];
          rental_id: string;
          slot: Database['public']['Enums']['rental_photo_slot'];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          file_id?: string;
          id?: string;
          phase?: Database['public']['Enums']['rental_phase'];
          rental_id?: string;
          slot?: Database['public']['Enums']['rental_photo_slot'];
        };
        Relationships: [
          {
            foreignKeyName: 'rental_photos_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rental_photos_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rental_photos_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'rentals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rental_photos_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'v_rentals_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      rental_sequences: {
        Row: {
          kind: Database['public']['Enums']['rental_kind'];
          last_value: number;
          year: number;
        };
        Insert: {
          kind: Database['public']['Enums']['rental_kind'];
          last_value?: number;
          year: number;
        };
        Update: {
          kind?: Database['public']['Enums']['rental_kind'];
          last_value?: number;
          year?: number;
        };
        Relationships: [];
      };
      rentals: {
        Row: {
          billable: boolean;
          cleaning_fee: number | null;
          client_id: string;
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          departed_at: string | null;
          departure_at: string;
          departure_invoice_id: string | null;
          departure_invoiced_periods: number | null;
          deposit: number;
          deposit_mode: string | null;
          discount_percent: number;
          driving_license_id: string | null;
          extra_km_price: number | null;
          fleet_vehicle_id: string;
          franchise: number | null;
          fuel_price_per_liter: number | null;
          id: string;
          invoice_id: string | null;
          kind: Database['public']['Enums']['rental_kind'];
          km_included: number | null;
          late_fee_per_hour: number | null;
          notes: string | null;
          number: string;
          periods: number;
          planned_return_at: string;
          public_token: string | null;
          rate_period: string;
          renewals: number;
          repair_order_id: string | null;
          returned_at: string | null;
          signature_file_id: string | null;
          signed_at: string | null;
          status: Database['public']['Enums']['rental_status'];
          tacit_renewal: boolean;
          terms_accepted: boolean;
          unit_price: number;
          updated_at: string;
          rental_public_json: Json | null;
        };
        Insert: {
          billable?: boolean;
          cleaning_fee?: number | null;
          client_id: string;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          departed_at?: string | null;
          departure_at: string;
          departure_invoice_id?: string | null;
          departure_invoiced_periods?: number | null;
          deposit?: number;
          deposit_mode?: string | null;
          discount_percent?: number;
          driving_license_id?: string | null;
          extra_km_price?: number | null;
          fleet_vehicle_id: string;
          franchise?: number | null;
          fuel_price_per_liter?: number | null;
          id?: string;
          invoice_id?: string | null;
          kind?: Database['public']['Enums']['rental_kind'];
          km_included?: number | null;
          late_fee_per_hour?: number | null;
          notes?: string | null;
          number: string;
          periods?: number;
          planned_return_at: string;
          public_token?: string | null;
          rate_period?: string;
          renewals?: number;
          repair_order_id?: string | null;
          returned_at?: string | null;
          signature_file_id?: string | null;
          signed_at?: string | null;
          status?: Database['public']['Enums']['rental_status'];
          tacit_renewal?: boolean;
          terms_accepted?: boolean;
          unit_price?: number;
          updated_at?: string;
        };
        Update: {
          billable?: boolean;
          cleaning_fee?: number | null;
          client_id?: string;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          departed_at?: string | null;
          departure_at?: string;
          departure_invoice_id?: string | null;
          departure_invoiced_periods?: number | null;
          deposit?: number;
          deposit_mode?: string | null;
          discount_percent?: number;
          driving_license_id?: string | null;
          extra_km_price?: number | null;
          fleet_vehicle_id?: string;
          franchise?: number | null;
          fuel_price_per_liter?: number | null;
          id?: string;
          invoice_id?: string | null;
          kind?: Database['public']['Enums']['rental_kind'];
          km_included?: number | null;
          late_fee_per_hour?: number | null;
          notes?: string | null;
          number?: string;
          periods?: number;
          planned_return_at?: string;
          public_token?: string | null;
          rate_period?: string;
          renewals?: number;
          repair_order_id?: string | null;
          returned_at?: string | null;
          signature_file_id?: string | null;
          signed_at?: string | null;
          status?: Database['public']['Enums']['rental_status'];
          tacit_renewal?: boolean;
          terms_accepted?: boolean;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rentals_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_departure_invoice_id_fkey';
            columns: ['departure_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_departure_invoice_id_fkey';
            columns: ['departure_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'rentals_departure_invoice_id_fkey';
            columns: ['departure_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'rentals_departure_invoice_id_fkey';
            columns: ['departure_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_driving_license_id_fkey';
            columns: ['driving_license_id'];
            isOneToOne: false;
            referencedRelation: 'driving_licenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_fleet_vehicle_id_fkey';
            columns: ['fleet_vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'fleet_vehicles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'rentals_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'rentals_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'rentals_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_signature_file_id_fkey';
            columns: ['signature_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      repair_order_seen: {
        Row: {
          profile_id: string;
          repair_order_id: string;
          seen_at: string;
        };
        Insert: {
          profile_id: string;
          repair_order_id: string;
          seen_at?: string;
        };
        Update: {
          profile_id?: string;
          repair_order_id?: string;
          seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'repair_order_seen_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_order_seen_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_order_seen_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'repair_order_seen_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      repair_orders: {
        Row: {
          appointment_id: string | null;
          assignment_changed_at: string;
          client_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_signature_file_id: string | null;
          id: string;
          inspection_required: boolean;
          intervention_type: Database['public']['Enums']['intervention_type'];
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          mileage: number | null;
          number: string;
          origin_quote_id: string | null;
          origin_repair_order_id: string | null;
          planned_date: string | null;
          planned_end: string | null;
          planned_start: string | null;
          pre_quote_work_settled_at: string | null;
          requested_work: string;
          roadside_address: string | null;
          roadside_km: number | null;
          roadside_travel_hours: number | null;
          status: Database['public']['Enums']['repair_order_status'];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Insert: {
          appointment_id?: string | null;
          assignment_changed_at?: string;
          client_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_signature_file_id?: string | null;
          id?: string;
          inspection_required?: boolean;
          intervention_type?: Database['public']['Enums']['intervention_type'];
          legacy_id?: string | null;
          maintenance_contract_id?: string | null;
          mileage?: number | null;
          number: string;
          origin_quote_id?: string | null;
          origin_repair_order_id?: string | null;
          planned_date?: string | null;
          planned_end?: string | null;
          planned_start?: string | null;
          pre_quote_work_settled_at?: string | null;
          requested_work?: string;
          roadside_address?: string | null;
          roadside_km?: number | null;
          roadside_travel_hours?: number | null;
          status?: Database['public']['Enums']['repair_order_status'];
          technician_id?: string | null;
          updated_at?: string;
          vehicle_id: string;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Update: {
          appointment_id?: string | null;
          assignment_changed_at?: string;
          client_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_signature_file_id?: string | null;
          id?: string;
          inspection_required?: boolean;
          intervention_type?: Database['public']['Enums']['intervention_type'];
          legacy_id?: string | null;
          maintenance_contract_id?: string | null;
          mileage?: number | null;
          number?: string;
          origin_quote_id?: string | null;
          origin_repair_order_id?: string | null;
          planned_date?: string | null;
          planned_end?: string | null;
          planned_start?: string | null;
          pre_quote_work_settled_at?: string | null;
          requested_work?: string;
          roadside_address?: string | null;
          roadside_km?: number | null;
          roadside_travel_hours?: number | null;
          status?: Database['public']['Enums']['repair_order_status'];
          technician_id?: string | null;
          updated_at?: string;
          vehicle_id?: string;
          vehicle_type?: Database['public']['Enums']['vehicle_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'repair_orders_appointment_fk';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_appointment_fk';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'v_appointments_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_contract_fk';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'maintenance_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_contract_fk';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contract_vehicle_status';
            referencedColumns: ['contract_id'];
          },
          {
            foreignKeyName: 'repair_orders_contract_fk';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contracts_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_customer_signature_file_id_fkey';
            columns: ['customer_signature_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_quote_fk';
            columns: ['origin_quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_quote_fk';
            columns: ['origin_quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quote_totals';
            referencedColumns: ['quote_id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_quote_fk';
            columns: ['origin_quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quotes_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_repair_order_id_fkey';
            columns: ['origin_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_repair_order_id_fkey';
            columns: ['origin_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_repair_order_id_fkey';
            columns: ['origin_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'repair_orders_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      ro_consumables: {
        Row: {
          consumable_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          quantity: number;
          repair_order_id: string;
          unit: string;
          unit_purchase_price: number;
          unit_sale_price: number;
        };
        Insert: {
          consumable_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          quantity: number;
          repair_order_id: string;
          unit: string;
          unit_purchase_price: number;
          unit_sale_price: number;
        };
        Update: {
          consumable_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          quantity?: number;
          repair_order_id?: string;
          unit?: string;
          unit_purchase_price?: number;
          unit_sale_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'ro_consumables_consumable_id_fkey';
            columns: ['consumable_id'];
            isOneToOne: false;
            referencedRelation: 'consumables';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_consumables_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_consumables_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_consumables_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'ro_consumables_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      ro_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: string;
          label: string;
          repair_order_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          label: string;
          repair_order_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          label?: string;
          repair_order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ro_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_events_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_events_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'ro_events_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      ro_lines: {
        Row: {
          billed_hours: number | null;
          brand: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          discount_percent: number;
          estimate_is_minimum: boolean;
          estimated_hours: number | null;
          id: string;
          kind: Database['public']['Enums']['ro_line_kind'];
          labor_category: Database['public']['Enums']['labor_category'] | null;
          line_type: Database['public']['Enums']['line_type'];
          manufacturer_ref: string | null;
          oem_ref: string | null;
          order_status: Database['public']['Enums']['part_order_status'] | null;
          package_id: string | null;
          part_id: string | null;
          position: number;
          purchase_price: number | null;
          quantity: number;
          repair_order_id: string;
          shipping_cost: number | null;
          source_quote_line_id: string | null;
          standard_hours: number | null;
          supplier_id: string | null;
          technician_id: string | null;
          unit_price: number | null;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          billed_hours?: number | null;
          brand?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          discount_percent?: number;
          estimate_is_minimum?: boolean;
          estimated_hours?: number | null;
          id?: string;
          kind: Database['public']['Enums']['ro_line_kind'];
          labor_category?: Database['public']['Enums']['labor_category'] | null;
          line_type?: Database['public']['Enums']['line_type'];
          manufacturer_ref?: string | null;
          oem_ref?: string | null;
          order_status?: Database['public']['Enums']['part_order_status'] | null;
          package_id?: string | null;
          part_id?: string | null;
          position?: number;
          purchase_price?: number | null;
          quantity?: number;
          repair_order_id: string;
          shipping_cost?: number | null;
          source_quote_line_id?: string | null;
          standard_hours?: number | null;
          supplier_id?: string | null;
          technician_id?: string | null;
          unit_price?: number | null;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          billed_hours?: number | null;
          brand?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          discount_percent?: number;
          estimate_is_minimum?: boolean;
          estimated_hours?: number | null;
          id?: string;
          kind?: Database['public']['Enums']['ro_line_kind'];
          labor_category?: Database['public']['Enums']['labor_category'] | null;
          line_type?: Database['public']['Enums']['line_type'];
          manufacturer_ref?: string | null;
          oem_ref?: string | null;
          order_status?: Database['public']['Enums']['part_order_status'] | null;
          package_id?: string | null;
          part_id?: string | null;
          position?: number;
          purchase_price?: number | null;
          quantity?: number;
          repair_order_id?: string;
          shipping_cost?: number | null;
          source_quote_line_id?: string | null;
          standard_hours?: number | null;
          supplier_id?: string | null;
          technician_id?: string | null;
          unit_price?: number | null;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ro_lines_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_lines_package_id_fkey';
            columns: ['package_id'];
            isOneToOne: false;
            referencedRelation: 'service_packages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_lines_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: false;
            referencedRelation: 'parts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_lines_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: false;
            referencedRelation: 'v_part_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'ro_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_lines_source_quote_line_fk';
            columns: ['source_quote_line_id'];
            isOneToOne: false;
            referencedRelation: 'quote_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_lines_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_lines_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
        ];
      };
      ro_photos: {
        Row: {
          created_by: string | null;
          file_id: string;
          id: string;
          label: string;
          repair_order_id: string;
          taken_at: string;
        };
        Insert: {
          created_by?: string | null;
          file_id: string;
          id?: string;
          label: string;
          repair_order_id: string;
          taken_at?: string;
        };
        Update: {
          created_by?: string | null;
          file_id?: string;
          id?: string;
          label?: string;
          repair_order_id?: string;
          taken_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ro_photos_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_photos_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_photos_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ro_photos_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'ro_photos_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      service_packages: {
        Row: {
          category: Database['public']['Enums']['labor_category'] | null;
          created_at: string;
          details: string | null;
          id: string;
          is_active: boolean;
          keywords: string[];
          legacy_id: string | null;
          name: string;
          price: number | null;
          quote_only: boolean;
          standard_hours: number;
          trigger_fields: string[];
          updated_at: string;
        };
        Insert: {
          category?: Database['public']['Enums']['labor_category'] | null;
          created_at?: string;
          details?: string | null;
          id?: string;
          is_active?: boolean;
          keywords?: string[];
          legacy_id?: string | null;
          name: string;
          price?: number | null;
          quote_only?: boolean;
          standard_hours: number;
          trigger_fields?: string[];
          updated_at?: string;
        };
        Update: {
          category?: Database['public']['Enums']['labor_category'] | null;
          created_at?: string;
          details?: string | null;
          id?: string;
          is_active?: boolean;
          keywords?: string[];
          legacy_id?: string | null;
          name?: string;
          price?: number | null;
          quote_only?: boolean;
          standard_hours?: number;
          trigger_fields?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      signature_requests: {
        Row: {
          channel: Database['public']['Enums']['signature_channel'];
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          public_token: string | null;
          quote_id: string | null;
          rental_id: string | null;
          repair_order_id: string | null;
          signature_file_id: string | null;
          signed_at: string | null;
          signer_name: string | null;
          status: Database['public']['Enums']['signature_request_status'];
          signature_request_json: Json | null;
        };
        Insert: {
          channel: Database['public']['Enums']['signature_channel'];
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          public_token?: string | null;
          quote_id?: string | null;
          rental_id?: string | null;
          repair_order_id?: string | null;
          signature_file_id?: string | null;
          signed_at?: string | null;
          signer_name?: string | null;
          status?: Database['public']['Enums']['signature_request_status'];
        };
        Update: {
          channel?: Database['public']['Enums']['signature_channel'];
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          public_token?: string | null;
          quote_id?: string | null;
          rental_id?: string | null;
          repair_order_id?: string | null;
          signature_file_id?: string | null;
          signed_at?: string | null;
          signer_name?: string | null;
          status?: Database['public']['Enums']['signature_request_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'signature_requests_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quote_totals';
            referencedColumns: ['quote_id'];
          },
          {
            foreignKeyName: 'signature_requests_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quotes_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'rentals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_rental_id_fkey';
            columns: ['rental_id'];
            isOneToOne: false;
            referencedRelation: 'v_rentals_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'signature_requests_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_signature_file_id_fkey';
            columns: ['signature_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      subcontracts: {
        Row: {
          cost_ht: number;
          created_at: string;
          expected_return_on: string | null;
          id: string;
          margin_percent: number;
          repair_order_id: string;
          resale_price_ht: number | null;
          returned_on: string | null;
          sent_on: string;
          service: string;
          status: Database['public']['Enums']['subcontract_status'];
          supplier_id: string;
          updated_at: string;
        };
        Insert: {
          cost_ht?: number;
          created_at?: string;
          expected_return_on?: string | null;
          id?: string;
          margin_percent?: number;
          repair_order_id: string;
          resale_price_ht?: never;
          returned_on?: string | null;
          sent_on?: string;
          service: string;
          status?: Database['public']['Enums']['subcontract_status'];
          supplier_id: string;
          updated_at?: string;
        };
        Update: {
          cost_ht?: number;
          created_at?: string;
          expected_return_on?: string | null;
          id?: string;
          margin_percent?: number;
          repair_order_id?: string;
          resale_price_ht?: never;
          returned_on?: string | null;
          sent_on?: string;
          service?: string;
          status?: Database['public']['Enums']['subcontract_status'];
          supplier_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subcontracts_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subcontracts_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'subcontracts_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subcontracts_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      suppliers: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          name_key: string | null;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          name_key?: never;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          name_key?: never;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      technician_pins: {
        Row: {
          algorithm: string;
          pin_hash: string;
          set_at: string;
          technician_id: string;
        };
        Insert: {
          algorithm?: string;
          pin_hash: string;
          set_at?: string;
          technician_id: string;
        };
        Update: {
          algorithm?: string;
          pin_hash?: string;
          set_at?: string;
          technician_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'technician_pins_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: true;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
        ];
      };
      technicians: {
        Row: {
          color: string | null;
          created_at: string;
          display_name: string;
          exclude_from_planning: boolean;
          id: string;
          is_active: boolean;
          legacy_email: string | null;
          profile_id: string | null;
          rest_group: Database['public']['Enums']['rest_group'] | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          display_name: string;
          exclude_from_planning?: boolean;
          id?: string;
          is_active?: boolean;
          legacy_email?: string | null;
          profile_id?: string | null;
          rest_group?: Database['public']['Enums']['rest_group'] | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          display_name?: string;
          exclude_from_planning?: boolean;
          id?: string;
          is_active?: boolean;
          legacy_email?: string | null;
          profile_id?: string | null;
          rest_group?: Database['public']['Enums']['rest_group'] | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'technicians_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      time_entries: {
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
          repair_order_id: string;
          started_at: string;
          stopped_by: string | null;
          technician_id: string | null;
        };
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          repair_order_id: string;
          started_at?: string;
          stopped_by?: string | null;
          technician_id?: string | null;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          repair_order_id?: string;
          started_at?: string;
          stopped_by?: string | null;
          technician_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'time_entries_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_entries_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'time_entries_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_entries_stopped_by_fkey';
            columns: ['stopped_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_entries_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
        ];
      };
      tire_brands: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          name_key: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          name_key?: never;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          name_key?: never;
          updated_at?: string;
        };
        Relationships: [];
      };
      tire_lines: {
        Row: {
          category: Database['public']['Enums']['tire_category'];
          created_at: string;
          id: string;
          min_qty: number;
          profile: Database['public']['Enums']['tire_profile'];
          size: string;
          size_key: string | null;
          updated_at: string;
        };
        Insert: {
          category: Database['public']['Enums']['tire_category'];
          created_at?: string;
          id?: string;
          min_qty?: number;
          profile: Database['public']['Enums']['tire_profile'];
          size: string;
          size_key?: never;
          updated_at?: string;
        };
        Update: {
          category?: Database['public']['Enums']['tire_category'];
          created_at?: string;
          id?: string;
          min_qty?: number;
          profile?: Database['public']['Enums']['tire_profile'];
          size?: string;
          size_key?: never;
          updated_at?: string;
        };
        Relationships: [];
      };
      tire_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_id: string | null;
          note: string | null;
          quantity: number;
          reason: Database['public']['Enums']['tire_movement_reason'];
          reference: string | null;
          repair_order_id: string | null;
          supplier_id: string | null;
          tire_id: string;
          unit_purchase_price: number | null;
          unit_sale_price: number | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          note?: string | null;
          quantity: number;
          reason: Database['public']['Enums']['tire_movement_reason'];
          reference?: string | null;
          repair_order_id?: string | null;
          supplier_id?: string | null;
          tire_id: string;
          unit_purchase_price?: number | null;
          unit_sale_price?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          note?: string | null;
          quantity?: number;
          reason?: Database['public']['Enums']['tire_movement_reason'];
          reference?: string | null;
          repair_order_id?: string | null;
          supplier_id?: string | null;
          tire_id?: string;
          unit_purchase_price?: number | null;
          unit_sale_price?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tire_movements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tire_movements_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tire_movements_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'tire_movements_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'tire_movements_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tire_movements_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tire_movements_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'tire_movements_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tire_movements_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tire_movements_tire_id_fkey';
            columns: ['tire_id'];
            isOneToOne: false;
            referencedRelation: 'tires';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tire_movements_tire_id_fkey';
            columns: ['tire_id'];
            isOneToOne: false;
            referencedRelation: 'v_tire_lots';
            referencedColumns: ['id'];
          },
        ];
      };
      tire_quote_requests: {
        Row: {
          body: string;
          channel: string;
          id: string;
          lines: NonNullable<Json>;
          recipients: string[];
          sent_at: string;
          sent_by: string | null;
          subject: string;
        };
        Insert: {
          body: string;
          channel?: string;
          id?: string;
          lines: NonNullable<Json>;
          recipients?: string[];
          sent_at?: string;
          sent_by?: string | null;
          subject: string;
        };
        Update: {
          body?: string;
          channel?: string;
          id?: string;
          lines?: NonNullable<Json>;
          recipients?: string[];
          sent_at?: string;
          sent_by?: string | null;
          subject?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tire_quote_requests_sent_by_fkey';
            columns: ['sent_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      tires: {
        Row: {
          brand_id: string;
          condition: Database['public']['Enums']['tire_condition'];
          created_at: string;
          dot: string | null;
          id: string;
          is_active: boolean;
          line_id: string;
          load_index: string | null;
          location: string | null;
          model: string;
          part_id: string | null;
          purchase_price: number | null;
          sale_price: number | null;
          stock_qty: number;
          supplier_id: string | null;
          updated_at: string;
        };
        Insert: {
          brand_id: string;
          condition?: Database['public']['Enums']['tire_condition'];
          created_at?: string;
          dot?: string | null;
          id?: string;
          is_active?: boolean;
          line_id: string;
          load_index?: string | null;
          location?: string | null;
          model?: string;
          part_id?: string | null;
          purchase_price?: number | null;
          sale_price?: number | null;
          stock_qty?: number;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          brand_id?: string;
          condition?: Database['public']['Enums']['tire_condition'];
          created_at?: string;
          dot?: string | null;
          id?: string;
          is_active?: boolean;
          line_id?: string;
          load_index?: string | null;
          location?: string | null;
          model?: string;
          part_id?: string | null;
          purchase_price?: number | null;
          sale_price?: number | null;
          stock_qty?: number;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tires_brand_id_fkey';
            columns: ['brand_id'];
            isOneToOne: false;
            referencedRelation: 'tire_brands';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_line_id_fkey';
            columns: ['line_id'];
            isOneToOne: false;
            referencedRelation: 'tire_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_line_id_fkey';
            columns: ['line_id'];
            isOneToOne: false;
            referencedRelation: 'v_tire_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: true;
            referencedRelation: 'parts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: true;
            referencedRelation: 'v_part_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      tts_usage: {
        Row: {
          characters: number;
          month: string;
          updated_at: string;
        };
        Insert: {
          characters?: number;
          month: string;
          updated_at?: string;
        };
        Update: {
          characters?: number;
          month?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          antipollution_due_date: string | null;
          archived_at: string | null;
          brand: string | null;
          client_id: string | null;
          created_at: string;
          ct_due_date: string | null;
          first_registration_date: string | null;
          id: string;
          model: string | null;
          notes: string | null;
          plate: string;
          plate_key: string | null;
          registration_doc_file_id: string | null;
          tailgate_due_date: string | null;
          updated_at: string;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
          vin: string | null;
        };
        Insert: {
          antipollution_due_date?: string | null;
          archived_at?: string | null;
          brand?: string | null;
          client_id?: string | null;
          created_at?: string;
          ct_due_date?: string | null;
          first_registration_date?: string | null;
          id?: string;
          model?: string | null;
          notes?: string | null;
          plate: string;
          plate_key?: never;
          registration_doc_file_id?: string | null;
          tailgate_due_date?: string | null;
          updated_at?: string;
          vehicle_type?: Database['public']['Enums']['vehicle_type'];
          vin?: string | null;
        };
        Update: {
          antipollution_due_date?: string | null;
          archived_at?: string | null;
          brand?: string | null;
          client_id?: string | null;
          created_at?: string;
          ct_due_date?: string | null;
          first_registration_date?: string | null;
          id?: string;
          model?: string | null;
          notes?: string | null;
          plate?: string;
          plate_key?: never;
          registration_doc_file_id?: string | null;
          tailgate_due_date?: string | null;
          updated_at?: string;
          vehicle_type?: Database['public']['Enums']['vehicle_type'];
          vin?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicles_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicles_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicles_registration_doc_file_id_fkey';
            columns: ['registration_doc_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      warranty_claims: {
        Row: {
          amount_ht: number | null;
          brand: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          legacy_id: string | null;
          notes: string | null;
          part_name: string;
          reason: string | null;
          reference: string | null;
          repair_order_id: string | null;
          ro_line_id: string | null;
          status: Database['public']['Enums']['warranty_status'];
          supplier_id: string | null;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          amount_ht?: number | null;
          brand?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legacy_id?: string | null;
          notes?: string | null;
          part_name: string;
          reason?: string | null;
          reference?: string | null;
          repair_order_id?: string | null;
          ro_line_id?: string | null;
          status?: Database['public']['Enums']['warranty_status'];
          supplier_id?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          amount_ht?: number | null;
          brand?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legacy_id?: string | null;
          notes?: string | null;
          part_name?: string;
          reason?: string | null;
          reference?: string | null;
          repair_order_id?: string | null;
          ro_line_id?: string | null;
          status?: Database['public']['Enums']['warranty_status'];
          supplier_id?: string | null;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'warranty_claims_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'warranty_claims_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_ro_line_id_fkey';
            columns: ['ro_line_id'];
            isOneToOne: false;
            referencedRelation: 'ro_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'warranty_claims_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      v_appointments_overview: {
        Row: {
          client_id: string | null;
          client_name: string | null;
          created_at: string | null;
          created_by: string | null;
          end_time: string | null;
          id: string | null;
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          plate: string | null;
          reason: string | null;
          reminder_sent_at: string | null;
          repair_order_id: string | null;
          repair_order_number: string | null;
          scheduled_date: string | null;
          start_time: string | null;
          status: Database['public']['Enums']['appointment_status'] | null;
          technician_color: string | null;
          technician_id: string | null;
          technician_name: string | null;
          updated_at: string | null;
          vehicle_id: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'appointments_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'maintenance_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contract_vehicle_status';
            referencedColumns: ['contract_id'];
          },
          {
            foreignKeyName: 'appointments_maintenance_contract_id_fkey';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contracts_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'appointments_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'appointments_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'appointments_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      v_clients_overview: {
        Row: {
          account_type: string | null;
          archived_at: string | null;
          balance_due: number | null;
          billing_address: string | null;
          birth_date: string | null;
          birth_place: string | null;
          civility: string | null;
          contact_name: string | null;
          created_at: string | null;
          discount_percent: number | null;
          email: string | null;
          first_name: string | null;
          hourly_rate: number | null;
          id: string | null;
          kind: Database['public']['Enums']['client_kind'] | null;
          last_name: string | null;
          last_visit: string | null;
          legacy_key: string | null;
          name: string | null;
          name_key: string | null;
          notes: string | null;
          orders_count: number | null;
          other_phones: Json | null;
          overdue_invoices_count: number | null;
          phone: string | null;
          portal_token: string | null;
          revenue_ht: number | null;
          siret: string | null;
          updated_at: string | null;
          vehicles_count: number | null;
        };
        Relationships: [];
      };
      v_contract_vehicle_status: {
        Row: {
          appointment_planned: boolean | null;
          client_id: string | null;
          contract_id: string | null;
          current_mileage: number | null;
          km_since_service: number | null;
          last_service_at: string | null;
          last_service_mileage: number | null;
          plate: string | null;
          service_due: boolean | null;
          vehicle_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'maintenance_contract_vehicles_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'maintenance_contract_vehicles_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_contract_vehicles_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_contracts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_contracts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      v_contracts_overview: {
        Row: {
          client_id: string | null;
          client_name: string | null;
          created_at: string | null;
          ended_on: string | null;
          frequency_km: number | null;
          frequency_months: number | null;
          id: string | null;
          is_active: boolean | null;
          legacy_id: string | null;
          monthly_price_ht: number | null;
          service_description: string | null;
          starts_on: string | null;
          updated_at: string | null;
          vehicles: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'maintenance_contracts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_contracts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      v_daily_attendance: {
        Row: {
          anomalies: number | null;
          first_in: string | null;
          late_minutes: number | null;
          open_session: boolean | null;
          overtime_seconds: number | null;
          technician_id: string | null;
          work_date: string | null;
          worked_seconds: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'clock_events_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
        ];
      };
      v_invoice_balances: {
        Row: {
          balance_due: number | null;
          client_id: string | null;
          client_name: string | null;
          credited_ttc: number | null;
          due_date: string | null;
          invoice_id: string | null;
          issued_at: string | null;
          last_paid_on: string | null;
          number: string | null;
          paid_ttc: number | null;
          payment_status: string | null;
          total_ht: number | null;
          total_ttc: number | null;
          vehicle_label: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      v_invoice_line_economics: {
        Row: {
          billed_hours: number | null;
          client_id: string | null;
          invoice_id: string | null;
          invoice_number: string | null;
          issued_at: string | null;
          labor_ht: number | null;
          line_type: Database['public']['Enums']['line_type'] | null;
          net_ht: number | null;
          parts_ht: number | null;
          parts_margin_ht: number | null;
          repair_order_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'invoice_lines_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'invoice_lines_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      v_invoice_totals: {
        Row: {
          invoice_id: string | null;
          total_ht: number | null;
          total_ttc: number | null;
          total_vat: number | null;
        };
        Relationships: [];
      };
      v_invoices_overview: {
        Row: {
          balance_due: number | null;
          client_address: string | null;
          client_id: string | null;
          client_name: string | null;
          client_siret: string | null;
          client_vat_number: string | null;
          created_at: string | null;
          credited_ttc: number | null;
          due_date: string | null;
          id: string | null;
          issued_at: string | null;
          last_paid_on: string | null;
          last_reminder_at: string | null;
          mileage: number | null;
          number: string | null;
          paid_ttc: number | null;
          payment_status: string | null;
          public_token: string | null;
          reminders_count: number | null;
          repair_order_ids: string[] | null;
          repair_order_numbers: string[] | null;
          service_date: string | null;
          status: Database['public']['Enums']['invoice_status'] | null;
          total_ht: number | null;
          total_ttc: number | null;
          total_vat: number | null;
          vat_exempt: boolean | null;
          vat_exempt_mention: string | null;
          vehicle_label: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      v_monthly_revenue: {
        Row: {
          invoice_count: number | null;
          labor_ht: number | null;
          month: string | null;
          parts_ht: number | null;
          parts_margin_ht: number | null;
          total_ht: number | null;
        };
        Relationships: [];
      };
      v_my_notifications: {
        Row: {
          body: string | null;
          created_at: string | null;
          dedupe_key: string | null;
          id: string | null;
          link: string | null;
          read_at: string | null;
          recipient_profile_id: string | null;
          recipient_role: Database['public']['Enums']['app_role'] | null;
          repair_order_id: string | null;
          title: string | null;
          type: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_recipient_profile_id_fkey';
            columns: ['recipient_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'notifications_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      v_part_stats: {
        Row: {
          brand: string | null;
          designation: string | null;
          id: string | null;
          invoices_count: number | null;
          last_sold_at: string | null;
          manufacturer_ref: string | null;
          margin_ht: number | null;
          margin_kind: Database['public']['Enums']['margin_kind'] | null;
          margin_value: number | null;
          oem_ref: string | null;
          purchase_price: number | null;
          quantity_sold: number | null;
          quotes_count: number | null;
          revenue_ht: number | null;
          sale_price: number | null;
          shipping_cost: number | null;
          supplier_id: string | null;
          supplier_name: string | null;
          vehicle_ref: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'parts_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      v_quote_totals: {
        Row: {
          quote_id: string | null;
          total_ht: number | null;
          total_ttc: number | null;
          total_vat: number | null;
        };
        Relationships: [];
      };
      v_quotes_overview: {
        Row: {
          accepted_at: string | null;
          accepted_by_name: string | null;
          client_id: string | null;
          client_name: string | null;
          created_at: string | null;
          created_by: string | null;
          id: string | null;
          issued_at: string | null;
          legacy_id: string | null;
          merged_into_repair_order_id: string | null;
          notes: string | null;
          number: string | null;
          plate: string | null;
          public_token: string | null;
          refused_at: string | null;
          repair_order_id: string | null;
          repair_order_number: string | null;
          response_processed_at: string | null;
          resulting_repair_order_id: string | null;
          resulting_repair_order_number: string | null;
          sent_at: string | null;
          signature_file_id: string | null;
          status: Database['public']['Enums']['quote_status'] | null;
          total_ht: number | null;
          total_ttc: number | null;
          total_vat: number | null;
          updated_at: string | null;
          valid_until: string | null;
          vehicle_id: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'quotes_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_merged_into_repair_order_id_fkey';
            columns: ['merged_into_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_merged_into_repair_order_id_fkey';
            columns: ['merged_into_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'quotes_merged_into_repair_order_id_fkey';
            columns: ['merged_into_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'quotes_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_resulting_repair_order_id_fkey';
            columns: ['resulting_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_resulting_repair_order_id_fkey';
            columns: ['resulting_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'quotes_resulting_repair_order_id_fkey';
            columns: ['resulting_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_signature_file_id_fkey';
            columns: ['signature_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'quotes_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      v_rentals_overview: {
        Row: {
          billable: boolean | null;
          brand: string | null;
          category: Database['public']['Enums']['fleet_category'] | null;
          cleaning_fee: number | null;
          client_id: string | null;
          client_kind: Database['public']['Enums']['client_kind'] | null;
          client_name: string | null;
          client_phone: string | null;
          closed_at: string | null;
          created_at: string | null;
          created_by: string | null;
          departed_at: string | null;
          departure_at: string | null;
          departure_invoice_id: string | null;
          departure_invoice_number: string | null;
          departure_invoice_status: Database['public']['Enums']['invoice_status'] | null;
          departure_invoiced_periods: number | null;
          deposit: number | null;
          deposit_mode: string | null;
          discount_percent: number | null;
          driving_license_id: string | null;
          estimated_ht: number | null;
          extra_km_price: number | null;
          fleet_vehicle_id: string | null;
          franchise: number | null;
          fuel_price_per_liter: number | null;
          id: string | null;
          invoice_id: string | null;
          invoice_number: string | null;
          is_late: boolean | null;
          kind: Database['public']['Enums']['rental_kind'] | null;
          km_included: number | null;
          late_fee_per_hour: number | null;
          model: string | null;
          notes: string | null;
          number: string | null;
          periods: number | null;
          planned_return_at: string | null;
          plate: string | null;
          public_token: string | null;
          rate_period: string | null;
          renewals: number | null;
          repair_order_id: string | null;
          repair_order_number: string | null;
          returned_at: string | null;
          signature_file_id: string | null;
          signed_at: string | null;
          status: Database['public']['Enums']['rental_status'] | null;
          tacit_renewal: boolean | null;
          terms_accepted: boolean | null;
          unit_price: number | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rentals_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_departure_invoice_id_fkey';
            columns: ['departure_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_departure_invoice_id_fkey';
            columns: ['departure_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'rentals_departure_invoice_id_fkey';
            columns: ['departure_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'rentals_departure_invoice_id_fkey';
            columns: ['departure_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_driving_license_id_fkey';
            columns: ['driving_license_id'];
            isOneToOne: false;
            referencedRelation: 'driving_licenses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_fleet_vehicle_id_fkey';
            columns: ['fleet_vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'fleet_vehicles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_balances';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'rentals_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoice_totals';
            referencedColumns: ['invoice_id'];
          },
          {
            foreignKeyName: 'rentals_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'v_invoices_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'rentals_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rentals_signature_file_id_fkey';
            columns: ['signature_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      v_repair_order_time: {
        Row: {
          repair_order_id: string | null;
          running_since: string | null;
          worked_seconds: number | null;
        };
        Relationships: [];
      };
      v_repair_orders_overview: {
        Row: {
          appointment_id: string | null;
          assignment_changed_at: string | null;
          client_id: string | null;
          client_name: string | null;
          completed_at: string | null;
          created_at: string | null;
          created_by: string | null;
          customer_signature_file_id: string | null;
          declared_hours: number | null;
          id: string | null;
          inspection_required: boolean | null;
          intervention_type: Database['public']['Enums']['intervention_type'] | null;
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          mileage: number | null;
          missing_photo_labels: string[] | null;
          number: string | null;
          origin_quote_id: string | null;
          origin_repair_order_id: string | null;
          parts_pending_count: number | null;
          parts_to_order_count: number | null;
          planned_date: string | null;
          planned_end: string | null;
          planned_start: string | null;
          plate: string | null;
          plate_key: string | null;
          pre_quote_work_settled_at: string | null;
          requested_work: string | null;
          roadside_address: string | null;
          roadside_km: number | null;
          roadside_travel_hours: number | null;
          running_since: string | null;
          status: Database['public']['Enums']['repair_order_status'] | null;
          technician_color: string | null;
          technician_id: string | null;
          technician_name: string | null;
          updated_at: string | null;
          vehicle_id: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'] | null;
          worked_seconds: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'repair_orders_appointment_fk';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'appointments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_appointment_fk';
            columns: ['appointment_id'];
            isOneToOne: false;
            referencedRelation: 'v_appointments_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_contract_fk';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'maintenance_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_contract_fk';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contract_vehicle_status';
            referencedColumns: ['contract_id'];
          },
          {
            foreignKeyName: 'repair_orders_contract_fk';
            columns: ['maintenance_contract_id'];
            isOneToOne: false;
            referencedRelation: 'v_contracts_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_customer_signature_file_id_fkey';
            columns: ['customer_signature_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_quote_fk';
            columns: ['origin_quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_quote_fk';
            columns: ['origin_quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quote_totals';
            referencedColumns: ['quote_id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_quote_fk';
            columns: ['origin_quote_id'];
            isOneToOne: false;
            referencedRelation: 'v_quotes_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_repair_order_id_fkey';
            columns: ['origin_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_repair_order_id_fkey';
            columns: ['origin_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'repair_orders_origin_repair_order_id_fkey';
            columns: ['origin_repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'technicians';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'repair_orders_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'repair_orders_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
      v_tire_lines: {
        Row: {
          available_qty: number | null;
          avg_purchase_price: number | null;
          brands: string | null;
          category: Database['public']['Enums']['tire_category'] | null;
          id: string | null;
          lots_count: number | null;
          min_qty: number | null;
          missing_qty: number | null;
          profile: Database['public']['Enums']['tire_profile'] | null;
          reserved_qty: number | null;
          size: string | null;
          size_key: string | null;
          sold_30d: number | null;
          status: string | null;
          stock_qty: number | null;
        };
        Relationships: [];
      };
      v_tire_lots: {
        Row: {
          available_qty: number | null;
          brand_id: string | null;
          brand_name: string | null;
          category: Database['public']['Enums']['tire_category'] | null;
          condition: Database['public']['Enums']['tire_condition'] | null;
          created_at: string | null;
          dot: string | null;
          id: string | null;
          is_active: boolean | null;
          line_id: string | null;
          load_index: string | null;
          location: string | null;
          model: string | null;
          part_id: string | null;
          profile: Database['public']['Enums']['tire_profile'] | null;
          purchase_price: number | null;
          reserved_qty: number | null;
          sale_price: number | null;
          size: string | null;
          size_key: string | null;
          sold_90d: number | null;
          stock_qty: number | null;
          supplier_id: string | null;
          supplier_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tires_brand_id_fkey';
            columns: ['brand_id'];
            isOneToOne: false;
            referencedRelation: 'tire_brands';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_line_id_fkey';
            columns: ['line_id'];
            isOneToOne: false;
            referencedRelation: 'tire_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_line_id_fkey';
            columns: ['line_id'];
            isOneToOne: false;
            referencedRelation: 'v_tire_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: true;
            referencedRelation: 'parts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_part_id_fkey';
            columns: ['part_id'];
            isOneToOne: true;
            referencedRelation: 'v_part_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tires_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      v_vehicle_deadlines: {
        Row: {
          client_id: string | null;
          client_name: string | null;
          days_left: number | null;
          due_date: string | null;
          kind: string | null;
          plate: string | null;
          vehicle_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicles_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicles_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
        ];
      };
      v_vehicles_overview: {
        Row: {
          antipollution_due_date: string | null;
          archived_at: string | null;
          brand: string | null;
          client_id: string | null;
          client_name: string | null;
          created_at: string | null;
          ct_due_date: string | null;
          first_registration_date: string | null;
          id: string | null;
          last_mileage: number | null;
          last_visit: string | null;
          model: string | null;
          notes: string | null;
          orders_count: number | null;
          plate: string | null;
          plate_key: string | null;
          registration_doc_file_id: string | null;
          tailgate_due_date: string | null;
          updated_at: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'] | null;
          vin: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicles_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicles_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicles_registration_doc_file_id_fkey';
            columns: ['registration_doc_file_id'];
            isOneToOne: false;
            referencedRelation: 'files';
            referencedColumns: ['id'];
          },
        ];
      };
      v_warranty_claims: {
        Row: {
          amount_ht: number | null;
          brand: string | null;
          client_id: string | null;
          client_name: string | null;
          created_at: string | null;
          created_by: string | null;
          id: string | null;
          legacy_id: string | null;
          notes: string | null;
          part_name: string | null;
          reason: string | null;
          reference: string | null;
          repair_order_id: string | null;
          repair_order_number: string | null;
          ro_line_id: string | null;
          status: Database['public']['Enums']['warranty_status'] | null;
          supplier_id: string | null;
          supplier_name: string | null;
          updated_at: string | null;
          vehicle_id: string | null;
          vehicle_plate: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'warranty_claims_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'v_clients_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'repair_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_order_time';
            referencedColumns: ['repair_order_id'];
          },
          {
            foreignKeyName: 'warranty_claims_repair_order_id_fkey';
            columns: ['repair_order_id'];
            isOneToOne: false;
            referencedRelation: 'v_repair_orders_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_ro_line_id_fkey';
            columns: ['ro_line_id'];
            isOneToOne: false;
            referencedRelation: 'ro_lines';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicle_deadlines';
            referencedColumns: ['vehicle_id'];
          },
          {
            foreignKeyName: 'warranty_claims_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'v_vehicles_overview';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'warranty_claims_vehicle_id_fkey';
            columns: ['vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      active_invoice_number: {
        Args: { p_exclude_invoice_id?: string; p_repair_order_id: string };
        Returns: string;
      };
      add_manual_clock_event: {
        Args: {
          p_event_type: Database['public']['Enums']['clock_event_type'];
          p_reason: string;
          p_technician_id: string;
          p_time: string;
          p_work_date: string;
        };
        Returns: {
          created_at: string;
          during_leave_type: Database['public']['Enums']['leave_type'] | null;
          entered_by: string | null;
          event_type: Database['public']['Enums']['clock_event_type'];
          id: string;
          legacy_id: string | null;
          occurred_at: string;
          photo_file_id: string | null;
          photo_purged_at: string | null;
          reason: string | null;
          source: Database['public']['Enums']['clock_source'];
          technician_id: string;
          work_date: string;
        };
        SetofOptions: {
          from: '*';
          to: 'clock_events';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      add_tires: {
        Args: {
          p_brand: string;
          p_category: Database['public']['Enums']['tire_category'];
          p_condition: Database['public']['Enums']['tire_condition'];
          p_dot?: string;
          p_load_index?: string;
          p_location?: string;
          p_min_qty?: number;
          p_model: string;
          p_profile: Database['public']['Enums']['tire_profile'];
          p_purchase_price: number;
          p_quantity: number;
          p_reference?: string;
          p_sale_price: number;
          p_size: string;
          p_supplier_id?: string;
        };
        Returns: string;
      };
      admin_register_account: {
        Args: {
          p_email: string;
          p_full_name: string;
          p_role: Database['public']['Enums']['app_role'];
          p_technician?: Json;
          p_user_id: string;
        };
        Returns: string;
      };
      apply_package_keywords: { Args: { p_repair_order_id: string }; Returns: string[] };
      apply_quote_kiosk_signature: {
        Args: {
          p_request: Database['public']['Tables']['signature_requests']['Row'];
          p_signature_file_id: string;
          p_signer_name: string;
        };
        Returns: undefined;
      };
      apply_rental_signature: {
        Args: {
          p_request: Database['public']['Tables']['signature_requests']['Row'];
          p_signature_file_id: string;
          p_signer_name: string;
        };
        Returns: undefined;
      };
      apply_repair_order_signature: {
        Args: {
          p_request: Database['public']['Tables']['signature_requests']['Row'];
          p_signature_file_id: string;
          p_signer_name: string;
        };
        Returns: undefined;
      };
      assert_confirmed_file: {
        Args: { p_category: Database['public']['Enums']['file_category']; p_file_id: string };
        Returns: undefined;
      };
      assert_direction: { Args: Record<PropertyKey, never>; Returns: undefined };
      assert_office: { Args: Record<PropertyKey, never>; Returns: undefined };
      assign_quote_number: { Args: { p_mark_sent?: boolean; p_quote_id: string }; Returns: string };
      auto_mail_deadline_item: {
        Args: {
          p_client_id: string;
          p_client_name: string;
          p_contract_id: string;
          p_due_date: string;
          p_email: string;
          p_kind: string;
          p_plate: string;
          p_vehicle_id: string;
        };
        Returns: Json;
      };
      booking_free_slots: {
        Args: { p_days?: number; p_from: string };
        Returns: {
          slot_date: string;
          slot_time: string;
        }[];
      };
      booking_reason: { Args: { p_kind: string }; Returns: string };
      build_contract_invoice_draft: { Args: { p_contract_id: string; p_month?: string }; Returns: string };
      build_invoice_draft: { Args: { p_repair_order_ids: string[] }; Returns: string };
      build_quote_from_repair_order: { Args: { p_repair_order_id: string }; Returns: string };
      can_read_repair_order: { Args: { p_repair_order_id: string }; Returns: boolean };
      can_tech_edit_repair_order: { Args: { p_repair_order_id: string }; Returns: boolean };
      can_upload_file: {
        Args: { p_category: Database['public']['Enums']['file_category'] };
        Returns: boolean;
      };
      cancel_agent_action: { Args: { p_action_id: string }; Returns: undefined };
      cancel_rental: { Args: { p_rental_id: string }; Returns: undefined };
      cancel_signature_request: { Args: { p_request_id: string }; Returns: undefined };
      claim_push_batch: { Args: { p_limit?: number }; Returns: Json };
      clear_technician_pin: { Args: { p_technician_id: string }; Returns: undefined };
      client_message_label: {
        Args: { p_type: Database['public']['Enums']['client_message_type'] };
        Returns: string;
      };
      client_vat_exemption: { Args: { p_client_id: string }; Returns: string };
      close_rental: { Args: { p_lines: Json; p_rental_id: string }; Returns: string };
      complete_repair_order: {
        Args: { p_quote_needed?: boolean; p_repair_order_id: string };
        Returns: {
          appointment_id: string | null;
          assignment_changed_at: string;
          client_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_signature_file_id: string | null;
          id: string;
          inspection_required: boolean;
          intervention_type: Database['public']['Enums']['intervention_type'];
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          mileage: number | null;
          number: string;
          origin_quote_id: string | null;
          origin_repair_order_id: string | null;
          planned_date: string | null;
          planned_end: string | null;
          planned_start: string | null;
          pre_quote_work_settled_at: string | null;
          requested_work: string;
          roadside_address: string | null;
          roadside_km: number | null;
          roadside_travel_hours: number | null;
          status: Database['public']['Enums']['repair_order_status'];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'repair_orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      confirm_appointment_request: { Args: { p_appointment_id: string }; Returns: undefined };
      confirm_file_upload: {
        Args: { p_file_id: string; p_mime_type: string; p_size_bytes: number; p_user_id: string };
        Returns: undefined;
      };
      correct_tire_stock: { Args: { p_counted: number; p_note: string; p_tire_id: string }; Returns: number };
      create_quote: {
        Args: {
          p_client_name: string;
          p_plate?: string;
          p_vehicle_type?: Database['public']['Enums']['vehicle_type'];
        };
        Returns: {
          accepted_at: string | null;
          accepted_by_name: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          issued_at: string | null;
          legacy_id: string | null;
          merged_into_repair_order_id: string | null;
          notes: string | null;
          number: string | null;
          public_token: string | null;
          refused_at: string | null;
          repair_order_id: string | null;
          response_processed_at: string | null;
          resulting_repair_order_id: string | null;
          sent_at: string | null;
          signature_file_id: string | null;
          status: Database['public']['Enums']['quote_status'];
          updated_at: string;
          valid_until: string | null;
          vehicle_id: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'quotes';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_repair_order: {
        Args: {
          p_client_name: string;
          p_inspection_required?: boolean;
          p_mileage?: number;
          p_planned_date?: string;
          p_planned_end?: string;
          p_planned_start?: string;
          p_plate: string;
          p_requested_work: string;
          p_signature_file_id?: string;
          p_technician_id?: string;
          p_vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Returns: {
          appointment_id: string | null;
          assignment_changed_at: string;
          client_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_signature_file_id: string | null;
          id: string;
          inspection_required: boolean;
          intervention_type: Database['public']['Enums']['intervention_type'];
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          mileage: number | null;
          number: string;
          origin_quote_id: string | null;
          origin_repair_order_id: string | null;
          planned_date: string | null;
          planned_end: string | null;
          planned_start: string | null;
          pre_quote_work_settled_at: string | null;
          requested_work: string;
          roadside_address: string | null;
          roadside_km: number | null;
          roadside_travel_hours: number | null;
          status: Database['public']['Enums']['repair_order_status'];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'repair_orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_repair_order_from_appointment: {
        Args: { p_appointment_id: string; p_inspection_required?: boolean };
        Returns: string;
      };
      create_repair_order_from_quote: {
        Args: {
          p_inspection_required?: boolean;
          p_planned_date?: string;
          p_planned_end?: string;
          p_planned_start?: string;
          p_quote_id: string;
          p_technician_id?: string;
        };
        Returns: string;
      };
      current_app_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['app_role'];
      };
      current_technician_id: { Args: Record<PropertyKey, never>; Returns: string };
      decide_leave_request: {
        Args: { p_approve: boolean; p_id: string };
        Returns: {
          comment: string | null;
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          end_time: string | null;
          ends_on: string;
          id: string;
          is_deleted: boolean;
          leave_type: Database['public']['Enums']['leave_type'];
          legacy_id: string | null;
          start_time: string | null;
          starts_on: string;
          status: Database['public']['Enums']['leave_status'];
          technician_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'leave_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      delete_leave_request: { Args: { p_id: string }; Returns: undefined };
      dispatch_push: { Args: Record<PropertyKey, never>; Returns: number };
      duplicate_invoice: { Args: { p_invoice_id: string }; Returns: string };
      duplicate_quote: { Args: { p_quote_id: string }; Returns: string };
      duplicate_repair_order: { Args: { p_repair_order_id: string }; Returns: string };
      employee_name: { Args: { p_profile_id: string; p_technician_id: string }; Returns: string };
      ensure_client_and_vehicle: {
        Args: {
          p_client_name: string;
          p_plate: string;
          p_vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Returns: Record<string, unknown>;
      };
      ensure_supplier: { Args: { p_name: string }; Returns: string };
      execute_agent_action: {
        Args: { p_action_id: string };
        Returns: {
          conversation_id: string | null;
          created_at: string;
          decided_at: string | null;
          error: string | null;
          id: string;
          kind: string;
          payload: NonNullable<Json>;
          profile_id: string;
          result: Json | null;
          status: string;
          summary: string;
        };
        SetofOptions: {
          from: '*';
          to: 'agent_actions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      expire_pending_files: { Args: Record<PropertyKey, never>; Returns: number };
      file_max_bytes: { Args: { p_category: Database['public']['Enums']['file_category'] }; Returns: number };
      file_mime_allowed: {
        Args: { p_category: Database['public']['Enums']['file_category']; p_mime_type: string };
        Returns: boolean;
      };
      files_to_purge: {
        Args: { p_limit?: number };
        Returns: {
          bucket: string;
          id: string;
          storage_key: string;
        }[];
      };
      find_catalog_part: {
        Args: { p_brand: string; p_designation: string; p_manufacturer_ref: string };
        Returns: string;
      };
      fleet_vehicle_block_reason: {
        Args: { p_on: string; p_vehicle: Database['public']['Tables']['fleet_vehicles']['Row'] };
        Returns: string;
      };
      generate_alerts: { Args: Record<PropertyKey, never>; Returns: number };
      generate_public_token: { Args: Record<PropertyKey, never>; Returns: string };
      global_search: { Args: { p_query: string }; Returns: Json };
      inspection_activated_fields: { Args: { p_data: Json }; Returns: string[] };
      inspection_missing_points:
        | { Args: { p_data: Json }; Returns: number }
        | {
            Args: { p_data: Json; p_vehicle_type: Database['public']['Enums']['vehicle_type'] };
            Returns: number;
          };
      inspection_trigger_fields: { Args: Record<PropertyKey, never>; Returns: string[] };
      inspection_wear_fields: { Args: Record<PropertyKey, never>; Returns: string[] };
      inspection_wear_fields_for: {
        Args: { p_vehicle_type: Database['public']['Enums']['vehicle_type'] };
        Returns: string[];
      };
      invoiced_ro_lines: {
        Args: { p_from: string; p_to: string };
        Returns: {
          billed_hours: number;
          issued_at: string;
          labor_ht: number;
          parts_ht: number;
          parts_margin_ht: number;
          repair_order_id: string;
        }[];
      };
      invoke_edge_function: { Args: { p_body?: Json; p_name: string }; Returns: number };
      is_direction: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_eu_vat_prefix: { Args: { p_prefix: string }; Returns: boolean };
      is_kiosk: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_migration_context: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_office: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_system_context: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_tailgate_check_line: { Args: { p_description: string; p_package_id: string }; Returns: boolean };
      is_valid_siret: { Args: { p_siret: string }; Returns: boolean };
      issue_invoice: { Args: { p_invoice_id: string }; Returns: string };
      keeps_standard_time: { Args: { p_description: string }; Returns: boolean };
      kiosk_change_pin: { Args: { p_current: string; p_new: string }; Returns: Json };
      kiosk_clock: { Args: { p_photo_file_id: string; p_pin: string }; Returns: Json };
      kiosk_exit_code_is_set: { Args: Record<PropertyKey, never>; Returns: boolean };
      kiosk_pending_signature: { Args: Record<PropertyKey, never>; Returns: Json };
      kiosk_ping: { Args: Record<PropertyKey, never>; Returns: undefined };
      kiosk_sign_repair_order: {
        Args: { p_request_id: string; p_signature_file_id: string; p_signer_name: string };
        Returns: undefined;
      };
      kiosk_status: { Args: Record<PropertyKey, never>; Returns: Json };
      kiosk_too_many_attempts: { Args: Record<PropertyKey, never>; Returns: boolean };
      labor_rate_for: {
        Args: { p_client_id: string; p_vehicle_type: Database['public']['Enums']['vehicle_type'] };
        Returns: number;
      };
      last_working_day_of_month: { Args: { p_day: string }; Returns: string };
      license_block_reason: {
        Args: {
          p_license: Database['public']['Tables']['driving_licenses']['Row'];
          p_required: string;
          p_until: string;
        };
        Returns: string;
      };
      license_covers: { Args: { p_categories: string[]; p_required: string }; Returns: boolean };
      line_net_ht: {
        Args: {
          p_discount_percent: number;
          p_line_type: Database['public']['Enums']['line_type'];
          p_quantity: number;
          p_unit_price: number;
        };
        Returns: number;
      };
      lock_repair_order_for_work: {
        Args: { p_repair_order_id: string };
        Returns: {
          appointment_id: string | null;
          assignment_changed_at: string;
          client_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_signature_file_id: string | null;
          id: string;
          inspection_required: boolean;
          intervention_type: Database['public']['Enums']['intervention_type'];
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          mileage: number | null;
          number: string;
          origin_quote_id: string | null;
          origin_repair_order_id: string | null;
          planned_date: string | null;
          planned_end: string | null;
          planned_start: string | null;
          pre_quote_work_settled_at: string | null;
          requested_work: string;
          roadside_address: string | null;
          roadside_km: number | null;
          roadside_travel_hours: number | null;
          status: Database['public']['Enums']['repair_order_status'];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'repair_orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_files_purged: { Args: { p_ids: string[] }; Returns: number };
      mark_in_progress_if_technician: { Args: { p_repair_order_id: string }; Returns: undefined };
      mark_orphan_files: { Args: { p_grace?: string }; Returns: number };
      merge_quote_into_repair_order: {
        Args: { p_quote_id: string; p_repair_order_id: string };
        Returns: undefined;
      };
      month_end_unsigned_quotes: { Args: { p_now?: string }; Returns: number };
      monthly_report: { Args: { p_month: string }; Returns: Json };
      monthly_statistics: {
        Args: { p_months?: number };
        Returns: {
          credit_notes_ht: number;
          invoice_count: number;
          labor_ht: number;
          month: string;
          parts_ht: number;
          parts_margin_ht: number;
          total_ht: number;
        }[];
      };
      next_document_number: { Args: { p_key: string }; Returns: string };
      normalize_key: { Args: { p_value: string }; Returns: string };
      normalize_match_text: { Args: { p_text: string }; Returns: string };
      office_dashboard: { Args: Record<PropertyKey, never>; Returns: Json };
      package_fits_vehicle: {
        Args: {
          p_category: Database['public']['Enums']['labor_category'];
          p_vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Returns: boolean;
      };
      package_is_quote_only: { Args: { p_package_id: string }; Returns: boolean };
      paris_date: { Args: { p_at: string }; Returns: string };
      part_sale_price: {
        Args: {
          p_kind: Database['public']['Enums']['margin_kind'];
          p_margin: number;
          p_purchase: number;
          p_shipping: number;
        };
        Returns: number;
      };
      postpone_inbox_reply: { Args: { p_id: string }; Returns: boolean };
      pre_quote_work: { Args: { p_repair_order_id: string }; Returns: Json };
      pre_quote_work_alerts: { Args: Record<PropertyKey, never>; Returns: number };
      pre_quote_work_lines: {
        Args: { p_repair_order_id: string };
        Returns: {
          description: string;
          hours: number;
          id: string;
          suggested_price: number;
        }[];
      };
      pre_quote_work_split: {
        Args: { p_repair_order_id: string };
        Returns: {
          billed_hours: number;
          description: string;
          hours: number;
          id: string;
          is_labor: boolean;
          offered_hours: number;
          ord: number;
          suggested_price: number;
        }[];
      };
      prepare_auto_mails: { Args: { p_now?: string }; Returns: Json };
      prepare_rental_mails: { Args: { p_now?: string }; Returns: Json };
      profiles_with_roles: {
        Args: { p_roles: Database['public']['Enums']['app_role'][] };
        Returns: string[];
      };
      profitability_report: {
        Args: { p_from?: string; p_to?: string };
        Returns: {
          billed_hours: number;
          client_id: string;
          client_name: string;
          client_unpaid_ttc: number;
          labor_ht: number;
          parts_ht: number;
          parts_margin_ht: number;
          plate: string;
          ro_count: number;
          vehicle_id: string;
          worked_hours: number;
        }[];
      };
      public_book_appointment: { Args: { p_date: string; p_time: string; p_token: string }; Returns: Json };
      public_booking: { Args: { p_token: string }; Returns: Json };
      public_find_document: { Args: { p_token: string }; Returns: Json };
      public_get_document: { Args: { p_token: string }; Returns: Json };
      public_respond_quote: {
        Args: { p_accept: boolean; p_signature_file_id?: string; p_signer_name: string; p_token: string };
        Returns: Json;
      };
      public_sign_link: {
        Args: { p_signature_file_id: string; p_signer_name: string; p_token: string };
        Returns: Json;
      };
      public_sign_repair_order: {
        Args: { p_signature_file_id: string; p_signer_name: string; p_token: string };
        Returns: Json;
      };
      purge_agent_conversations: { Args: Record<PropertyKey, never>; Returns: number };
      purge_clock_photos: { Args: Record<PropertyKey, never>; Returns: number };
      purge_files: { Args: Record<PropertyKey, never>; Returns: number };
      purge_public_link_misses: { Args: Record<PropertyKey, never>; Returns: number };
      push_quiet_until: { Args: { p_now?: string }; Returns: string };
      queue_push: {
        Args: {
          p_body?: string;
          p_link?: string;
          p_not_before?: string;
          p_profile_ids: string[];
          p_tag?: string;
          p_title: string;
        };
        Returns: number;
      };
      quote_signature_request: { Args: { p_quote_id: string }; Returns: Json };
      receive_tires: {
        Args: {
          p_purchase_price?: number;
          p_quantity: number;
          p_reference?: string;
          p_supplier_id?: string;
          p_tire_id: string;
        };
        Returns: number;
      };
      record_auto_mail: {
        Args: {
          p_appointment_id: string;
          p_client_id: string;
          p_error: string;
          p_key: string;
          p_kind: string;
          p_provider_message_id: string;
          p_recipient: string;
          p_rental_id?: string;
          p_vehicle_id: string;
        };
        Returns: undefined;
      };
      record_invoice_reminder: {
        Args: { p_invoice_id: string };
        Returns: {
          id: string;
          invoice_id: string;
          sent_at: string;
          sent_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'invoice_reminders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_push_results: {
        Args: { p_delivered: string[]; p_gone: string[]; p_retry: string[] };
        Returns: undefined;
      };
      register_file: {
        Args: {
          p_bucket: string;
          p_category: Database['public']['Enums']['file_category'];
          p_mime_type: string;
          p_original_name?: string;
          p_size_bytes: number;
        };
        Returns: {
          file_id: string;
          storage_key: string;
        }[];
      };
      register_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string; p_user_agent?: string };
        Returns: undefined;
      };
      renew_overdue_rentals: { Args: { p_now?: string }; Returns: number };
      rental_missing: {
        Args: { p_phase: Database['public']['Enums']['rental_phase']; p_rental_id: string };
        Returns: string[];
      };
      rental_phase_open: {
        Args: { p_phase: Database['public']['Enums']['rental_phase']; p_rental_id: string };
        Returns: boolean;
      };
      rental_public_json: {
        Args: { p_rental: Database['public']['Tables']['rentals']['Row'] };
        Returns: Json;
      };
      rental_renewal_step: { Args: { p_rate_period: string }; Returns: string };
      rental_signature_request: { Args: { p_rental_id: string }; Returns: Json };
      rental_unit_label: { Args: { p_rate_period: string }; Returns: string };
      repair_order_planned_hours: { Args: { p_end: string; p_id: string; p_start: string }; Returns: number };
      repair_order_signature_request: { Args: { p_repair_order_id: string }; Returns: Json };
      repair_order_status_label: {
        Args: { p_status: Database['public']['Enums']['repair_order_status'] };
        Returns: string;
      };
      request_quote_signature: { Args: { p_quote_id: string }; Returns: Json };
      request_rental_signature: { Args: { p_rental_id: string }; Returns: Json };
      request_repair_order_signature: {
        Args: { p_channel: Database['public']['Enums']['signature_channel']; p_repair_order_id: string };
        Returns: Json;
      };
      required_photo_labels: {
        Args: { p_vehicle_type: Database['public']['Enums']['vehicle_type'] };
        Returns: string[];
      };
      reset_client_portal: { Args: { p_client_id: string }; Returns: string };
      retry_inbox_triage: { Args: Record<PropertyKey, never>; Returns: number };
      return_rental: { Args: { p_rental_id: string; p_returned_at: string }; Returns: undefined };
      run_auto_mails: { Args: Record<PropertyKey, never>; Returns: number };
      save_appointment: {
        Args: {
          p_client_name: string;
          p_end_time?: string;
          p_id?: string;
          p_maintenance_contract_id?: string;
          p_plate: string;
          p_reason?: string;
          p_scheduled_date: string;
          p_start_time: string;
          p_technician_id?: string;
          p_vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Returns: {
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          end_time: string | null;
          id: string;
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          reason: string | null;
          reminder_sent_at: string | null;
          repair_order_id: string | null;
          scheduled_date: string;
          start_time: string;
          status: Database['public']['Enums']['appointment_status'];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'appointments';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_leave_request: {
        Args: {
          p_comment?: string;
          p_end_time?: string;
          p_ends_on: string;
          p_leave_type: Database['public']['Enums']['leave_type'];
          p_start_time?: string;
          p_starts_on: string;
          p_technician_id?: string;
        };
        Returns: {
          comment: string | null;
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          end_time: string | null;
          ends_on: string;
          id: string;
          is_deleted: boolean;
          leave_type: Database['public']['Enums']['leave_type'];
          legacy_id: string | null;
          start_time: string | null;
          starts_on: string;
          status: Database['public']['Enums']['leave_status'];
          technician_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'leave_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_maintenance_contract: {
        Args: {
          p_client_name: string;
          p_frequency_km?: number;
          p_frequency_months?: number;
          p_id?: string;
          p_monthly_price_ht?: number;
          p_plates: string[];
          p_service_description: string;
          p_starts_on?: string;
        };
        Returns: {
          client_id: string;
          created_at: string;
          ended_on: string | null;
          frequency_km: number | null;
          frequency_months: number | null;
          id: string;
          is_active: boolean;
          legacy_id: string | null;
          monthly_price_ht: number | null;
          service_description: string;
          starts_on: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'maintenance_contracts';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      search_knowledge: {
        Args: { p_limit?: number; p_query: string };
        Returns: {
          content: string;
          page: number;
          rank: number;
          title: string;
        }[];
      };
      send_test_push: { Args: Record<PropertyKey, never>; Returns: undefined };
      set_client_archived: { Args: { p_archived: boolean; p_client_id: string }; Returns: undefined };
      set_consumable_stock: {
        Args: { p_consumable_id: string; p_note?: string; p_quantity: number };
        Returns: number;
      };
      set_inbox_emails_handled: { Args: { p_handled: boolean; p_ids: string[] }; Returns: number };
      set_invoice_due_date: { Args: { p_due_date: string; p_invoice_id: string }; Returns: undefined };
      set_invoice_line_employee: {
        Args: { p_line_id: string; p_profile_id?: string; p_technician_id?: string };
        Returns: undefined;
      };
      set_invoice_vat_exempt: { Args: { p_exempt: boolean; p_invoice_id: string }; Returns: undefined };
      set_kiosk_exit_code: { Args: { p_code: string }; Returns: undefined };
      set_quote_response: {
        Args: { p_quote_id: string; p_status: Database['public']['Enums']['quote_status'] };
        Returns: {
          accepted_at: string | null;
          accepted_by_name: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          issued_at: string | null;
          legacy_id: string | null;
          merged_into_repair_order_id: string | null;
          notes: string | null;
          number: string | null;
          public_token: string | null;
          refused_at: string | null;
          repair_order_id: string | null;
          response_processed_at: string | null;
          resulting_repair_order_id: string | null;
          sent_at: string | null;
          signature_file_id: string | null;
          status: Database['public']['Enums']['quote_status'];
          updated_at: string;
          valid_until: string | null;
          vehicle_id: string | null;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'quotes';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_technician_pin: { Args: { p_pin: string; p_technician_id: string }; Returns: undefined };
      set_vehicle_archived: { Args: { p_archived: boolean; p_vehicle_id: string }; Returns: undefined };
      settle_pre_quote_work: { Args: { p_decisions: Json; p_repair_order_id: string }; Returns: Json };
      share_client_portal: { Args: { p_client_id: string }; Returns: string };
      share_invoice: { Args: { p_invoice_id: string }; Returns: string };
      share_quote: { Args: { p_quote_id: string }; Returns: string };
      share_rental: { Args: { p_rental_id: string }; Returns: string };
      signature_request_json: {
        Args: { p_request: Database['public']['Tables']['signature_requests']['Row'] };
        Returns: Json;
      };
      start_rental: { Args: { p_rental_id: string }; Returns: undefined };
      start_timer: {
        Args: { p_repair_order_id: string };
        Returns: {
          created_at: string;
          ended_at: string | null;
          id: string;
          repair_order_id: string;
          started_at: string;
          stopped_by: string | null;
          technician_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'time_entries';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      stop_timer: {
        Args: { p_repair_order_id: string };
        Returns: {
          created_at: string;
          ended_at: string | null;
          id: string;
          repair_order_id: string;
          started_at: string;
          stopped_by: string | null;
          technician_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'time_entries';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      sync_inspection_work: {
        Args: { p_new: Json; p_old: Json; p_repair_order_id: string };
        Returns: undefined;
      };
      tech_update_repair_order: {
        Args: { p_patch: Json; p_repair_order_id: string };
        Returns: {
          appointment_id: string | null;
          assignment_changed_at: string;
          client_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_signature_file_id: string | null;
          id: string;
          inspection_required: boolean;
          intervention_type: Database['public']['Enums']['intervention_type'];
          legacy_id: string | null;
          maintenance_contract_id: string | null;
          mileage: number | null;
          number: string;
          origin_quote_id: string | null;
          origin_repair_order_id: string | null;
          planned_date: string | null;
          planned_end: string | null;
          planned_start: string | null;
          pre_quote_work_settled_at: string | null;
          requested_work: string;
          roadside_address: string | null;
          roadside_km: number | null;
          roadside_travel_hours: number | null;
          status: Database['public']['Enums']['repair_order_status'];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'repair_orders';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      technician_by_pin: { Args: { p_pin: string }; Returns: string };
      technician_performance: {
        Args: { p_from?: string; p_to?: string };
        Returns: {
          average_lead_days: number;
          billed_hours: number;
          color: string;
          estimate_deviation_percent: number;
          labor_ht: number;
          name: string;
          presence_hours: number;
          ro_count: number;
          technician_id: string;
          worked_hours: number;
        }[];
      };
      technician_pin_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          set_at: string;
          technician_id: string;
        }[];
      };
      tire_line_alert: { Args: { p_line_id: string }; Returns: undefined };
      tire_reserved_quantities: {
        Args: { p_line_id?: string };
        Returns: {
          reserved: number;
          tire_id: string;
        }[];
      };
      tire_size_key: { Args: { p_size: string }; Returns: string };
      tire_size_label: { Args: { p_size: string }; Returns: string };
      tire_stock_kpis: { Args: Record<PropertyKey, never>; Returns: Json };
      treasury_overview: { Args: Record<PropertyKey, never>; Returns: Json };
      tts_release: { Args: { p_characters: number }; Returns: undefined };
      tts_reserve: { Args: { p_characters: number }; Returns: number };
      tyre_package_for: {
        Args: { p_description: string; p_vehicle_type: Database['public']['Enums']['vehicle_type'] };
        Returns: string;
      };
      tyre_package_kind: { Args: { p_description: string }; Returns: string };
      update_vehicle_deadlines: {
        Args: { p_patch: Json; p_repair_order_id: string };
        Returns: {
          antipollution_due_date: string | null;
          archived_at: string | null;
          brand: string | null;
          client_id: string | null;
          created_at: string;
          ct_due_date: string | null;
          first_registration_date: string | null;
          id: string;
          model: string | null;
          notes: string | null;
          plate: string;
          plate_key: string | null;
          registration_doc_file_id: string | null;
          tailgate_due_date: string | null;
          updated_at: string;
          vehicle_type: Database['public']['Enums']['vehicle_type'];
          vin: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'vehicles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      valid_client_phones: { Args: { p_phones: Json }; Returns: boolean };
      vehicle_history_for_diagnosis: { Args: { p_repair_order_id: string }; Returns: Json };
      verify_kiosk_exit_code: { Args: { p_code: string }; Returns: boolean };
      workshop_board: { Args: Record<PropertyKey, never>; Returns: Json };
      workshop_workload: { Args: { p_from: string; p_to: string }; Returns: Json };
      workshop_workload_detail: {
        Args: { p_from: string; p_technician_id: string; p_to: string };
        Returns: Json;
      };
    };
    Enums: {
      app_role: 'direction' | 'reception' | 'technician' | 'kiosk';
      appointment_status: 'requested' | 'planned' | 'converted' | 'cancelled';
      client_kind: 'pro' | 'individual';
      client_message_type:
        | 'vehicle_received'
        | 'quote_available'
        | 'vehicle_ready'
        | 'appointment_reminder'
        | 'quote_link'
        | 'invoice_link'
        | 'invoice_reminder'
        | 'portal_link';
      clock_event_type: 'in' | 'out';
      clock_source: 'kiosk' | 'manual';
      consumable_movement_reason: 'usage' | 'usage_cancel' | 'restock' | 'adjustment';
      done_line_decision: 'offered' | 'billed';
      file_category:
        | 'ro_photo'
        | 'signature'
        | 'registration_doc'
        | 'clock_photo'
        | 'document_pdf'
        | 'label_scan'
        | 'logo'
        | 'other';
      fleet_category: 'tractor' | 'trailer' | 'van' | 'car';
      fleet_document_kind:
        | 'registration'
        | 'insurance'
        | 'technical_inspection'
        | 'accident_report'
        | 'maintenance_book'
        | 'fuel_card'
        | 'other';
      intervention_type: 'workshop' | 'roadside';
      invoice_status: 'draft' | 'issued';
      labor_category: 'pl' | 'vul' | 'remorque' | 'tolerie';
      leave_status: 'requested' | 'approved' | 'rejected';
      leave_type: 'paid_leave' | 'sick' | 'training' | 'other';
      line_type: 'labor' | 'package' | 'part' | 'consumable' | 'subcontract' | 'travel' | 'text' | 'rental';
      margin_kind: 'amount' | 'percent';
      message_channel: 'email' | 'sms' | 'other';
      part_order_status: 'to_order' | 'ordered' | 'received';
      payment_method: 'bank_transfer' | 'check' | 'card' | 'cash' | 'bill_of_exchange' | 'direct_debit';
      quote_section: 'done' | 'planned';
      quote_status: 'draft' | 'in_progress' | 'sent' | 'accepted' | 'refused';
      rental_kind: 'rental' | 'loan';
      rental_phase: 'departure' | 'return';
      rental_photo_slot: 'front' | 'back' | 'left' | 'right' | 'dashboard' | 'closeup';
      rental_status: 'reserved' | 'active' | 'returned' | 'closed' | 'cancelled';
      repair_order_status:
        'assigned' | 'in_progress' | 'work_done' | 'quote_pending' | 'to_invoice' | 'invoiced';
      rest_group: 'A' | 'B';
      ro_line_kind: 'done' | 'planned';
      signature_channel: 'kiosk' | 'email';
      signature_request_status: 'pending' | 'signed' | 'cancelled';
      subcontract_status: 'sent' | 'returned';
      tire_category: 'pl' | 'vul';
      tire_condition: 'neuf' | 'rechape' | 'occasion';
      tire_movement_reason: 'entry' | 'sale' | 'correction';
      tire_profile: 'avant' | 'arriere' | 'remorque' | 'multi' | 'toutes';
      vehicle_type: 'pl' | 'vul' | 'remorque';
      warranty_status: 'to_return' | 'sent' | 'accepted' | 'refused' | 'refunded';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ['direction', 'reception', 'technician', 'kiosk'],
      appointment_status: ['requested', 'planned', 'converted', 'cancelled'],
      client_kind: ['pro', 'individual'],
      client_message_type: [
        'vehicle_received',
        'quote_available',
        'vehicle_ready',
        'appointment_reminder',
        'quote_link',
        'invoice_link',
        'invoice_reminder',
        'portal_link',
      ],
      clock_event_type: ['in', 'out'],
      clock_source: ['kiosk', 'manual'],
      consumable_movement_reason: ['usage', 'usage_cancel', 'restock', 'adjustment'],
      done_line_decision: ['offered', 'billed'],
      file_category: [
        'ro_photo',
        'signature',
        'registration_doc',
        'clock_photo',
        'document_pdf',
        'label_scan',
        'logo',
        'other',
      ],
      fleet_category: ['tractor', 'trailer', 'van', 'car'],
      fleet_document_kind: [
        'registration',
        'insurance',
        'technical_inspection',
        'accident_report',
        'maintenance_book',
        'fuel_card',
        'other',
      ],
      intervention_type: ['workshop', 'roadside'],
      invoice_status: ['draft', 'issued'],
      labor_category: ['pl', 'vul', 'remorque', 'tolerie'],
      leave_status: ['requested', 'approved', 'rejected'],
      leave_type: ['paid_leave', 'sick', 'training', 'other'],
      line_type: ['labor', 'package', 'part', 'consumable', 'subcontract', 'travel', 'text', 'rental'],
      margin_kind: ['amount', 'percent'],
      message_channel: ['email', 'sms', 'other'],
      part_order_status: ['to_order', 'ordered', 'received'],
      payment_method: ['bank_transfer', 'check', 'card', 'cash', 'bill_of_exchange', 'direct_debit'],
      quote_section: ['done', 'planned'],
      quote_status: ['draft', 'in_progress', 'sent', 'accepted', 'refused'],
      rental_kind: ['rental', 'loan'],
      rental_phase: ['departure', 'return'],
      rental_photo_slot: ['front', 'back', 'left', 'right', 'dashboard', 'closeup'],
      rental_status: ['reserved', 'active', 'returned', 'closed', 'cancelled'],
      repair_order_status: [
        'assigned',
        'in_progress',
        'work_done',
        'quote_pending',
        'to_invoice',
        'invoiced',
      ],
      rest_group: ['A', 'B'],
      ro_line_kind: ['done', 'planned'],
      signature_channel: ['kiosk', 'email'],
      signature_request_status: ['pending', 'signed', 'cancelled'],
      subcontract_status: ['sent', 'returned'],
      tire_category: ['pl', 'vul'],
      tire_condition: ['neuf', 'rechape', 'occasion'],
      tire_movement_reason: ['entry', 'sale', 'correction'],
      tire_profile: ['avant', 'arriere', 'remorque', 'multi', 'toutes'],
      vehicle_type: ['pl', 'vul', 'remorque'],
      warranty_status: ['to_return', 'sent', 'accepted', 'refused', 'refunded'],
    },
  },
} as const;
