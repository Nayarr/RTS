import { formatQuantity } from '@/lib/numbers';
import { supabase } from '@/lib/supabase';

/**
 * Travaux réalisés avant le devis (expertise : diagnostic, contrôle…) : une fois le devis
 * accepté, le bureau décide pour chaque ligne de la facturer ou de l'offrir (geste commercial,
 * visible sur la facture avec 100 % de remise). La facture est émise et envoyée dans tous les cas.
 * Plus d'1 h d'expertise : la première heure est offerte par défaut, mais chaque ligne reste au choix
 * du bureau (facturée en entier, ou offerte en entier).
 */
export type PreQuoteDecision = 'billed' | 'offered';

/** Choix affiché pour une ligne : facturée (part de la 1re heure offerte), facturée en entier, offerte. */
export type PreQuoteChoiceKind = 'billed' | 'billed_full' | 'offered';

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
  /** Prix de la ligne entière (facturée sans heure offerte, ou valeur du geste commercial). */
  full_price: number;
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

/** Ligne concernée par la 1re heure offerte (expertise de plus d'1 h). */
export const hasOfferedHour = (work: PreQuoteWork, line: PreQuoteLine) =>
  work.first_hour_offered && line.is_labor && line.offered_hours > 0;

/** Choix par défaut : la 1re heure offerte, le reste facturé. */
export const defaultChoice = (work: PreQuoteWork, line: PreQuoteLine): PreQuoteChoiceKind =>
  hasOfferedHour(work, line) && (line.billed_hours ?? 0) <= 0 ? 'offered' : 'billed';

/** Choix proposés pour la ligne, avec leur libellé. */
export function choiceOptions(
  work: PreQuoteWork,
  line: PreQuoteLine,
): { value: PreQuoteChoiceKind; label: string }[] {
  if (!hasOfferedHour(work, line)) {
    return [
      { value: 'billed', label: 'Facturer' },
      { value: 'offered', label: 'Offrir (geste commercial)' },
    ];
  }
  if ((line.billed_hours ?? 0) <= 0) {
    return [
      { value: 'offered', label: 'Offrir (1re heure d’expertise)' },
      { value: 'billed_full', label: 'Facturer' },
    ];
  }
  return [
    { value: 'billed', label: 'Facturer, 1re heure offerte' },
    { value: 'billed_full', label: 'Facturer tout' },
    { value: 'offered', label: 'Offrir (geste commercial)' },
  ];
}

/** Prix proposé pour un choix : la part facturée, ou la ligne entière. */
export const choicePrice = (work: PreQuoteWork, line: PreQuoteLine, choice: PreQuoteChoiceKind) =>
  choice === 'billed' && hasOfferedHour(work, line) ? line.suggested_price : line.full_price;

/** Ce qui est envoyé au serveur pour ce choix. */
export const toDecision = (
  choice: PreQuoteChoiceKind,
): { decision: PreQuoteDecision; first_hour: boolean } => ({
  decision: choice === 'offered' ? 'offered' : 'billed',
  first_hour: choice !== 'billed_full',
});

/** Explication sous la ligne concernée par la 1re heure offerte. */
export function choiceHint(line: PreQuoteLine, choice: PreQuoteChoiceKind) {
  const billed = formatQuantity(line.billed_hours ?? 0);
  const offered = formatQuantity(line.offered_hours);
  if (choice === 'billed_full')
    return `${formatQuantity(line.hours ?? 0)} h facturée(s), 1re heure repassée en payante.`;
  if (choice === 'offered') {
    return (line.billed_hours ?? 0) <= 0
      ? 'Offert : compris dans la première heure d’expertise.'
      : 'Offert en entier (geste commercial).';
  }
  return `${billed} h facturée(s), ${offered} h offerte(s) (1re heure d’expertise).`;
}

export interface PreQuoteChoice {
  line_id: string;
  decision: PreQuoteDecision;
  price: number | null;
  /** false : la 1re heure offerte est repassée en payante sur cette ligne. */
  first_hour: boolean;
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
