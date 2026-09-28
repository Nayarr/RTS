import { ensureSupplier } from '@/features/catalogs/api';
import { supabase } from '@/lib/supabase';
import type { Enums, Tables } from '@/types/database';

export type WarrantyStatus = Enums<'warranty_status'>;

type ClaimRow = Tables<'v_warranty_claims'>;
type Guaranteed = 'id' | 'part_name' | 'status' | 'created_at';
export type WarrantyClaim = Omit<ClaimRow, Guaranteed> & { [K in Guaranteed]: NonNullable<ClaimRow[K]> };

/** Retours et garanties, les plus récents d'abord. */
export async function fetchWarrantyClaims(): Promise<WarrantyClaim[]> {
  const { data, error } = await supabase
    .from('v_warranty_claims')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as WarrantyClaim[];
}

export interface WarrantyInput {
  part_name: string;
  brand: string | null;
  supplier_name: string;
  reference: string | null;
  amount_ht: number | null;
  reason: string | null;
  status: WarrantyStatus;
  notes: string | null;
}

/** Nouveau retour (depuis une pièce d'OR : OR, véhicule et client sont repris), ou modification. */
export async function saveWarrantyClaim(
  id: string | null,
  { supplier_name, ...input }: WarrantyInput,
  roLineId: string | null = null,
) {
  const row = { ...input, supplier_id: await ensureSupplier(supplier_name) };
  const { data, error } = id
    ? await supabase.from('warranty_claims').update(row).eq('id', id).select('id')
    : await supabase
        .from('warranty_claims')
        .insert({ ...row, ro_line_id: roLineId })
        .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification non autorisée');
}

export async function deleteWarrantyClaim(id: string) {
  const { data, error } = await supabase.from('warranty_claims').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression non autorisée');
}
