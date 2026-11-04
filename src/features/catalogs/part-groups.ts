import type { PartStats } from './api';

/** Références comparées sans casse ni séparateurs : « 5010-477 842 » = « 5010477842 ». */
export const refKey = (value: string | null | undefined) =>
  (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const plainText = (value: string | null) => (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Une pièce : les fiches (références fabricant / fournisseur) de même référence constructeur. */
export interface PartGroup {
  key: string;
  oemRef: string | null;
  designation: string;
  variants: PartStats[];
  quantitySold: number;
  quotesCount: number;
  revenue: number;
  margin: number;
}

function partGroup(key: string, variants: PartStats[]): PartGroup {
  const [first] = variants as [PartStats, ...PartStats[]];
  const total = (pick: (part: PartStats) => number | null) =>
    variants.reduce((sum, part) => sum + (pick(part) ?? 0), 0);
  return {
    key,
    oemRef: first.oem_ref,
    designation: first.designation,
    variants,
    quantitySold: total((part) => part.quantity_sold),
    quotesCount: total((part) => part.quotes_count),
    revenue: total((part) => part.revenue_ht),
    margin: total((part) => part.margin_ht),
  };
}

/** Fiches regroupées par référence constructeur ; sans référence constructeur : pièce à part entière. */
export function groupParts(parts: PartStats[]): PartGroup[] {
  const byOem = new Map<string, PartStats[]>();
  for (const part of parts) {
    const key = refKey(part.oem_ref) || `id:${part.id}`;
    byOem.set(key, [...(byOem.get(key) ?? []), part]);
  }
  return [...byOem].map(([key, variants]) => partGroup(key, variants));
}

/** Désignation, marque, véhicule, fournisseur ou référence (avec ou sans séparateurs). */
export function partMatches(part: PartStats, search: string) {
  const term = plainText(search.trim());
  if (!term) return true;
  const key = refKey(search);
  return (
    [
      part.designation,
      part.brand,
      part.vehicle_ref,
      part.supplier_name,
      part.manufacturer_ref,
      part.oem_ref,
    ].some((value) => plainText(value).includes(term)) ||
    (key !== '' && [part.manufacturer_ref, part.oem_ref].some((value) => refKey(value).includes(key)))
  );
}

/** Pièces dont au moins une référence correspond : toutes ses références équivalentes restent affichées. */
export const filterGroups = (groups: PartGroup[], search: string) =>
  groups.filter((group) => group.variants.some((part) => partMatches(part, search)));
