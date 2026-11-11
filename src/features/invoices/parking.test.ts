import { describe, expect, it } from 'vitest';
import { parkingDays, parkingRate } from './parking';

const rates = { parking_rate_pl: 30, parking_rate_vul: 15, parking_rate_remorque: 20 };

describe('frais de stationnement', () => {
  it('tarif selon le type de véhicule', () => {
    expect(parkingRate(rates, 'pl')).toBe(30);
    expect(parkingRate(rates, 'vul')).toBe(15);
    expect(parkingRate(rates, 'remorque')).toBe(20);
  });

  it('jours en trop : du lendemain de la date prévue au jour du départ', () => {
    expect(parkingDays('2026-11-04', '2026-11-08')).toBe(4);
    expect(parkingDays('2026-10-30', '2026-11-02')).toBe(3);
    expect(parkingDays('2026-11-08', '2026-11-08')).toBe(0);
    expect(parkingDays('2026-11-09', '2026-11-08')).toBe(0);
    expect(parkingDays('', '2026-11-08')).toBe(0);
  });
});
