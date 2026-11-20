import { ensureSupplier } from '@/features/catalogs/api';
import { supabase } from '@/lib/supabase';
import type { Enums, Tables } from '@/types/database';

export type PartCoreStatus = Enums<'part_core_status'>;

type CoreRow = Tables<'v_part_cores'>;
type Guaranteed =
  'id' | 'ro_line_id' | 'repair_order_id' | 'status' | 'created_at' | 'part_name' | 'repair_order_number';
/** Consigne de la page Consignes : pièce, fournisseur, OR et véhicule lisibles. */
export type PartCore = Omit<CoreRow, Guaranteed> & { [K in Guaranteed]: NonNullable<CoreRow[K]> };

/** Toutes les consignes, les plus anciennes d'abord (les premières à renvoyer). */
export async function fetchPartCores(): Promise<PartCore[]> {
  const { data, error } = await supabase
    .from('v_part_cores')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as PartCore[];
}

/** Consignes des pièces d'un OR, par ligne de pièce. */
export async function fetchRepairOrderCores(repairOrderId: string): Promise<Record<string, PartCore>> {
  const { data, error } = await supabase
    .from('v_part_cores')
    .select('*')
    .eq('repair_order_id', repairOrderId);
  if (error) throw error;
  return Object.fromEntries((data as PartCore[]).map((core) => [core.ro_line_id, core]));
}

const assertChanged = (data: unknown[]) => {
  if (!data.length) throw new Error('Modification non autorisée');
};

/** Ancienne pièce mise en consigne (bureau ou mécano de l'OR). */
export async function addPartCore(repairOrderId: string, roLineId: string, amountHt: number | null = null) {
  // OR et fournisseur sont de toute façon repris de la pièce par la base
  const { error } = await supabase
    .from('part_cores')
    .insert({ repair_order_id: repairOrderId, ro_line_id: roLineId, amount_ht: amountHt });
  if (error) throw error;
}

export async function deletePartCore(id: string) {
  const { data, error } = await supabase.from('part_cores').delete().eq('id', id).select('id');
  if (error) throw error;
  assertChanged(data);
}

export interface PartCoreInput {
  supplier_name: string;
  amount_ht: number | null;
  status: PartCoreStatus;
  returned_on: string | null;
  refunded_on: string | null;
  refunded_amount_ht: number | null;
  notes: string | null;
}

/** Suivi d'une consigne par le bureau (dates du jour posées par la base si vides). */
export async function updatePartCore(id: string, { supplier_name, ...input }: PartCoreInput) {
  const row = { ...input, supplier_id: await ensureSupplier(supplier_name) };
  const { data, error } = await supabase.from('part_cores').update(row).eq('id', id).select('id');
  if (error) throw error;
  assertChanged(data);
}

/** Passage du livreur : plusieurs anciennes pièces renvoyées le même jour. */
export async function markPartCoresReturned(ids: string[], returnedOn: string) {
  const { data, error } = await supabase
    .from('part_cores')
    .update({ status: 'returned', returned_on: returnedOn })
    .in('id', ids)
    .select('id');
  if (error) throw error;
  if (data.length !== ids.length) throw new Error('Modification non autorisée');
}

/** Montant de la consigne changé depuis la fenêtre de la pièce. */
export async function setPartCoreAmount(id: string, amountHt: number | null) {
  const { data, error } = await supabase
    .from('part_cores')
    .update({ amount_ht: amountHt })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  assertChanged(data);
}
