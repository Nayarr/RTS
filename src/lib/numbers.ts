import { z } from 'zod';

/** Espaces, y compris insécables (copier-coller depuis un tableur ou un PDF). */
const SPACES = /\s/g;

/**
 * Nombre saisi au clavier français (« 12,50 », « 1 250 ») : null si vide,
 * NaN si la saisie n'est pas un nombre.
 */
export function parseDecimal(value: string): number | null {
  const normalized = value.replace(SPACES, '').replace(',', '.');
  if (normalized === '') return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

/** Champ texte contenant un nombre positif (2 décimales au plus). */
export function decimalField({
  required = false,
  positive = false,
}: { required?: boolean; positive?: boolean } = {}) {
  return z.string().superRefine((value, ctx) => {
    const parsed = parseDecimal(value);
    if (parsed === null) {
      if (required) ctx.addIssue({ code: 'custom', message: 'Champ obligatoire' });
      return;
    }
    if (Number.isNaN(parsed)) {
      ctx.addIssue({ code: 'custom', message: 'Nombre attendu (ex : 12,50)' });
    } else if (!/^\d+([.,]\d{1,2})?$/.test(value.replace(SPACES, ''))) {
      ctx.addIssue({ code: 'custom', message: '2 décimales au maximum' });
    } else if (positive && parsed <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Doit être supérieur à 0' });
    }
  });
}

/** Valeur d'un champ validé par `decimalField` (vide → null). */
export const decimalValue = (value: string) => parseDecimal(value) ?? null;

/** Nombre → texte du champ (virgule décimale). */
export const decimalText = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value).replace('.', ',');

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const quantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export const formatEuro = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : euro.format(value);

export const formatQuantity = (value: number) => quantity.format(value);

/** Marge sur le prix d'achat, en % (null sans prix d'achat). */
export const marginPercent = (purchase: number | null, sale: number | null) =>
  purchase && sale !== null ? Math.round(((sale - purchase) / purchase) * 100) : null;
