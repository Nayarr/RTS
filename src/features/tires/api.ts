import type { InspectionData } from '@/features/repair-orders/inspection';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';
import type { TireCategory, TireCondition, TireProfile, TireStatus } from './domain';

/** Ligne du stock : une taille et un profil, toutes marques confondues. */
export interface TireLine {
  id: string;
  category: TireCategory;
  size: string;
  profile: TireProfile;
  min_qty: number;
  stock_qty: number;
  reserved_qty: number;
  available_qty: number;
  missing_qty: number;
  status: TireStatus;
  lots_count: number;
  brands: string | null;
  avg_purchase_price: number | null;
  sold_30d: number;
}

/** Lot de pneus : marque, modèle et état rangés sous une ligne. */
export interface TireLot {
  id: string;
  line_id: string;
  category: TireCategory;
  size: string;
  profile: TireProfile;
  brand_id: string;
  brand_name: string;
  model: string;
  condition: TireCondition;
  load_index: string | null;
  location: string | null;
  dot: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_price: number | null;
  sale_price: number | null;
  stock_qty: number;
  reserved_qty: number;
  available_qty: number;
  sold_90d: number;
  part_id: string | null;
  min_qty?: number;
}

export interface TireKpis {
  stock_qty: number;
  sizes: number;
  lots: number;
  to_order: number;
  out: number;
  sold_30d: number;
  sold_prev_30d: number;
  revenue_30d: number;
  margin_30d: number;
  margin_percent: number | null;
}

export type TireMovement = Tables<'tire_movements'> & {
  supplier_name: string | null;
  author_name: string | null;
  repair_order_number: string | null;
  plate: string | null;
  client_name: string | null;
};

export type TireBrand = Tables<'tire_brands'> & { lots: number; stock: number };
export type Supplier = Pick<Tables<'suppliers'>, 'id' | 'name' | 'email' | 'phone'>;

const FK_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

// Colonnes des vues : jamais nulles pour une ligne réelle
const toLine = (row: Tables<'v_tire_lines'>): TireLine => ({
  id: row.id ?? '',
  category: row.category ?? 'pl',
  size: row.size ?? '',
  profile: row.profile ?? 'avant',
  min_qty: row.min_qty ?? 0,
  stock_qty: row.stock_qty ?? 0,
  reserved_qty: row.reserved_qty ?? 0,
  available_qty: row.available_qty ?? 0,
  missing_qty: row.missing_qty ?? 0,
  status: (row.status ?? 'ok') as TireStatus,
  lots_count: row.lots_count ?? 0,
  brands: row.brands,
  avg_purchase_price: row.avg_purchase_price,
  sold_30d: row.sold_30d ?? 0,
});

const toLot = (row: Tables<'v_tire_lots'>): TireLot => ({
  id: row.id ?? '',
  line_id: row.line_id ?? '',
  category: row.category ?? 'pl',
  size: row.size ?? '',
  profile: row.profile ?? 'avant',
  brand_id: row.brand_id ?? '',
  brand_name: row.brand_name ?? '',
  model: row.model ?? '',
  condition: row.condition ?? 'neuf',
  load_index: row.load_index,
  location: row.location,
  dot: row.dot,
  supplier_id: row.supplier_id,
  supplier_name: row.supplier_name,
  purchase_price: row.purchase_price,
  sale_price: row.sale_price,
  stock_qty: row.stock_qty ?? 0,
  reserved_qty: row.reserved_qty ?? 0,
  available_qty: row.available_qty ?? 0,
  sold_90d: row.sold_90d ?? 0,
  part_id: row.part_id,
});

const PROFILE_ORDER: Record<TireProfile, number> = { avant: 0, arriere: 1, remorque: 2, multi: 3, toutes: 4 };

/** Lignes du stock : poids lourds d'abord, puis par taille et profil. */
export async function fetchTireLines(): Promise<TireLine[]> {
  const { data, error } = await supabase.from('v_tire_lines').select('*');
  if (error) throw error;
  return data
    .map(toLine)
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.size.localeCompare(b.size, 'fr', { numeric: true }) ||
        PROFILE_ORDER[a.profile] - PROFILE_ORDER[b.profile],
    );
}

export async function fetchTireLots(): Promise<TireLot[]> {
  const { data, error } = await supabase
    .from('v_tire_lots')
    .select('*')
    .eq('is_active', true)
    .order('stock_qty', { ascending: false });
  if (error) throw error;
  return data.map(toLot);
}

export async function fetchTireLot(id: string): Promise<TireLot | null> {
  const [lot, line] = await Promise.all([
    supabase.from('v_tire_lots').select('*').eq('id', id).maybeSingle(),
    supabase.from('tires').select('line:tire_lines(min_qty)').eq('id', id).maybeSingle(),
  ]);
  if (lot.error) throw lot.error;
  if (line.error) throw line.error;
  return lot.data ? { ...toLot(lot.data), min_qty: line.data?.line?.min_qty ?? 0 } : null;
}

export async function fetchTireKpis(): Promise<TireKpis> {
  const { data, error } = await supabase.rpc('tire_stock_kpis');
  if (error) throw error;
  const kpis = data as Record<string, number | null>;
  const value = (key: keyof TireKpis) => Number(kpis[key] ?? 0);
  return {
    stock_qty: value('stock_qty'),
    sizes: value('sizes'),
    lots: value('lots'),
    to_order: value('to_order'),
    out: value('out'),
    sold_30d: value('sold_30d'),
    sold_prev_30d: value('sold_prev_30d'),
    revenue_30d: value('revenue_30d'),
    margin_30d: value('margin_30d'),
    margin_percent:
      kpis.margin_percent === null || kpis.margin_percent === undefined ? null : Number(kpis.margin_percent),
  };
}

export async function fetchTireMovements(tireId: string): Promise<TireMovement[]> {
  const { data, error } = await supabase
    .from('tire_movements')
    .select(
      '*, supplier:suppliers(name), author:profiles(full_name), repair_order:repair_orders(number, vehicle:vehicles(plate), client:clients(name))',
    )
    .eq('tire_id', tireId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data.map(({ supplier, author, repair_order, ...movement }) => ({
    ...movement,
    supplier_name: supplier?.name ?? null,
    author_name: author?.full_name ?? null,
    repair_order_number: repair_order?.number ?? null,
    plate: repair_order?.vehicle?.plate ?? null,
    client_name: repair_order?.client?.name ?? null,
  }));
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('id, name, email, phone').order('name');
  if (error) throw error;
  return data;
}

/** Fournisseur saisi par son nom : créé s'il n'existe pas encore. */
export async function ensureSupplier(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_supplier', { p_name: name });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Entrées et corrections

export interface AddTiresInput {
  category: TireCategory;
  size: string;
  profile: TireProfile;
  brand: string;
  model: string;
  condition: TireCondition;
  quantity: number;
  purchase_price: number | null;
  sale_price: number | null;
  supplier_id: string | null;
  load_index: string | null;
  location: string | null;
  dot: string | null;
  min_qty: number | null;
}

/** Ajout au stock (même pneu qu'un lot existant : sa quantité et ses prix sont mis à jour). */
export async function addTires(input: AddTiresInput): Promise<string> {
  const { data, error } = await supabase.rpc('add_tires', {
    p_category: input.category,
    p_size: input.size,
    p_profile: input.profile,
    p_brand: input.brand,
    p_model: input.model,
    p_condition: input.condition,
    p_quantity: input.quantity,
    p_purchase_price: input.purchase_price as number,
    p_sale_price: input.sale_price as number,
    p_supplier_id: input.supplier_id ?? undefined,
    p_load_index: input.load_index ?? undefined,
    p_location: input.location ?? undefined,
    p_dot: input.dot ?? undefined,
    p_min_qty: input.min_qty ?? undefined,
  });
  if (error) throw error;
  return data;
}

export async function receiveTires(
  tireId: string,
  input: {
    quantity: number;
    purchase_price: number | null;
    supplier_id: string | null;
    reference: string | null;
  },
) {
  const { error } = await supabase.rpc('receive_tires', {
    p_tire_id: tireId,
    p_quantity: input.quantity,
    p_purchase_price: input.purchase_price ?? undefined,
    p_supplier_id: input.supplier_id ?? undefined,
    p_reference: input.reference ?? undefined,
  });
  if (error) throw error;
}

/** Sortie ou inventaire : stock compté, motif obligatoire (l'écart est gardé). */
export async function correctTireStock(tireId: string, counted: number, note: string) {
  const { error } = await supabase.rpc('correct_tire_stock', {
    p_tire_id: tireId,
    p_counted: counted,
    p_note: note,
  });
  if (error) throw error;
}

export interface TireLotUpdate {
  brand_id: string;
  model: string;
  condition: TireCondition;
  load_index: string | null;
  location: string | null;
  dot: string | null;
  supplier_id: string | null;
  purchase_price: number | null;
  sale_price: number | null;
}

export async function updateTireLot(id: string, input: TireLotUpdate) {
  const { error } = await supabase.from('tires').update(input).eq('id', id);
  if (error) {
    if (error.code === UNIQUE_VIOLATION)
      throw new Error('Un lot de la même marque, du même modèle et du même état existe déjà');
    throw error;
  }
}

export async function setTireMinQty(lineId: string, minQty: number) {
  const { data, error } = await supabase
    .from('tire_lines')
    .update({ min_qty: minQty })
    .eq('id', lineId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification réservée au bureau');
}

// ---------------------------------------------------------------- Marques et dimensions

export async function fetchTireBrands(): Promise<TireBrand[]> {
  const { data, error } = await supabase
    .from('tire_brands')
    .select('*, tires(stock_qty, is_active)')
    .order('name');
  if (error) throw error;
  return data.map(({ tires, ...brand }) => {
    const active = tires.filter((tire) => tire.is_active);
    return { ...brand, lots: active.length, stock: active.reduce((sum, tire) => sum + tire.stock_qty, 0) };
  });
}

export async function saveTireBrand(id: string | null, name: string) {
  const { error } = id
    ? await supabase.from('tire_brands').update({ name: name.trim() }).eq('id', id)
    : await supabase.from('tire_brands').insert({ name: name.trim() });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new Error('Cette marque existe déjà');
    throw error;
  }
}

export async function deleteTireBrand(id: string) {
  const { data, error } = await supabase.from('tire_brands').delete().eq('id', id).select('id');
  if (error) {
    if (error.code === FK_VIOLATION) throw new Error('Marque utilisée par des pneus : renomme-la plutôt');
    throw error;
  }
  if (!data.length) throw new Error('Suppression réservée à la direction');
}

export async function createTireLine(input: {
  category: TireCategory;
  size: string;
  profile: TireProfile;
  min_qty: number;
}) {
  const { error } = await supabase.from('tire_lines').insert(input);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new Error('Cette dimension existe déjà pour ce profil');
    throw error;
  }
}

export async function deleteTireLine(id: string) {
  const { data, error } = await supabase.from('tire_lines').delete().eq('id', id).select('id');
  if (error) {
    if (error.code === FK_VIOLATION) throw new Error('Des pneus sont rangés sous cette dimension');
    throw error;
  }
  if (!data.length) throw new Error('Suppression réservée à la direction');
}

// ---------------------------------------------------------------- Fournisseurs et demandes de chiffrage

export async function saveSupplier(
  id: string | null,
  input: { name: string; email: string | null; phone: string | null },
) {
  const row = {
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  };
  const { error } = id
    ? await supabase.from('suppliers').update(row).eq('id', id)
    : await supabase.from('suppliers').insert(row);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new Error('Ce fournisseur existe déjà');
    throw error;
  }
}

/** Nom et adresse de l'atelier : signature du mail. */
export async function fetchCompany() {
  const { data, error } = await supabase
    .from('company_settings')
    .select('legal_name, address_line, postal_code, city')
    .maybeSingle();
  if (error) throw error;
  return {
    name: data?.legal_name ?? '',
    address: data
      ? [data.address_line, [data.postal_code, data.city].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ')
      : '',
  };
}

export type TireQuoteRequest = Tables<'tire_quote_requests'>;

export async function fetchLastQuoteRequest(): Promise<TireQuoteRequest | null> {
  const { data, error } = await supabase
    .from('tire_quote_requests')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Demande gardée dans l'historique du stock (envoyée par l'appli ou copiée). */
export async function saveQuoteRequest(input: {
  lines: { size: string; profile: TireProfile; quantity: number }[];
  recipients: string[];
  channel: 'email' | 'copy';
  subject: string;
  body: string;
}) {
  const { error } = await supabase.from('tire_quote_requests').insert(input);
  if (error) throw error;
}

// ---------------------------------------------------------------- Pneus du stock au devis

/** Fiche de contrôle de l'OR : tailles relevées par le technicien. */
export async function fetchInspection(repairOrderId: string): Promise<InspectionData | null> {
  const { data, error } = await supabase
    .from('inspections')
    .select('data')
    .eq('repair_order_id', repairOrderId)
    .maybeSingle();
  if (error) throw error;
  return (data?.data ?? null) as InspectionData | null;
}

/** Lots d'une taille (même clé que la fiche de contrôle), pour la catégorie du véhicule. */
export async function fetchLotsForSize(sizeKey: string, category: TireCategory): Promise<TireLot[]> {
  const { data, error } = await supabase
    .from('v_tire_lots')
    .select('*')
    .eq('size_key', sizeKey)
    .eq('category', category)
    .eq('is_active', true);
  if (error) throw error;
  return data.map(toLot);
}
