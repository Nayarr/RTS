import { z } from 'zod';

/** IBAN ou BIC saisi (espaces, minuscules) → lettres et chiffres en majuscules, comme en base. */
export const bankCode = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();

/** IBAN valide : pays, clé à 2 chiffres, compte ; clé de contrôle ISO 13616 (modulo 97). */
export function isValidIban(value: string): boolean {
  const iban = bankCode(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (letter) =>
    String(letter.charCodeAt(0) - 55),
  );
  // Reste de la division par 97, par morceaux (le nombre dépasse la précision des nombres)
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}

/** BIC valide : 8 ou 11 caractères (banque, pays, ville, agence). */
export const isValidBic = (value: string) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bankCode(value));

/** « FR1420041010050500013M02606 » → « FR14 2004 1010 0505 0001 3M02 606 » (groupes de 4). */
export const formatIban = (value: string | null | undefined) =>
  bankCode(value ?? '').replace(/(.{4})(?=.)/g, '$1 ');

/** Champ IBAN d'un formulaire : vide accepté, sinon clé de contrôle juste. */
export const ibanField = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidIban(value), 'IBAN invalide : vérifie les caractères');

export const bicField = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidBic(value), 'BIC à 8 ou 11 caractères (ex. QNTOFRP1XXX)');

/** Valeur enregistrée : sans espaces, ou null. */
export const bankValue = (value: string) => bankCode(value) || null;
