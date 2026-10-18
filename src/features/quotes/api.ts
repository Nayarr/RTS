import { supabase } from '@/lib/supabase';
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@/types/database';
import type { SignatureRequest } from '@/features/signature/api';

export type QuoteStatus = Enums<'quote_status'>;
export type QuoteSection = Enums<'quote_section'>;
export type VehicleType = Enums<'vehicle_type'>;
export type QuoteLine = Tables<'quote_lines'>;

type OverviewRow = Tables<'v_quotes_overview'>;
type Guaranteed = 'id' | 'status' | 'vehicle_type' | 'created_at' | 'total_ht' | 'total_vat' | 'total_ttc';

/** Devis avec client, véhicule, OR et totaux ; les colonnes toujours renseignées sont non nulles. */
export type QuoteOverview = Omit<OverviewRow, Guaranteed> & {
  [K in Guaranteed]: NonNullable<OverviewRow[K]>;
};

export interface QuoteDetail {
  quote: QuoteOverview;
  lines: QuoteLine[];
  /** Taux horaire applicable (client, sinon type de véhicule) et remise du client. */
  laborRate: number;
  clientDiscount: number;
  /** Adresse et SIRET du client, imprimés sur le PDF. */
  clientBilling?: { billing_address: string | null; siret: string | null } | null;
}

const NO_CLIENT = '00000000-0000-0000-0000-000000000000';

// ---------------------------------------------------------------- Lecture

export async function fetchQuotes(): Promise<QuoteOverview[]> {
  const { data, error } = await supabase
    .from('v_quotes_overview')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data as QuoteOverview[];
}

export async function fetchRepairOrderQuotes(repairOrderId: string): Promise<QuoteOverview[]> {
  const { data, error } = await supabase
    .from('v_quotes_overview')
    .select('*')
    .eq('repair_order_id', repairOrderId)
    .order('created_at');
  if (error) throw error;
  return data as QuoteOverview[];
}

export async function fetchQuote(id: string): Promise<QuoteDetail | null> {
  const [quote, lines] = await Promise.all([
    supabase.from('v_quotes_overview').select('*').eq('id', id).maybeSingle(),
    supabase.from('quote_lines').select('*').eq('quote_id', id).order('section').order('position'),
  ]);
  if (quote.error) throw quote.error;
  if (lines.error) throw lines.error;
  if (!quote.data) return null;
  const overview = quote.data as QuoteOverview;

  const [rate, client] = await Promise.all([
    supabase.rpc('labor_rate_for', {
      // Sans client : le taux standard du type de véhicule s'applique.
      p_client_id: overview.client_id ?? NO_CLIENT,
      p_vehicle_type: overview.vehicle_type,
    }),
    overview.client_id
      ? supabase
          .from('clients')
          .select('discount_percent, billing_address, siret')
          .eq('id', overview.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (rate.error) throw rate.error;
  if (client.error) throw client.error;
  return {
    quote: overview,
    lines: lines.data,
    laborRate: rate.data,
    clientDiscount: client.data?.discount_percent ?? 0,
    clientBilling: client.data
      ? { billing_address: client.data.billing_address, siret: client.data.siret }
      : null,
  };
}

// ---------------------------------------------------------------- Devis

export interface NewQuoteInput {
  client_name: string;
  plate: string;
  vehicle_type: VehicleType;
}

export async function createQuote(input: NewQuoteInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_quote', {
    p_client_name: input.client_name,
    p_plate: input.plate || undefined,
    p_vehicle_type: input.vehicle_type,
  });
  if (error) throw error;
  return data.id;
}

/** Crée ou reprend le devis de l'OR, avec ses travaux chiffrés. Renvoie l'id du devis. */
export async function buildQuoteFromRepairOrder(repairOrderId: string): Promise<string> {
  const { data, error } = await supabase.rpc('build_quote_from_repair_order', {
    p_repair_order_id: repairOrderId,
  });
  if (error) throw error;
  return data;
}

export async function updateQuote(id: string, patch: TablesUpdate<'quotes'>) {
  const { data, error } = await supabase.from('quotes').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification non autorisée');
}

/** Numéro (et date de validité) attribués à la première génération ; `markSent` : devis envoyé. */
export async function assignQuoteNumber(id: string, markSent: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('assign_quote_number', {
    p_quote_id: id,
    p_mark_sent: markSent,
  });
  if (error) throw error;
  return data;
}

export async function setQuoteResponse(id: string, status: 'accepted' | 'refused' | 'in_progress') {
  const { error } = await supabase.rpc('set_quote_response', { p_quote_id: id, p_status: status });
  if (error) throw error;
}

export interface OrderFromQuoteInput {
  technicianId: string | null;
  /** Début prévu (AAAA-MM-JJ, HH:MM) : annoncé au technicien dès la création. */
  plannedDate: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  /** Direction : fiche de contrôle complète exigée avant « Travaux terminés ». */
  inspectionRequired?: boolean;
}

/**
 * OR créé avec les travaux acceptés (ou devis sans OR transformé) : les travaux du devis deviennent
 * les travaux effectués, avec leur temps estimé. Renvoie l'id de l'OR.
 */
export async function createRepairOrderFromQuote(id: string, input: OrderFromQuoteInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_repair_order_from_quote', {
    p_quote_id: id,
    p_technician_id: input.technicianId ?? undefined,
    p_planned_date: input.plannedDate ?? undefined,
    p_planned_start: input.plannedStart ?? undefined,
    p_planned_end: input.plannedEnd ?? undefined,
    p_inspection_required: input.inspectionRequired ?? false,
  });
  if (error) throw error;
  return data;
}

/** Lien à signer : numéro attribué, devis « Envoyé ». Renvoie le jeton du lien public. */
export async function shareQuote(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('share_quote', { p_quote_id: id });
  if (error) throw error;
  return data;
}

/** Copie du devis en brouillon (mêmes client, véhicule, lignes et OR) ; renvoie son identifiant. */
export async function duplicateQuote(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_quote', { p_quote_id: id });
  if (error) throw error;
  return data;
}

/** Bureau : affiche le devis sur la borne pendant 1 minute pour la signature du client présent. */
export async function requestQuoteKioskSignature(id: string) {
  const { data, error } = await supabase.rpc('request_quote_signature', { p_quote_id: id });
  if (error) throw error;
  return data as unknown as SignatureRequest;
}

/** Dernière demande de signature du devis sur la borne, ou null. */
export async function fetchQuoteSignatureRequest(id: string) {
  const { data, error } = await supabase.rpc('quote_signature_request', { p_quote_id: id });
  if (error) throw error;
  return (data as unknown as SignatureRequest | null) ?? null;
}

export async function deleteQuote(id: string) {
  const { data, error } = await supabase.from('quotes').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression non autorisée');
}

// ---------------------------------------------------------------- Lignes

export type NewQuoteLine = Omit<TablesInsert<'quote_lines'>, 'quote_id'>;

export async function addQuoteLine(quoteId: string, line: NewQuoteLine) {
  const { error } = await supabase.from('quote_lines').insert({ ...line, quote_id: quoteId });
  if (error) throw error;
}

export async function updateQuoteLine(id: string, patch: TablesUpdate<'quote_lines'>) {
  const { data, error } = await supabase.from('quote_lines').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification non autorisée');
}

export async function deleteQuoteLine(id: string) {
  const { data, error } = await supabase.from('quote_lines').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression non autorisée');
}
