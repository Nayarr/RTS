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
  /** Frais de port de la ligne (port de la pièce × quantité). */
  shipping_cost?: number | null;
  brand?: string | null;
  manufacturer_ref?: string | null;
  oem_ref?: string | null;
}

// Montants calculés en centimes entiers (BigInt), exactement comme les colonnes numeric de
// la base : les nombres à virgule du navigateur faisaient dévier ~3 % des totaux d'un centime.

/** Valeur à 2 décimales au plus (prix, quantité, remise, taux : numeric(…, 2) en base) → entier ×100. */
const hundredths = (value: number) => BigInt(Math.round(value * 100));

/** Division entière arrondie au plus proche, moitié vers le haut (round() de Postgres, montants positifs). */
const divRound = (numerator: bigint, denominator: bigint) =>
  (numerator * 2n + denominator) / (denominator * 2n);

const euros = (cents: bigint) => Number(cents) / 100;

/** Net de la ligne en centimes : prix × quantité × (1 − remise), arrondi au centime. */
function lineNetCents(line: Pick<PricedLine, 'line_type' | 'unit_price' | 'quantity' | 'discount_percent'>) {
  if (line.line_type === 'text') return 0n;
  const price = hundredths(line.unit_price ?? 0); // centimes
  const quantity = hundredths(line.quantity); // × 100
  const kept = 10_000n - hundredths(line.discount_percent); // (100 − remise) × 100
  return divRound(price * quantity * kept, 1_000_000n);
}

/** Même calcul que la base (`line_net_ht`) : prix × quantité − remise, arrondi au centime. */
export function lineNet(
  line: Pick<PricedLine, 'line_type' | 'unit_price' | 'quantity' | 'discount_percent'>,
) {
  return euros(lineNetCents(line));
}

/** Totaux comme les vues de la base : TVA arrondie par taux. */
export function computeTotals(lines: PricedLine[]) {
  const bases = new Map<number, bigint>();
  for (const line of lines) {
    if (line.line_type === 'text') continue;
    bases.set(line.vat_rate, (bases.get(line.vat_rate) ?? 0n) + lineNetCents(line));
  }
  let ht = 0n;
  let vat = 0n;
  const rates: { rate: number; amount: number }[] = [];
  for (const [rate, base] of bases) {
    const amount = divRound(base * hundredths(rate), 10_000n); // base × taux / 100
    ht += base;
    vat += amount;
    rates.push({ rate, amount: euros(amount) });
  }
  return { ht: euros(ht), vat: euros(vat), ttc: euros(ht + vat), rates };
}

/** Ligne offerte (geste commercial) : chiffrée, avec 100 % de remise. */
export const isOfferedLine = (line: Pick<PricedLine, 'line_type' | 'unit_price' | 'discount_percent'>) =>
  line.line_type !== 'text' && line.discount_percent >= 100 && (line.unit_price ?? 0) > 0;

/** Valeur des prestations offertes (prix × quantité), affichée « Dont offert ». */
export function offeredTotal(lines: PricedLine[]) {
  let cents = 0n;
  for (const line of lines) {
    if (isOfferedLine(line)) cents += lineNetCents({ ...line, discount_percent: 0 });
  }
  return euros(cents);
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
