import { describe, expect, it } from 'vitest';
import { decimalField, decimalText, formatEuro, marginPercent, parseDecimal } from './numbers';

describe('saisie des nombres', () => {
  it('accepte la virgule et les espaces (y compris insécables)', () => {
    expect(parseDecimal('12,50')).toBe(12.5);
    expect(parseDecimal('1 250')).toBe(1250);
    expect(parseDecimal('1 250,5')).toBe(1250.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('12a')).toBeNaN();
    expect(parseDecimal('-3')).toBeNaN();
  });

  it('valide obligatoire, 2 décimales et strictement positif', () => {
    expect(decimalField().safeParse('').success).toBe(true);
    expect(decimalField({ required: true }).safeParse('').error?.issues[0]?.message).toBe(
      'Champ obligatoire',
    );
    expect(decimalField().safeParse('1,234').error?.issues[0]?.message).toBe('2 décimales au maximum');
    expect(decimalField({ positive: true }).safeParse('0').error?.issues[0]?.message).toBe(
      'Doit être supérieur à 0',
    );
    expect(decimalField({ required: true }).safeParse('0').success).toBe(true);
  });

  it('réaffiche un nombre avec une virgule', () => {
    expect(decimalText(6.5)).toBe('6,5');
    expect(decimalText(null)).toBe('');
  });
});

describe('affichage', () => {
  it('montants en euros et marge sur le prix d’achat', () => {
    expect(formatEuro(1234.5).replace(/\s/g, ' ')).toBe('1 234,50 €');
    expect(formatEuro(null)).toBe('—');
    expect(marginPercent(92, 138)).toBe(50);
    expect(marginPercent(null, 138)).toBeNull();
    expect(marginPercent(0, 10)).toBeNull();
  });
});
