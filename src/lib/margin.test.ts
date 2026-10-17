import { describe, expect, it } from 'vitest';
import { marginPercent, saleFromMargin } from './margin';

describe('marge d’une pièce, sur le prix d’achat', () => {
  it('marge calculée depuis le prix de vente et le prix d’achat', () => {
    expect(marginPercent(100, 130)).toBe(30);
    expect(marginPercent(80, 100)).toBe(25);
    expect(marginPercent(3, 10)).toBe(233.33);
    expect(marginPercent(null, 130)).toBeNull();
    expect(marginPercent(0, 130)).toBeNull();
    expect(marginPercent(100, null)).toBeNull();
  });

  it('prix de vente calculé depuis la marge', () => {
    expect(saleFromMargin(100, 30)).toBe(130);
    expect(saleFromMargin(42.5, 40)).toBe(59.5);
    expect(saleFromMargin(null, 30)).toBeNull();
    expect(saleFromMargin(100, null)).toBeNull();
  });
});
