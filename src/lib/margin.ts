/**
 * Marge d'une pièce sur son prix d'achat (comme la base, part_sale_price) :
 * marge % = (vente HT - achat HT) / achat HT × 100. Les frais de port sont facturés à part.
 */

const round = (value: number) => Math.round(value * 100) / 100;

/** Marge en % (arrondie au centième), ou null sans prix d'achat ou sans prix de vente. */
export function marginPercent(purchase: number | null, sale: number | null): number | null {
  if (purchase === null || sale === null || purchase <= 0) return null;
  return round(((sale - purchase) / purchase) * 100);
}

/** Prix de vente HT pour une marge en % : achat 100 €, marge 30 % → 130 €. */
export function saleFromMargin(purchase: number | null, margin: number | null): number | null {
  if (purchase === null || margin === null) return null;
  return round(purchase * (1 + margin / 100));
}
