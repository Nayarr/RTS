import type { QuoteStatus } from '@/features/quotes/api';
import type { RepairOrderStatus, VehicleType } from '@/features/repair-orders/constants';
import { supabase } from '@/lib/supabase';

export interface SearchResults {
  repair_orders: {
    id: string;
    number: string;
    status: RepairOrderStatus;
    created_at: string;
    plate: string;
    client_name: string | null;
  }[];
  clients: { id: string; name: string; phone: string | null; email: string | null }[];
  vehicles: {
    id: string;
    plate: string;
    vehicle_type: VehicleType;
    brand: string | null;
    model: string | null;
    client_name: string | null;
  }[];
  quotes: {
    id: string;
    number: string | null;
    status: QuoteStatus;
    created_at: string;
    plate: string | null;
    client_name: string | null;
  }[];
  invoices: {
    id: string;
    number: string | null;
    status: 'draft' | 'issued';
    created_at: string;
    issued_at: string | null;
    total_ttc: number | null;
    vehicle_label: string | null;
    client_name: string | null;
  }[];
}

/** Recherche dans les OR, clients, véhicules, devis et factures (8 résultats par catégorie). */
export async function globalSearch(query: string): Promise<SearchResults> {
  const { data, error } = await supabase.rpc('global_search', { p_query: query });
  if (error) throw error;
  return data as unknown as SearchResults;
}
