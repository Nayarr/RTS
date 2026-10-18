import { describe, expect, it } from 'vitest';
import { monthEnd, monthFromLabel, monthLabel, monthStart } from './month';

describe('échéance au mois (hayon)', () => {
  it('MMAAAA lu sur l’étiquette → 1er du mois', () => {
    expect(monthFromLabel('052025')).toBe('2025-05-01');
    expect(monthFromLabel(' 122026 ')).toBe('2026-12-01');
    expect(monthFromLabel('132025')).toBeNull();
    expect(monthFromLabel('05/2025')).toBeNull();
    expect(monthFromLabel(null)).toBeNull();
  });

  it('affichage MM/AAAA, fin et début du mois', () => {
    expect(monthLabel('2025-05-01')).toBe('05/2025');
    expect(monthLabel('2025-05-31')).toBe('05/2025');
    expect(monthLabel(null)).toBe('-');
    expect(monthEnd('2025-02-01')).toBe('2025-02-28');
    expect(monthEnd('2028-02-01')).toBe('2028-02-29');
    expect(monthEnd('2025-12-01')).toBe('2025-12-31');
    expect(monthStart('2025-05-17')).toBe('2025-05-01');
  });
});
