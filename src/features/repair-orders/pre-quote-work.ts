import { supabase } from '@/lib/supabase';

/**
 * Travaux réalisés avant le devis (expertise : diagnostic, contrôle…) : une fois le devis
 * accepté, le bureau décide pour chaque ligne de la facturer ou de l'offrir (geste commercial,
 * visible sur la facture avec 100 % de remise). La facture est émise et envoyée dans tous les cas.
 * Plus d'1 h d'expertise : facturée moins 1 h, la première heure est offerte d'office.
 */
export type PreQuoteDecision = 'billed' | 'offered';

export interface PreQuoteLine {
  id: string;
  description: string;
  hours: number | null;
  /** Main-d'œuvre avec un temps : compte dans le temps d'expertise. */
  is_labor: boolean;
  /** Part de la première heure offerte (plus d'1 h d'expertise). */
  offered_hours: number;
  billed_hours: number | null;
  /** Prix proposé de la part facturée. */
  suggested_price: number;
}

export interface PreQuoteWork {
  repair_order_id: string;
  repair_order_number: string;
  quote_id: string;
  quote_number: string | null;
  /** Temps d'expertise : heures de main-d'œuvre réalisées avant le devis. */
  expertise_hours: number;
  /** Plus d'1 h d'expertise : facturée moins 1 h (décision imposée sur la main-d'œuvre). */
  first_hour_offered: boolean;
  lines: PreQuoteLine[];
}

/** Ligne dont la décision est imposée par la règle de l'expertise (plus d'1 h). */
export const isForced = (work: PreQuoteWork, line: PreQuoteLine) => work.first_hour_offered && line.is_labor;

/** Décision imposée : facturée s'il reste du temps après la première heure offerte. */
export const forcedDecision = (line: PreQuoteLine): PreQuoteDecision =>
  (line.billed_hours ?? 0) > 0 ? 'billed' : 'offered';

export interface PreQuoteChoice {
  line_id: string;
  decision: PreQuoteDecision;
  price: number | null;
}

export interface PreQuoteResult {
  invoice_id: string | null;
  invoice_number: string | null;
  billed: number;
  offered: number;
}

export const preQuoteWorkKey = (repairOrderId: string) => ['pre-quote-work', repairOrderId] as const;

/** Décision en attente pour cet OR, ou null (rien à trancher). */
export async function fetchPreQuoteWork(repairOrderId: string): Promise<PreQuoteWork | null> {
  const { data, error } = await supabase.rpc('pre_quote_work', { p_repair_order_id: repairOrderId });
  if (error) throw error;
  return (data as unknown as PreQuoteWork | null) ?? null;
}

export async function settlePreQuoteWork(repairOrderId: string, choices: PreQuoteChoice[]) {
  const { data, error } = await supabase.rpc('settle_pre_quote_work', {
    p_repair_order_id: repairOrderId,
    p_decisions: choices as unknown as never,
  });
  if (error) throw error;
  return data as unknown as PreQuoteResult;
}

/** Première ligne de la description (le reste est le détail du technicien). */
export const lineTitle = (description: string) => description.split('\n')[0] ?? '';

/** Message de confirmation après la décision (la facture est émise dans tous les cas). */
export function settlementMessage(result: PreQuoteResult) {
  const number = result.invoice_number ?? '';
  if (result.billed === 0) return `Facture ${number} émise à 0 € : tout est offert, mention sur la facture`;
  return result.offered > 0
    ? `Facture ${number} émise (travaux offerts inclus avec 100 % de remise)`
    : `Facture ${number} émise`;
}
