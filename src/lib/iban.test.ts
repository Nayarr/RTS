import { describe, expect, it } from 'vitest';
import { bankValue, formatIban, ibanField, isValidBic, isValidIban } from './iban';

// IBAN d'exemple de la norme (aucun compte réel)
const EXAMPLE = 'FR1420041010050500013M02606';

describe('RIB', () => {
  it('IBAN : clé de contrôle, espaces et minuscules acceptés', () => {
    expect(isValidIban(EXAMPLE)).toBe(true);
    expect(isValidIban('fr14 2004 1010 0505 0001 3m02 606')).toBe(true);
    expect(isValidIban('FR1520041010050500013M02606')).toBe(false);
    expect(isValidIban('FR14')).toBe(false);
  });

  it('BIC : 8 ou 11 caractères', () => {
    expect(isValidBic('QNTOFRP1XXX')).toBe(true);
    expect(isValidBic('BNPAFRPP')).toBe(true);
    expect(isValidBic('BNPAFR')).toBe(false);
  });

  it('affichage par groupes de 4, valeur enregistrée sans espaces', () => {
    expect(formatIban(EXAMPLE)).toBe('FR14 2004 1010 0505 0001 3M02 606');
    expect(bankValue(' fr14 2004 1010 0505 0001 3m02 606 ')).toBe(EXAMPLE);
    expect(bankValue('')).toBeNull();
    expect(ibanField.safeParse('').success).toBe(true);
    expect(ibanField.safeParse('FR00 1234').success).toBe(false);
  });
});
