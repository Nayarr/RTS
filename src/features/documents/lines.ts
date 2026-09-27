import type { Enums, Tables } from '@/types/database';

/**
 * Lignes chiffrées communes aux devis et aux factures : calculs identiques à la base
 * (`line_net_ht`, vues de totaux), forfaits applicables au véhicule.
 */
export type LineType = Enums<'line_type'>;
export type VehicleType = Enums<'vehicle_type'>;
export type LaborCategory = Enums<'labor_category'>;
export type ServicePackage = Tables<'service_packages'>;

export interface PricedLine {
  line_type: LineType;
  unit_price: number | null;
  quantity: number;
  discount_percent: number;
  vat_rate: number;
}

/** Ligne affichée dans un éditeur de document. */
export interface EditableLine extends PricedLine {
  id: string;
  description: string;
  /** Temps affiché à côté du type (estimé sur un devis, facturé sur une facture). */
  hours?: number | null;
}

/** Nouvelle ligne proposée par les boutons d'ajout (le document y ajoute section, position…). */
export interface NewLine {
  line_type: LineType;
  description?: string;
  unit_price?: number | null;
  quantity?: number;
  /** Temps de main d'œuvre saisi. */
  hours?: number | null;
  labor_category?: LaborCategory | null;
  standard_hours?: number | null;
  package_id?: string | null;
  part_id?: string | null;
  supplier_id?: string | null;
  purchase_price?: number | null;
  brand?: string | null;
  manufacturer_ref?: string | null;
  oem_ref?: string | null;
}

/** Même calcul que la base (`line_net_ht`) : prix × quantité − remise, arrondi au centime. */
export function lineNet(
  line: Pick<PricedLine, 'line_type' | 'unit_price' | 'quantity' | 'discount_percent'>,
) {
  if (line.line_type === 'text') return 0;
  const gross = (line.unit_price ?? 0) * line.quantity;
  return Math.round(gross * (1 - line.discount_percent / 100) * 100) / 100;
}

/** Totaux comme les vues de la base : TVA arrondie par taux. */
export function computeTotals(lines: PricedLine[]) {
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

export const nextPositionOf = (lines: { position: number }[]) =>
  Math.max(-1, ...lines.map((line) => line.position)) + 1;
