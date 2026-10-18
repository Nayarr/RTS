/**
 * Échéance au mois (contrôle hayon) : enregistrée au 1er jour du mois (« 2025-05-01 »), valable
 * jusqu'à la fin de ce mois, affichée « 05/2025 ». Les étiquettes la donnent au format MMAAAA.
 */

/** « 052025 » → « 2025-05-01 » (null si le format ne va pas). */
export function monthFromLabel(value: string | null | undefined): string | null {
  const match = /^(\d{2})(\d{4})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const month = Number(match[1]);
  return month >= 1 && month <= 12 ? `${match[2]}-${match[1]}-01` : null;
}

/** « 2025-05-01 » (ou n'importe quel jour de mai 2025) → « 05/2025 ». */
export const monthLabel = (iso: string | null | undefined) =>
  iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '-';

/** Dernier jour du mois : « 2025-02-01 » → « 2025-02-28 ». */
export function monthEnd(iso: string): string {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Même mois au 1er jour : « 2025-05-17 » → « 2025-05-01 ». */
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Mois décalé de `months`, au 1er jour : « 2026-10-18 » et 6 → « 2027-04-01 ». */
export function addMonths(iso: string, months: number): string {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}
