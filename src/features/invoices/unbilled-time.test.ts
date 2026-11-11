import { describe, expect, it } from 'vitest';
import { billedLaborHours, hoursLabel, unbilledTimeWarning } from './unbilled-time';

const labor = (quantity: number) =>
  ({ line_type: 'labor', quantity, billed_hours: null, standard_hours: null }) as const;
const pkg = (quantity: number, standard_hours: number, billed_hours: number | null = null) =>
  ({ line_type: 'package', quantity, standard_hours, billed_hours }) as const;
const part = { line_type: 'part', quantity: 3, billed_hours: null, standard_hours: null } as const;
const HOUR = 3600;

describe('temps passé mais non facturé', () => {
  it('heures facturées : main d’œuvre et temps des forfaits, pas les pièces', () => {
    expect(billedLaborHours([labor(2), part, pkg(2, 0.5), pkg(1, 1, 1.5)])).toBe(4.5);
  });

  it('exemple du client : 4 h badgées, 2 h facturées', () => {
    expect(unbilledTimeWarning(4 * HOUR, [labor(2)])).toBe(
      '4 h badgées, 2 h facturées : vérifie s’il manque une ligne.',
    );
  });

  it('aucune main d’œuvre sur la facture', () => {
    expect(unbilledTimeWarning(1.5 * HOUR, [part])).toBe(
      '1 h 30 badgées, aucune heure facturée : vérifie s’il manque une ligne.',
    );
  });

  it('pas d’alerte sous une demi-heure d’écart, ni quand on facture plus que le badgé', () => {
    expect(unbilledTimeWarning(2.4 * HOUR, [labor(2)])).toBeNull();
    expect(unbilledTimeWarning(1 * HOUR, [labor(2)])).toBeNull();
    expect(unbilledTimeWarning(0, [])).toBeNull();
  });

  it('forfait au barème : son temps compte comme facturé', () => {
    expect(unbilledTimeWarning(1.2 * HOUR, [pkg(1, 1)])).toBeNull();
  });

  it('heures lisibles', () => {
    expect(hoursLabel(4)).toBe('4 h');
    expect(hoursLabel(2.5)).toBe('2 h 30');
    expect(hoursLabel(0.75)).toBe('45 min');
    expect(hoursLabel(1.0833)).toBe('1 h 05');
  });
});
