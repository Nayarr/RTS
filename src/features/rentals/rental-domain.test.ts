import { describe, expect, it } from 'vitest';
import {
  contractEnd,
  lineTotal,
  parisInstant,
  parisParts,
  periodsFor,
  proposedLines,
  RATE_PERIODS,
  rentalDays,
  rentalStatus,
  returnFees,
  vehicleFree,
} from './rental-domain';

const rental = {
  unit_price: 95,
  periods: 2,
  discount_percent: 0,
  rate_period: 'day',
  departure_at: '2026-10-05T07:30:00Z',
  planned_return_at: '2026-10-07T16:00:00Z',
  extra_km_price: 0.35,
  fuel_price_per_liter: 2.2,
  late_fee_per_hour: 20,
  cleaning_fee: 45,
  km_included: 500,
  kind: 'rental' as const,
  billable: true,
  departure_invoiced_periods: null as number | null,
};
const vehicle = {
  plate: 'GE-781-UV',
  brand: 'Renault',
  model: 'Master',
  tank_liters: 80,
  category: 'van' as const,
};

describe('location : durée et tarif', () => {
  it('jours facturés : chaque tranche de 24 h commencée, 1 h de tolérance', () => {
    expect(rentalDays('2026-10-05T07:30:00Z', '2026-10-07T16:00:00Z')).toBe(3);
    expect(rentalDays('2026-10-05T07:30:00Z', '2026-10-07T08:00:00Z')).toBe(2);
    expect(rentalDays('2026-10-05T07:30:00Z', '2026-10-05T12:00:00Z')).toBe(1);
  });

  it('périodes selon le tarif choisi', () => {
    expect(periodsFor('day', 9)).toBe(9);
    expect(periodsFor('week', 9)).toBe(2);
    expect(periodsFor('month', 31)).toBe(2);
    expect(periodsFor('weekend', 2)).toBe(1);
  });

  it('heure de Paris : saisie au comptoir ↔ instant (heure d’été et d’hiver)', () => {
    expect(parisInstant('2026-10-05', '09:30')).toBe('2026-10-05T07:30:00.000Z');
    expect(parisInstant('2026-12-01', '09:30')).toBe('2026-12-01T08:30:00.000Z');
    expect(parisParts('2026-10-05T07:30:00Z')).toEqual({ date: '2026-10-05', time: '09:30' });
  });

  it('véhicule libre si aucune autre réservation ne chevauche la période', () => {
    const busy = [
      {
        id: 'r1',
        fleet_vehicle_id: 'v1',
        departure_at: '2026-10-05T07:30:00Z',
        planned_return_at: '2026-10-07T16:00:00Z',
      },
    ];
    expect(vehicleFree('v1', busy, '2026-10-06T08:00:00Z', '2026-10-08T08:00:00Z')).toBe(false);
    expect(vehicleFree('v1', busy, '2026-10-07T16:00:00Z', '2026-10-08T08:00:00Z')).toBe(true);
    expect(vehicleFree('v2', busy, '2026-10-06T08:00:00Z', '2026-10-08T08:00:00Z')).toBe(true);
    expect(vehicleFree('v1', busy, '2026-10-06T08:00:00Z', '2026-10-08T08:00:00Z', 'r1')).toBe(true);
  });

  it('statut affiché : retard, prêt prévu', () => {
    expect(rentalStatus({ status: 'active', is_late: true, kind: 'rental' }).label).toBe('En retard');
    expect(rentalStatus({ status: 'reserved', is_late: false, kind: 'loan' }).label).toBe('Prévu');
    expect(rentalStatus({ status: 'returned', is_late: false, kind: 'rental' }).label).toBe('À facturer');
  });
});

describe('location : frais du retour et facture', () => {
  const departure = { mileage: 48210, fuel_eighths: 8 };
  const back = { mileage: 48912, fuel_eighths: 5 };

  it('km en plus, carburant manquant (réservoir de 80 L), retard au-delà d’1 h', () => {
    expect(returnFees(rental, vehicle, departure, back, '2026-10-07T18:30:00Z')).toEqual({
      distance: 702,
      extraKm: 202,
      missingEighths: 3,
      missingLiters: 30,
      lateHours: 3,
    });
    expect(returnFees(rental, vehicle, departure, back, '2026-10-07T16:45:00Z').lateHours).toBe(0);
  });

  it('remorque : ni kilomètres ni carburant', () => {
    const fees = returnFees(
      rental,
      { ...vehicle, category: 'trailer' },
      departure,
      back,
      rental.planned_return_at,
    );
    expect([fees.distance, fees.extraKm, fees.missingLiters]).toEqual([null, 0, 0]);
  });

  it('lignes proposées : location, km, carburant, retard ; nettoyage seulement si rendu sale', () => {
    const fees = returnFees(rental, vehicle, departure, back, '2026-10-07T18:30:00Z');
    const lines = proposedLines(rental, vehicle, fees, '2026-10-07T18:30:00Z', null);
    expect(lines.map((line) => [line.key, line.quantity, line.unit_price, line.checked])).toEqual([
      ['base', 2, 95, true],
      ['km', 202, 0.35, true],
      ['fuel', 30, 2.2, true],
      ['late', 3, 20, true],
      ['cleaning', 1, 45, false],
    ]);
    expect(lines.map(lineTotal)).toEqual([190, 70.7, 66, 60, 45]);
    expect(proposedLines(rental, vehicle, fees, '2026-10-07T18:30:00Z', false).at(-1)?.checked).toBe(true);
  });

  it('période prévue facturée à la remise des clés : seulement la prolongation et les suppléments', () => {
    const fees = returnFees(rental, vehicle, departure, back, '2026-10-07T18:30:00Z');
    const invoiced = { ...rental, departure_invoiced_periods: 2 };
    expect(
      proposedLines(invoiced, vehicle, fees, '2026-10-07T18:30:00Z', null).map((line) => line.key),
    ).toEqual(['km', 'fuel', 'late', 'cleaning']);
    const renewed = proposedLines(
      { ...invoiced, periods: 3 },
      vehicle,
      fees,
      '2026-10-07T18:30:00Z',
      null,
    )[0];
    expect(renewed).toMatchObject({ key: 'base', quantity: 1, unit_price: 95 });
    expect(renewed?.description).toMatch(/^Prolongation de la location/);
    expect(renewed?.detail).toBe('1 jour après les 2 facturés au départ');
  });

  it('remise appliquée au prix ; prêt gratuit : rien à facturer', () => {
    const fees = returnFees(rental, vehicle, departure, departure, rental.planned_return_at);
    expect(
      proposedLines({ ...rental, discount_percent: 10 }, vehicle, fees, rental.planned_return_at, true)[0],
    ).toMatchObject({
      quantity: 2,
      unit_price: 85.5,
    });
    expect(
      proposedLines(
        { ...rental, kind: 'loan', billable: false },
        vehicle,
        fees,
        rental.planned_return_at,
        true,
      ),
    ).toEqual([]);
  });
});

describe('durée du contrat et tacite reconduction', () => {
  it('retour prévu : départ + jours, mois ou années', () => {
    expect(contractEnd('2026-10-14', 'day', 5)).toBe('2026-10-19');
    expect(contractEnd('2026-10-31', 'month', 1)).toBe('2026-12-01');
    expect(contractEnd('2026-10-14', 'month', 5)).toBe('2027-03-14');
    expect(contractEnd('2026-10-14', 'year', 1)).toBe('2027-10-14');
  });

  it('contrat à l’année : périodes et tarif annuel (sinon 12 mois)', () => {
    expect(periodsFor('year', 365)).toBe(1);
    expect(periodsFor('year', 400)).toBe(2);
    expect(RATE_PERIODS.map((period) => period.value)).toContain('year');
  });
});
