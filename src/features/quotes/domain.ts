import type { LaborCategory } from '@/features/settings/api';
import type { QuoteLine, QuoteStatus, ServicePackage, VehicleType } from './api';

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: 'À faire', color: '#6B7280' },
  in_progress: { label: 'En cours', color: '#C98A00' },
  sent: { label: 'Envoyé', color: '#4750B5' },
  accepted: { label: 'Accepté', color: '#2A6B52' },
  refused: { label: 'Refusé', color: '#B5453A' },
};

export const QUOTE_STATUS_ORDER: QuoteStatus[] = ['draft', 'in_progress', 'sent', 'accepted', 'refused'];

/** Même calcul que la base (`line_net_ht`) : prix × quantité − remise, arrondi au centime. */
export function lineNet(line: Pick<QuoteLine, 'line_type' | 'unit_price' | 'quantity' | 'discount_percent'>) {
  if (line.line_type === 'text') return 0;
  const gross = (line.unit_price ?? 0) * line.quantity;
  return Math.round(gross * (1 - line.discount_percent / 100) * 100) / 100;
}

/** Totaux comme la vue `v_quote_totals` : TVA arrondie par taux. */
export function computeTotals(lines: QuoteLine[]) {
  const bases = new Map<number, number>();
  for (const line of lines) {
    if (line.line_type === 'text') continue;
    bases.set(line.vat_rate, (bases.get(line.vat_rate) ?? 0) + lineNet(line));
  }
  let ht = 0;
  let vat = 0;
  const rates: { rate: number; amount: number }[] = [];
  for (const [rate, base] of bases) {
    const amount = Math.round(base * rate) / 100;
    ht += base;
    vat += amount;
    rates.push({ rate, amount });
  }
  ht = Math.round(ht * 100) / 100;
  vat = Math.round(vat * 100) / 100;
  return { ht, vat, ttc: Math.round((ht + vat) * 100) / 100, rates };
}

/** Forfait applicable au type de véhicule (même règle que `package_fits_vehicle`). */
export function packageFitsVehicle(category: LaborCategory | null, vehicleType: VehicleType) {
  if (category === null) return true;
  if (vehicleType === 'pl' || vehicleType === 'remorque')
    return ['pl', 'remorque', 'tolerie'].includes(category);
  return ['vul', 'tolerie'].includes(category);
}

export const packagesFor = (packages: ServicePackage[], vehicleType: VehicleType) =>
  packages.filter((item) => packageFitsVehicle(item.category, vehicleType));

/** « Travaux déjà effectués » imprimés sur le devis : seulement ceux qui ont un prix (comme l'ancienne appli). */
export const pricedDoneLines = (lines: QuoteLine[]) =>
  lines.filter((line) => line.section === 'done' && line.line_type !== 'text' && (line.unit_price ?? 0) > 0);

export const nextPosition = (lines: QuoteLine[], section: QuoteLine['section']) =>
  Math.max(-1, ...lines.filter((line) => line.section === section).map((line) => line.position)) + 1;

/** Un devis accepté est figé ; un devis rattaché ou transformé ne se modifie plus non plus. */
export const isQuoteLocked = (quote: { status: QuoteStatus; merged_into_repair_order_id: string | null }) =>
  quote.status === 'accepted' || quote.merged_into_repair_order_id !== null;
