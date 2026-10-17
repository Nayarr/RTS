import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert } from '@/types/database';

export type Consumable = Tables<'consumables'>;
export type Part = Tables<'parts'> & { supplier_name: string | null };

const FK_VIOLATION = '23503';

// ---------------------------------------------------------------- Consommables

export async function fetchConsumables(): Promise<Consumable[]> {
  const { data, error } = await supabase.from('consumables').select('*').eq('is_active', true).order('name');
  if (error) throw error;
  return data;
}

export interface ConsumableInput {
  name: string;
  unit: string;
  sale_price: number;
  purchase_price: number;
  alert_threshold: number | null;
}

/** Création (avec stock de départ, tracé comme un inventaire) ou modification. */
export async function saveConsumable(id: string | null, input: ConsumableInput, initialStock: number | null) {
  if (id) {
    const { data, error } = await supabase.from('consumables').update(input).eq('id', id).select('id');
    if (error) throw error;
    if (!data.length) throw new Error('Modification réservée à la direction');
    return;
  }
  const { data, error } = await supabase.from('consumables').insert(input).select('id').single();
  if (error) throw error;
  if (initialStock) await setConsumableStock(data.id, initialStock, 'Stock de départ');
}

export async function restockConsumable(id: string, quantity: number, note: string | null) {
  const { error } = await supabase
    .from('consumable_movements')
    .insert({ consumable_id: id, quantity, reason: 'restock', note });
  if (error) throw error;
}

export async function setConsumableStock(id: string, quantity: number, note: string | null) {
  const { error } = await supabase.rpc('set_consumable_stock', {
    p_consumable_id: id,
    p_quantity: quantity,
    p_note: note ?? undefined,
  });
  if (error) throw error;
}

/**
 * Retire un consommable du catalogue. S'il a déjà servi sur un OR, il est archivé
 * (les OR et factures gardent la référence).
 */
export async function removeConsumable(id: string): Promise<'deleted' | 'archived'> {
  const { data, error } = await supabase.from('consumables').delete().eq('id', id).select('id');
  if (!error) {
    if (!data.length) throw new Error('Suppression réservée à la direction');
    return 'deleted';
  }
  if (error.code !== FK_VIOLATION) throw error;
  const archived = await supabase.from('consumables').update({ is_active: false }).eq('id', id);
  if (archived.error) throw archived.error;
  return 'archived';
}

// ---------------------------------------------------------------- Pièces

/** Caractères spéciaux des filtres PostgREST retirés de la recherche. */
const searchTerm = (value: string) => value.replace(/[%_,()*\\]/g, ' ').trim();

export async function fetchParts(search: string): Promise<Part[]> {
  let query = supabase
    .from('parts')
    .select('*, supplier:suppliers(name)')
    .eq('is_active', true)
    .order('designation')
    .limit(200);
  const term = searchTerm(search);
  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      ['designation', 'brand', 'manufacturer_ref', 'oem_ref', 'vehicle_ref']
        .map((column) => `${column}.ilike.${pattern}`)
        .join(','),
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return data.map(({ supplier, ...part }) => ({ ...part, supplier_name: supplier?.name ?? null }));
}

/** Fournisseur saisi par son nom : retrouvé ou créé. */
export async function ensureSupplier(name: string): Promise<string | null> {
  if (!name.trim()) return null;
  const { data, error } = await supabase.rpc('ensure_supplier', { p_name: name });
  if (error) throw error;
  return data;
}

export type PartInput = Omit<TablesInsert<'parts'>, 'supplier_id'> & { supplier_name: string };

/** Enregistre la pièce dans la base (création ou mise à jour) et renvoie son identifiant. */
export async function savePart(id: string | null, { supplier_name, ...input }: PartInput): Promise<string> {
  const row = { ...input, supplier_id: await ensureSupplier(supplier_name) };
  const { data, error } = id
    ? await supabase.from('parts').update(row).eq('id', id).select('id')
    : await supabase.from('parts').insert(row).select('id');
  if (error) throw error;
  const saved = data[0];
  if (!saved) throw new Error('Base de pièces modifiable par le bureau seulement');
  return saved.id;
}

/**
 * Pièce ajoutée à un devis ou un OR, gardée au catalogue : même désignation, même référence et
 * même marque qu'une pièce existante → ses prix sont mis à jour ; sinon nouvelle pièce.
 */
export async function saveCatalogPart(input: PartInput): Promise<string> {
  const { data: existing, error } = await supabase.rpc('find_catalog_part', {
    p_designation: input.designation,
    p_manufacturer_ref: input.manufacturer_ref ?? '',
    p_brand: input.brand ?? '',
  });
  if (error) throw error;
  return savePart(existing ?? null, { ...input, is_active: true });
}

/** Pièce de la base avec ses chiffres (factures émises) : utilisations, ventes, marge. */
export type PartStats = Tables<'v_part_stats'> & { id: string; designation: string };

export async function fetchPartStats(): Promise<PartStats[]> {
  const { data, error } = await supabase
    .from('v_part_stats')
    .select('*')
    .order('quantity_sold', { ascending: false })
    .order('designation')
    .limit(1000);
  if (error) throw error;
  return data as PartStats[];
}

export async function deletePart(id: string) {
  const { data, error } = await supabase.from('parts').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression réservée à la direction');
}

// ---------------------------------------------------------------- Forfaits

export type ServicePackage = Tables<'service_packages'>;

export async function fetchPackages(): Promise<ServicePackage[]> {
  const { data, error } = await supabase
    .from('service_packages')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data;
}

export type PackageInput = Pick<
  TablesInsert<'service_packages'>,
  'name' | 'category' | 'standard_hours' | 'price' | 'details' | 'keywords' | 'trigger_fields'
>;

export async function savePackage(id: string | null, input: PackageInput) {
  const { data, error } = id
    ? await supabase.from('service_packages').update(input).eq('id', id).select('id')
    : await supabase.from('service_packages').insert(input).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Forfaits modifiables par la direction seulement');
}

/** Retire un forfait : archivé, pour que les OR, devis et factures qui l'utilisent gardent leur lien. */
export async function removePackage(id: string) {
  const { data, error } = await supabase
    .from('service_packages')
    .update({ is_active: false })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression réservée à la direction');
}
