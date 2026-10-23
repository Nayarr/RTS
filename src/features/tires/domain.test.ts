import { describe, expect, it } from 'vitest';
import { formatTireSize, isTireSize, lineLabel, profilesFor, salesTrend, tireSizeKey } from './domain';

describe('taille des pneus', () => {
  it('barres, R et point posés pendant la saisie', () => {
    expect(formatTireSize('315')).toBe('315');
    expect(formatTireSize('31580')).toBe('315/80');
    expect(formatTireSize('3158022')).toBe('315/80 R22');
    expect(formatTireSize('31580225')).toBe('315/80 R22.5');
    expect(formatTireSize('315/80/22.5')).toBe('315/80 R22.5');
    expect(formatTireSize('2356516C')).toBe('235/65 R16C');
    expect(formatTireSize('315802256')).toBe('315/80 R22.5');
  });

  it('taille complète et même clé que la fiche de contrôle', () => {
    expect(isTireSize('315/80 R22.5')).toBe(true);
    expect(isTireSize('235/65 R16C')).toBe(true);
    expect(isTireSize('315/80')).toBe(false);
    expect(tireSizeKey('315/80 R22.5')).toBe(tireSizeKey('315/80/22.5'));
  });

  it('profils selon la catégorie et libellé de ligne', () => {
    expect(profilesFor('pl')).toEqual(['avant', 'arriere', 'remorque', 'multi']);
    expect(profilesFor('vul')).toEqual(['toutes']);
    expect(lineLabel({ size: '315/80 R22.5', profile: 'arriere' })).toBe('315/80 R22.5 arrière');
    expect(lineLabel({ size: '315/80 R22.5', profile: 'multi' })).toBe('315/80 R22.5 multi-positions');
    expect(lineLabel({ size: '235/65 R16C', profile: 'toutes' })).toBe('235/65 R16C');
  });

  it('évolution des ventes sur le mois', () => {
    expect(salesTrend(64, 57)).toBe('+12 % vs mois dernier');
    expect(salesTrend(40, 50)).toBe('-20 % vs mois dernier');
    expect(salesTrend(5, 0)).toBeNull();
  });
});
