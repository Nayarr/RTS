import type { Enums } from '@/types/database';

export type TireCategory = Enums<'tire_category'>;
export type TireProfile = Enums<'tire_profile'>;
export type TireCondition = Enums<'tire_condition'>;
export type TireStatus = 'ok' | 'to_order' | 'out';

export const CATEGORY_LABELS: Record<TireCategory, string> = { pl: 'Poids lourd', vul: 'Utilitaire' };

export const PROFILE_LABELS: Record<TireProfile, string> = {
  avant: 'Avant',
  arriere: 'Arrière',
  remorque: 'Remorque',
  toutes: 'Toutes positions',
};

/** Libellé court d'une ligne : « 315/80 R22.5 avant ». */
export const lineLabel = (line: { size: string; profile: TireProfile }) =>
  line.profile === 'toutes' ? line.size : `${line.size} ${PROFILE_LABELS[line.profile].toLowerCase()}`;

export const CONDITION_LABELS: Record<TireCondition, string> = {
  neuf: 'Neuf',
  rechape: 'Rechapé',
  occasion: 'Occasion',
};

/** Profils d'une catégorie : avant, arrière ou remorque pour un poids lourd ; toutes positions pour un utilitaire. */
export const profilesFor = (category: TireCategory): TireProfile[] =>
  category === 'vul' ? ['toutes'] : ['avant', 'arriere', 'remorque'];

/**
 * Taille mise en forme pendant la saisie : « 31580225 » → « 315/80 R22.5 », « 2356516C » → « 235/65 R16C »
 * (barres, R et point posés tout seuls, comme sur la fiche de contrôle).
 */
export function formatTireSize(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const suffix = digits.length >= 7 && /c\s*$/i.test(value) ? 'C' : '';
  const rim = digits.slice(5);
  const rimText = rim.length === 3 ? `${rim.slice(0, 2)}.${rim[2]}` : rim;
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}/${digits.slice(3)}`;
  return `${digits.slice(0, 3)}/${digits.slice(3, 5)} R${rimText}${suffix}`;
}

/** Taille complète : 7 ou 8 chiffres (jante entière ou en demi-pouce). */
export const isTireSize = (value: string) => /^\d{3}\/\d{2} R\d{2}(\.\d)?C?$/.test(value);

/** Même clé que la base : chiffres seuls (la taille de la fiche de contrôle s'y compare). */
export const tireSizeKey = (value: string) => value.replace(/\D/g, '');

export const STATUS_LABELS: Record<TireStatus, string> = {
  ok: 'OK',
  to_order: 'À commander',
  out: 'Rupture',
};

export const statusClass = (status: TireStatus) => (status === 'ok' ? 's-ok' : 's-bad');

const plural = (count: number, word: string) => `${count} ${word}${Math.abs(count) > 1 ? 's' : ''}`;
export const tiresCount = (count: number) => plural(count, 'pneu');

/** Évolution des ventes : « +12 % vs mois dernier » (null sans ventes le mois d'avant). */
export function salesTrend(current: number, previous: number) {
  if (previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? '+' : ''}${change} % vs mois dernier`;
}
