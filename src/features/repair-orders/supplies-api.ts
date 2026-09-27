import { ensureSupplier, type Consumable } from '@/features/catalogs/api';
import { supabase } from '@/lib/supabase';
import type { Enums, Tables } from '@/types/database';

export type PartOrderStatus = Enums<'part_order_status'>;
export type SubcontractStatus = Enums<'subcontract_status'>;
export type Subcontract = Tables<'subcontracts'> & { supplier_name: string };
export type RoConsumable = Tables<'ro_consumables'> & { name: string };

export interface RepairOrderSupplies {
  subcontracts: Subcontract[];
  consumables: RoConsumable[];
  /** Fournisseur de chaque pièce de l'OR (id de ligne → nom). */
  partSuppliers: Record<string, string>;
}

/** Sous-traitance et consommables de l'OR (bureau uniquement : coûts et marges). */
export async function fetchSupplies(repairOrderId: string): Promise<RepairOrderSupplies> {
  const [subcontracts, consumables, parts] = await Promise.all([
    supabase
      .from('subcontracts')
      .select('*, supplier:suppliers(name)')
      .eq('repair_order_id', repairOrderId)
      .order('sent_on')
      .order('created_at'),
    supabase
      .from('ro_consumables')
      .select('*, consumable:consumables(name)')
      .eq('repair_order_id', repairOrderId)
      .order('created_at'),
    supabase
      .from('ro_lines')
      .select('id, supplier:suppliers(name)')
      .eq('repair_order_id', repairOrderId)
      .eq('line_type', 'part'),
  ]);
  if (subcontracts.error) throw subcontracts.error;
  if (consumables.error) throw consumables.error;
  if (parts.error) throw parts.error;
  return {
    subcontracts: subcontracts.data.map(({ supplier, ...row }) => ({ ...row, supplier_name: supplier.name })),
    consumables: consumables.data.map(({ consumable, ...row }) => ({ ...row, name: consumable.name })),
    partSuppliers: Object.fromEntries(
      parts.data.flatMap(({ id, supplier }) => (supplier ? [[id, supplier.name]] : [])),
    ),
  };
}

const assertChanged = (data: unknown[]) => {
  if (!data.length) throw new Error('Modification non autorisée');
};

// ---------------------------------------------------------------- Pièces (lignes d'OR)

export interface PartLineInput {
  description: string;
  quantity: number;
  unit_price: number | null;
  purchase_price: number | null;
  shipping_cost: number | null;
  supplier_name: string;
  brand: string | null;
  manufacturer_ref: string | null;
  oem_ref: string | null;
  part_id: string | null;
  order_status: PartOrderStatus;
}

async function partRow({ supplier_name, ...input }: PartLineInput) {
  return { ...input, line_type: 'part' as const, supplier_id: await ensureSupplier(supplier_name) };
}

/** Pièce fournie pour l'intervention (travaux effectués : facturée avec l'OR). */
export async function addPartLine(repairOrderId: string, position: number, input: PartLineInput) {
  const { error } = await supabase
    .from('ro_lines')
    .insert({ repair_order_id: repairOrderId, kind: 'done', position, ...(await partRow(input)) });
  if (error) throw error;
}

export async function updatePartLine(id: string, input: PartLineInput) {
  const { data, error } = await supabase
    .from('ro_lines')
    .update(await partRow(input))
    .eq('id', id)
    .select('id');
  if (error) throw error;
  assertChanged(data);
}

export async function setPartOrderStatus(id: string, order_status: PartOrderStatus) {
  const { data, error } = await supabase.from('ro_lines').update({ order_status }).eq('id', id).select('id');
  if (error) throw error;
  assertChanged(data);
}

export async function deletePartLine(id: string) {
  const { data, error } = await supabase.from('ro_lines').delete().eq('id', id).select('id');
  if (error) throw error;
  assertChanged(data);
}

// ---------------------------------------------------------------- Sous-traitance

export interface SubcontractInput {
  service: string;
  supplier_name: string;
  cost_ht: number;
  margin_percent: number;
  sent_on: string;
  expected_return_on: string | null;
  status: SubcontractStatus;
  returned_on: string | null;
}

export async function saveSubcontract(
  repairOrderId: string,
  id: string | null,
  { supplier_name, ...input }: SubcontractInput,
) {
  const supplier_id = await ensureSupplier(supplier_name);
  if (!supplier_id) throw new Error('Indique le prestataire');
  const row = { ...input, supplier_id };
  const { data, error } = id
    ? await supabase.from('subcontracts').update(row).eq('id', id).select('id')
    : await supabase
        .from('subcontracts')
        .insert({ ...row, repair_order_id: repairOrderId })
        .select('id');
  if (error) throw error;
  assertChanged(data);
}

export async function deleteSubcontract(id: string) {
  const { data, error } = await supabase.from('subcontracts').delete().eq('id', id).select('id');
  if (error) throw error;
  assertChanged(data);
}

// ---------------------------------------------------------------- Consommables

/** Prix figés au moment de l'ajout ; le stock est décrémenté par la base. */
export async function addRoConsumable(repairOrderId: string, consumable: Consumable, quantity: number) {
  const { error } = await supabase.from('ro_consumables').insert({
    repair_order_id: repairOrderId,
    consumable_id: consumable.id,
    quantity,
    unit: consumable.unit,
    unit_sale_price: consumable.sale_price,
    unit_purchase_price: consumable.purchase_price,
  });
  if (error) throw error;
}

/** Retrait : la quantité revient en stock. */
export async function deleteRoConsumable(id: string) {
  const { data, error } = await supabase.from('ro_consumables').delete().eq('id', id).select('id');
  if (error) throw error;
  assertChanged(data);
}
