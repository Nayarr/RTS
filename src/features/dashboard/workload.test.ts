import { describe, expect, it } from 'vitest';
import { hours, loadColor, loadRatio, periodLabel, periodRange, shiftPeriod } from './workload';

describe('périodes de la charge atelier', () => {
  it('jour, semaine du lundi au dimanche, mois entier', () => {
    expect(periodRange('day', '2026-09-30')).toEqual({ from: '2026-09-30', to: '2026-09-30' });
    expect(periodRange('week', '2026-10-01')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(periodRange('week', '2026-10-04')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(periodRange('month', '2026-02-14')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('période précédente et suivante', () => {
    expect(shiftPeriod('day', '2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftPeriod('week', '2026-10-01', -1)).toBe('2026-09-24');
    expect(shiftPeriod('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01');
  });

  it('libellés', () => {
    expect(periodLabel('day', periodRange('day', '2026-09-30'))).toBe('Mercredi 30 septembre');
    expect(periodLabel('week', periodRange('week', '2026-10-01'))).toBe('Semaine du 28 sept. au 4 oct.');
    expect(periodLabel('month', periodRange('month', '2026-10-01'))).toBe('Octobre 2026');
  });
});

describe('couleur de la jauge (déclaré ÷ disponible)', () => {
  it('rouge à 0 %, ambre à 50 %, vert dès 95 %, or à 100 % et plus', () => {
    expect(loadColor(0)).toBe('rgb(181, 69, 58)');
    expect(loadColor(0.5)).toBe('rgb(201, 138, 0)');
    expect(loadColor(0.95)).toBe('rgb(19, 112, 23)');
    expect(loadColor(0.99)).toBe('rgb(19, 112, 23)');
    expect(loadColor(1)).toBe('gold');
    expect(loadColor(1.06)).toBe('gold');
  });

  it('dégradé continu entre deux repères', () => {
    expect(loadColor(0.25)).toBe('rgb(191, 104, 29)');
  });

  it('rien de disponible : 0 %', () => {
    expect(loadRatio(4, 0)).toBe(0);
    expect(loadRatio(41.5, 39)).toBeCloseTo(1.064, 3);
    expect(hours(41.5)).toBe('41,5 h');
    expect(hours(39)).toBe('39 h');
  });
});
