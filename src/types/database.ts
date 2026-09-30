export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          clock_photo_retention_months: number;
          daily_hours: number;
          expected_arrival: string;
          friday_hours: number;
          friday_lunch_start: string;
          id: boolean;
          label_scan_enabled: boolean;
          last_backup_at: string | null;
          late_tolerance: string;
          lunch_end: string;
          lunch_start: string;
          overtime_start: string;
          rest_reference_monday: string | null;
          roadside_flat_fee: number;
          roadside_price_per_km: number;
          roadside_travel_hourly_rate: number;
          updated_at: string;
          workday_end: string;
          workday_start: string;
        };
        Insert: {
          clock_photo_retention_months?: number;
          daily_hours?: number;
          expected_arrival?: string;
          friday_hours?: number;
          friday_lunch_start?: string;
          id?: boolean;
          label_scan_enabled?: boolean;
          last_backup_at?: string | null;
          late_tolerance?: string;
          lunch_end?: string;
          lunch_start?: string;
          overtime_start?: string;
          rest_reference_monday?: string | null;
          roadside_flat_fee?: number;
          roadside_price_per_km?: number;
          roadside_travel_hourly_rate?: number;
          updated_at?: string;
          workday_end?: string;
          workday_start?: string;
        };
        Update: {
          clock_photo_retention_months?: number;
          daily_hours?: number;
          expected_arrival?: string;
          friday_hours?: number;
          friday_lunch_start?: string;
          id?: boolean;
          label_scan_enabled?: boolean;
          last_backup_at?: string | null;
          late_tolerance?: string;
          lunch_end?: string;
          lunch_start?: string;
          overtime_start?: string;
          rest_reference_monday?: string | null;
          roadside_flat_fee?: number;
          roadside_price_per_km?: number;
          roadside_travel_hourly_rate?: number;
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
          billing_address: string | null;
          created_at: string;
          discount_percent: number | null;
          email: string | null;
          hourly_rate: number | null;
          id: string;
          legacy_key: string | null;
          name: string;
          name_key: string | null;
          notes: string | null;
          phone: string | null;
          portal_token: string | null;
          siren: string | null;
          updated_at: string;
        };
        Insert: {
          billing_address?: string | null;
          created_at?: string;
          discount_percent?: number | null;
          email?: string | null;
          hourly_rate?: number | null;
          id?: string;
          legacy_key?: string | null;
          name: string;
          name_key?: never;
          notes?: string | null;
          phone?: string | null;
          portal_token?: string | null;
          siren?: string | null;
          updated_at?: string;
        };
        Update: {
          billing_address?: string | null;
          created_at?: string;
          discount_percent?: number | null;
          email?: string | null;
          hourly_rate?: number | null;
          id?: string;
          legacy_key?: string | null;
          name?: string;
          name_key?: never;
          notes?: string | null;
          phone?: string | null;
          portal_token?: string | null;
          siren?: string | null;
          updated_at?: string;
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
          city: string;
          default_vat_rate: number;
          email: string | null;
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
          siren: string | null;
          siret: string | null;
          updated_at: string;
          vat_number: string | null;
        };
        Insert: {
          address_line: string;
          city: string;
          default_vat_rate?: number;
          email?: string | null;
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
          siren?: string | null;
          siret?: string | null;
          updated_at?: string;
          vat_number?: string | null;
        };
        Update: {
          address_line?: string;
          city?: string;
          default_vat_rate?: number;
          email?: string | null;
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
          siren?: string | null;
          siret?: string | null;
          updated_at?: string;
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
          client_siren: string | null;
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
          service_date: string | null;
          status: Database['public']['Enums']['invoice_status'];
          total_ht: number | null;
          total_ttc: number | null;
          total_vat: number | null;
          updated_at: string;
          vehicle_label: string | null;
        };
        Insert: {
          client_address?: string | null;
          client_email?: string | null;
          client_id: string;
          client_name?: string | null;
          client_siren?: string | null;
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
          service_date?: string | null;
          status?: Database['public']['Enums']['invoice_status'];
          total_ht?: number | null;
          total_ttc?: number | null;
          total_vat?: number | null;
          updated_at?: string;
          vehicle_label?: string | null;
        };
        Update: {
          client_address?: string | null;
          client_email?: string | null;
          client_id?: string;
          client_name?: string | null;
          client_siren?: string | null;
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
          service_date?: string | null;
          status?: Database['public']['Enums']['invoice_status'];
          total_ht?: number | null;
          total_ttc?: number | null;
          total_vat?: number | null;
          updated_at?: string;
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
          ends_on: string;
          id: string;
          is_deleted: boolean;
          leave_type: Database['public']['Enums']['leave_type'];
          legacy_id: string | null;
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
          ends_on: string;
          id?: string;
          is_deleted?: boolean;
          leave_type: Database['public']['Enums']['leave_type'];
          legacy_id?: string | null;
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
          ends_on?: string;
          id?: string;
          is_deleted?: boolean;
          leave_type?: Database['public']['Enums']['leave_type'];
          legacy_id?: string | null;
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
          legacy_id: string | null;
          manufacturer_ref: string | null;
          oem_ref: string | null;
          purchase_price: number | null;
          sale_price: number | null;
          supplier_id: string | null;
          updated_at: string;
        };
        Insert: {
          brand?: string | null;
          created_at?: string;
          designation: string;
          id?: string;
          is_active?: boolean;
          legacy_id?: string | null;
          manufacturer_ref?: string | null;
          oem_ref?: string | null;
          purchase_price?: number | null;
          sale_price?: number | null;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          brand?: string | null;
          created_at?: string;
          designation?: string;
          id?: string;
          is_active?: boolean;
          legacy_id?: string | null;
          manufacturer_ref?: string | null;
          oem_ref?: string | null;
          purchase_price?: number | null;
          sale_price?: number | null;
          supplier_id?: string | null;
          updated_at?: string;
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
      push_outbox: {
        Row: {
          attempts: number;
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
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
          unit_price: number | null;
          updated_at: string;
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
          unit_price?: number | null;
          updated_at?: string;
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
          unit_price?: number | null;
          updated_at?: string;
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
          standard_hours?: number;
          trigger_fields?: string[];
          updated_at?: string;
        };
        Relationships: [];
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
      vehicles: {
        Row: {
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
          balance_due: number | null;
          billing_address: string | null;
          created_at: string | null;
          discount_percent: number | null;
          email: string | null;
          hourly_rate: number | null;
          id: string | null;
          last_visit: string | null;
          legacy_key: string | null;
          name: string | null;
          name_key: string | null;
          notes: string | null;
          orders_count: number | null;
          overdue_invoices_count: number | null;
          phone: string | null;
          portal_token: string | null;
          revenue_ht: number | null;
          siren: string | null;
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
          client_siren: string | null;
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
      assert_confirmed_file: {
        Args: { p_category: Database['public']['Enums']['file_category']; p_file_id: string };
        Returns: undefined;
      };
      assert_direction: { Args: Record<PropertyKey, never>; Returns: undefined };
      assert_office: { Args: Record<PropertyKey, never>; Returns: undefined };
      assign_quote_number: { Args: { p_mark_sent?: boolean; p_quote_id: string }; Returns: string };
      backup_excluded_tables: { Args: Record<PropertyKey, never>; Returns: string[] };
      backup_reminder: { Args: Record<PropertyKey, never>; Returns: number };
      build_contract_invoice_draft: { Args: { p_contract_id: string; p_month?: string }; Returns: string };
      build_invoice_draft: { Args: { p_repair_order_ids: string[] }; Returns: string };
      build_quote_from_repair_order: { Args: { p_repair_order_id: string }; Returns: string };
      can_read_repair_order: { Args: { p_repair_order_id: string }; Returns: boolean };
      can_tech_edit_repair_order: { Args: { p_repair_order_id: string }; Returns: boolean };
      can_upload_file: {
        Args: { p_category: Database['public']['Enums']['file_category'] };
        Returns: boolean;
      };
      claim_push_batch: { Args: { p_limit?: number }; Returns: Json };
      clear_technician_pin: { Args: { p_technician_id: string }; Returns: undefined };
      client_message_label: {
        Args: { p_type: Database['public']['Enums']['client_message_type'] };
        Returns: string;
      };
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
      confirm_file_upload: {
        Args: { p_file_id: string; p_mime_type: string; p_size_bytes: number; p_user_id: string };
        Returns: undefined;
      };
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
      create_repair_order_from_appointment: { Args: { p_appointment_id: string }; Returns: string };
      create_repair_order_from_quote: {
        Args: { p_quote_id: string; p_technician_id?: string };
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
          ends_on: string;
          id: string;
          is_deleted: boolean;
          leave_type: Database['public']['Enums']['leave_type'];
          legacy_id: string | null;
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
      ensure_client_and_vehicle: {
        Args: {
          p_client_name: string;
          p_plate: string;
          p_vehicle_type: Database['public']['Enums']['vehicle_type'];
        };
        Returns: Record<string, unknown>;
      };
      ensure_supplier: { Args: { p_name: string }; Returns: string };
      expire_pending_files: { Args: Record<PropertyKey, never>; Returns: number };
      export_backup: { Args: Record<PropertyKey, never>; Returns: Json };
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
      generate_alerts: { Args: Record<PropertyKey, never>; Returns: number };
      generate_public_token: { Args: Record<PropertyKey, never>; Returns: string };
      global_search: { Args: { p_query: string }; Returns: Json };
      inspection_wear_fields: { Args: Record<PropertyKey, never>; Returns: string[] };
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
      is_kiosk: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_migration_context: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_office: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_system_context: { Args: Record<PropertyKey, never>; Returns: boolean };
      issue_invoice: { Args: { p_invoice_id: string }; Returns: string };
      kiosk_clock: { Args: { p_photo_file_id: string; p_pin: string }; Returns: Json };
      kiosk_exit_code_is_set: { Args: Record<PropertyKey, never>; Returns: boolean };
      kiosk_too_many_attempts: { Args: Record<PropertyKey, never>; Returns: boolean };
      labor_rate_for: {
        Args: { p_client_id: string; p_vehicle_type: Database['public']['Enums']['vehicle_type'] };
        Returns: number;
      };
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
      paris_date: { Args: { p_at: string }; Returns: string };
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
      public_get_document: { Args: { p_token: string }; Returns: Json };
      public_respond_quote: {
        Args: { p_accept: boolean; p_signature_file_id?: string; p_signer_name: string; p_token: string };
        Returns: Json;
      };
      purge_clock_photos: { Args: Record<PropertyKey, never>; Returns: number };
      purge_files: { Args: Record<PropertyKey, never>; Returns: number };
      queue_push: {
        Args: { p_body?: string; p_link?: string; p_profile_ids: string[]; p_tag?: string; p_title: string };
        Returns: number;
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
      repair_order_status_label: {
        Args: { p_status: Database['public']['Enums']['repair_order_status'] };
        Returns: string;
      };
      required_photo_labels: {
        Args: { p_vehicle_type: Database['public']['Enums']['vehicle_type'] };
        Returns: string[];
      };
      reset_client_portal: { Args: { p_client_id: string }; Returns: string };
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
          p_ends_on: string;
          p_leave_type: Database['public']['Enums']['leave_type'];
          p_starts_on: string;
          p_technician_id?: string;
        };
        Returns: {
          comment: string | null;
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          ends_on: string;
          id: string;
          is_deleted: boolean;
          leave_type: Database['public']['Enums']['leave_type'];
          legacy_id: string | null;
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
      send_test_push: { Args: Record<PropertyKey, never>; Returns: undefined };
      set_consumable_stock: {
        Args: { p_consumable_id: string; p_note?: string; p_quantity: number };
        Returns: number;
      };
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
      settle_pre_quote_work: { Args: { p_decisions: Json; p_repair_order_id: string }; Returns: Json };
      share_client_portal: { Args: { p_client_id: string }; Returns: string };
      share_invoice: { Args: { p_invoice_id: string }; Returns: string };
      share_quote: { Args: { p_quote_id: string }; Returns: string };
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
      treasury_overview: { Args: Record<PropertyKey, never>; Returns: Json };
      update_vehicle_deadlines: {
        Args: { p_patch: Json; p_repair_order_id: string };
        Returns: {
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
      verify_kiosk_exit_code: { Args: { p_code: string }; Returns: boolean };
      workshop_board: { Args: Record<PropertyKey, never>; Returns: Json };
    };
    Enums: {
      app_role: 'direction' | 'reception' | 'technician' | 'kiosk';
      appointment_status: 'planned' | 'converted' | 'cancelled';
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
      intervention_type: 'workshop' | 'roadside';
      invoice_status: 'draft' | 'issued';
      labor_category: 'pl' | 'vul' | 'remorque' | 'tolerie';
      leave_status: 'requested' | 'approved' | 'rejected';
      leave_type: 'paid_leave' | 'sick' | 'training' | 'other';
      line_type: 'labor' | 'package' | 'part' | 'consumable' | 'subcontract' | 'travel' | 'text';
      message_channel: 'email' | 'sms' | 'other';
      part_order_status: 'to_order' | 'ordered' | 'received';
      payment_method: 'bank_transfer' | 'check' | 'card' | 'cash' | 'bill_of_exchange' | 'direct_debit';
      quote_section: 'done' | 'planned';
      quote_status: 'draft' | 'in_progress' | 'sent' | 'accepted' | 'refused';
      repair_order_status:
        'assigned' | 'in_progress' | 'work_done' | 'quote_pending' | 'to_invoice' | 'invoiced';
      rest_group: 'A' | 'B';
      ro_line_kind: 'done' | 'planned';
      subcontract_status: 'sent' | 'returned';
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
      appointment_status: ['planned', 'converted', 'cancelled'],
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
      intervention_type: ['workshop', 'roadside'],
      invoice_status: ['draft', 'issued'],
      labor_category: ['pl', 'vul', 'remorque', 'tolerie'],
      leave_status: ['requested', 'approved', 'rejected'],
      leave_type: ['paid_leave', 'sick', 'training', 'other'],
      line_type: ['labor', 'package', 'part', 'consumable', 'subcontract', 'travel', 'text'],
      message_channel: ['email', 'sms', 'other'],
      part_order_status: ['to_order', 'ordered', 'received'],
      payment_method: ['bank_transfer', 'check', 'card', 'cash', 'bill_of_exchange', 'direct_debit'],
      quote_section: ['done', 'planned'],
      quote_status: ['draft', 'in_progress', 'sent', 'accepted', 'refused'],
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
      subcontract_status: ['sent', 'returned'],
      vehicle_type: ['pl', 'vul', 'remorque'],
      warranty_status: ['to_return', 'sent', 'accepted', 'refused', 'refunded'],
    },
  },
} as const;
