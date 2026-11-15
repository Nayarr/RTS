import { describe, expect, it } from 'vitest';
import { scoreTechnicians, technicianNetRevenue } from './analysis';
import type { TechnicianPerformanceRow } from './api';

const tech = (overrides: Partial<TechnicianPerformanceRow> = {}): TechnicianPerformanceRow => ({
  technician_id: 't1',
  name: 'Alice',
  color: null,
  labor_ht: 1000,
  sales_margin_ht: 100,
  ro_count: 4,
  billed_hours: 10,
  worked_hours: 10,
  presence_hours: 20,
  estimate_deviation_percent: null,
  average_lead_days: null,
  sav_count: 0,
  sav_hours: 0,
  sav_cost_ht: 0,
  ...overrides,
});

describe('performance : SAV causés', () => {
  it('CA net = CA total − coût des SAV (temps du collègue et pièces)', () => {
    expect(technicianNetRevenue(tech({ sav_cost_ht: 230 }))).toBe(870);
  });

  it('à chiffres égaux, celui qui a causé des SAV passe derrière', () => {
    const [first, second] = scoreTechnicians([
      tech({ technician_id: 't1', name: 'Alice', sav_count: 1, sav_hours: 2, sav_cost_ht: 230 }),
      tech({ technician_id: 't2', name: 'Bruno' }),
    ]);
    expect(first?.name).toBe('Bruno');
    expect(second?.score ?? 0).toBeLessThan(first?.score ?? 0);
  });
});
