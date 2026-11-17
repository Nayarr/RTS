import { z } from 'zod';

/** SIRET saisi (espaces, points) → chiffres seuls, comme en base. */
export const siretDigits = (value: string) => value.replace(/\D/g, '');

/**
 * SIRET valide, même règle que la base (`is_valid_siret`) : 14 chiffres et clé de Luhn.
 * La Poste (SIREN 356 000 000) fait exception : somme des chiffres multiple de 5.
 */
export function isValidSiret(value: string): boolean {
  const siret = siretDigits(value);
  if (!/^\d{14}$/.test(value.replace(/[\s.]/g, ''))) return false;
  const digits = [...siret].map(Number);
  if (siret.startsWith('356000000')) return digits.reduce((sum, d) => sum + d, 0) % 5 === 0;
  const sum = digits.reduce((total, digit, index) => {
    if ((13 - index) % 2 === 0) return total + digit;
    const doubled = digit * 2;
    return total + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return sum % 10 === 0;
}

/** « 98498913700018 » → « 984 989 137 00018 » (SIREN puis NIC). */
export const formatSiret = (value: string | null | undefined) => {
  const siret = siretDigits(value ?? '');
  return siret.length === 14
    ? `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`
    : (value ?? '');
};

/** Erreur d'un SIRET saisi (vide accepté), ou null s'il est bon. */
export function siretProblem(value: string): string | null {
  const text = value.trim();
  if (text === '') return null;
  if (!/^\d{14}$/.test(text.replace(/[\s.]/g, ''))) return 'SIRET à 14 chiffres';
  return isValidSiret(text) ? null : 'SIRET invalide : vérifie les chiffres';
}

/** Champ SIRET d'un formulaire : vide accepté, sinon 14 chiffres et clé de contrôle. */
export const siretField = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const problem = siretProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** Valeur enregistrée : chiffres seuls, ou null. */
export const siretValue = (value: string) => siretDigits(value) || null;
