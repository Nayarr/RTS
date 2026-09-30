import { supabase } from '@/lib/supabase';

/**
 * Travaux réalisés avant le devis (diagnostic, contrôle…) : une fois le devis accepté,
 * le bureau décide pour chaque ligne de la facturer (facture séparée émise tout de
 * suite) ou de l'offrir (geste commercial, visible sur la facture avec 100 % de remise).
 */
export type PreQuoteDecision = 'billed' | 'offered';

export interface PreQuoteLine {
  id: string;
  description: string;
  hours: number | null;
  suggested_price: number;
}

export interface PreQuoteWork {
  repair_order_id: string;
  repair_order_number: string;
  quote_id: string;
  quote_number: string | null;
  lines: PreQuoteLine[];
}

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

/** Message de confirmation après la décision. */
export function settlementMessage(result: PreQuoteResult) {
  if (result.invoice_number) {
    return result.offered > 0
      ? `Facture ${result.invoice_number} émise (travaux offerts inclus avec 100 % de remise)`
      : `Facture ${result.invoice_number} émise`;
  }
  return 'Travaux offerts enregistrés';
}
