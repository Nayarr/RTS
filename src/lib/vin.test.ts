import { describe, expect, it } from 'vitest';
import { normalizeVinText, VIN_BRANDS, vinBrand } from './vin';

describe('marque tirée du VIN', () => {
  it('code constructeur : les 3 premiers caractères, espaces, tirets et minuscules ignorés', () => {
    expect(vinBrand('vf6 1234-5678 901234')).toBe('Renault Trucks');
    expect(vinBrand('YS2R4X20005123456')).toBe('Scania');
    expect(vinBrand('XLRTE47MS0E123456')).toBe('DAF');
    expect(vinBrand('WMA06XZZ0EM123456')).toBe('MAN');
    expect(vinBrand('VF1MA000000000001')).toBe('Renault');
    expect(vinBrand('WSM00000000123456')).toBe('Schmitz Cargobull');
  });

  it('dès 3 caractères saisis ; code inconnu ou trop court : rien', () => {
    expect(vinBrand('ZCF')).toBe('Iveco');
    expect(vinBrand('VF')).toBeNull();
    expect(vinBrand('ZZZ12345678901234')).toBeNull();
    expect(vinBrand(null)).toBeNull();
    expect(normalizeVinText(' w1t-123 ')).toBe('W1T123');
  });

  it('table limitée aux codes de 3 caractères en majuscules', () => {
    for (const code of Object.keys(VIN_BRANDS)) expect(code).toMatch(/^[A-HJ-NPR-Z0-9]{3}$/);
  });
});
