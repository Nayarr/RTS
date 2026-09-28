import type { VehicleType } from '@/features/repair-orders/constants';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

/** État d'un véhicule sous contrat (champs d'état absents pour un contrat terminé). */
export interface ContractVehicle {
  vehicle_id: string;
  plate: string;
  vehicle_type: VehicleType;
  last_service_at?: string | null;
  km_since_service?: number | null;
  appointment_planned?: boolean;
  service_due?: boolean;
}

type ContractRow = Tables<'v_contracts_overview'>;
type Guaranteed = 'id' | 'client_id' | 'client_name' | 'service_description' | 'starts_on' | 'is_active';
export type Contract = Omit<ContractRow, Guaranteed | 'vehicles'> & {
  [K in Guaranteed]: NonNullable<ContractRow[K]>;
} & { vehicles: ContractVehicle[] };

export async function fetchContracts(): Promise<Contract[]> {
  const { data, error } = await supabase
    .from('v_contracts_overview')
    .select('*')
    .order('is_active', { ascending: false })
    .order('client_name');
  if (error) throw error;
  return data as unknown as Contract[];
}

export interface ContractInput {
  client_name: string;
  service_description: string;
  plates: string[];
  frequency_months: number | null;
  frequency_km: number | null;
  monthly_price_ht: number | null;
  starts_on: string;
}

export async function saveContract(id: string | null, input: ContractInput) {
  const { error } = await supabase.rpc('save_maintenance_contract', {
    p_client_name: input.client_name,
    p_service_description: input.service_description,
    p_plates: input.plates,
    p_frequency_months: input.frequency_months ?? undefined,
    p_frequency_km: input.frequency_km ?? undefined,
    p_monthly_price_ht: input.monthly_price_ht ?? undefined,
    p_starts_on: input.starts_on,
    p_id: id ?? undefined,
  });
  if (error) throw error;
}

/** « Mettre fin au contrat » (il reste consultable). */
export async function endContract(id: string, endedOn: string) {
  const { data, error } = await supabase
    .from('maintenance_contracts')
    .update({ is_active: false, ended_on: endedOn })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification non autorisée');
}

/** « Facturer le mois » : brouillon de facture ; renvoie son identifiant. */
export async function buildContractInvoice(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('build_contract_invoice_draft', { p_contract_id: id });
  if (error) throw error;
  return data;
}
