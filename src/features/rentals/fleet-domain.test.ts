import { describe, expect, it } from 'vitest';
import type { FleetVehicle } from './fleet-api';
import { blockReason, fleetDeadlines, fleetStatus, worstDeadline } from './fleet-domain';
import { emptyFleetVehicle, fleetVehicleFromForm, fleetVehicleSchema } from './fleet-schemas';

/** Espaces insécables des nombres formatés (fr-FR) → espaces simples. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/\s/g, ' ')) as T;

const vehicle = (patch: Partial<FleetVehicle> = {}): FleetVehicle => ({
  id: 'v1',
  plate: 'GH-482-KL',
  plate_key: 'GH482KL',
  brand: 'Renault',
  model: 'Master',
  category: 'van',
  vin: null,
  first_registration: null,
  mileage: 84_210,
  fuel_type: 'Gazole',
  tank_liters: 80,
  license_category: 'B',
  loanable: true,
  daily_rate: 89,
  weekend_rate: null,
  week_rate: null,
  month_rate: null,
  km_included_per_day: 200,
  extra_km_price: 0.35,
  deposit: 1500,
  franchise: null,
  fuel_price_per_liter: 2.2,
  cleaning_fee: 45,
  late_fee_per_hour: 20,
  ct_due_date: '2027-03-01',
  insurance_due_date: '2027-01-15',
  next_service_km: 100_000,
  photo_file_id: null,
  in_maintenance: false,
  maintenance_note: null,
  is_active: true,
  notes: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...patch,
});

describe('flotte : blocage de la location', () => {
  it('louable quand les échéances sont à jour', () => {
    expect(blockReason(vehicle(), '2026-10-03')).toBeNull();
    expect(fleetStatus(vehicle(), '2026-10-03')).toEqual({ label: 'Disponible', tone: 's-ok' });
  });

  it('mêmes raisons et même ordre que la base', () => {
    expect(blockReason(vehicle(), '2027-02-01')).toBe('Assurance expirée le 15/01/2027');
    expect(blockReason(vehicle({ insurance_due_date: null }), '2027-04-01')).toBe(
      'Contrôle technique expiré le 01/03/2027',
    );
    expect(blockReason(vehicle({ in_maintenance: true }), '2027-04-01')).toBe('Véhicule en entretien');
    expect(blockReason(vehicle({ is_active: false }), '2026-10-03')).toBe('Véhicule retiré de la flotte');
  });

  it('statut de la carte : entretien, sinon bloqué', () => {
    expect(fleetStatus(vehicle({ in_maintenance: true }), '2026-10-03').label).toBe('En entretien');
    expect(fleetStatus(vehicle(), '2027-02-01')).toEqual({ label: 'Bloqué', tone: 's-bad' });
  });
});

describe('flotte : échéances', () => {
  it('à venir sous 30 jours ou 2 000 km, expirées ensuite', () => {
    const list = fleetDeadlines(vehicle({ mileage: 98_500 }), '2026-12-20');
    expect(plain(list)).toEqual([
      { label: 'Contrôle technique', when: '01/03/2027', state: 'ok', text: 'OK' },
      { label: 'Assurance', when: '15/01/2027', state: 'soon', text: 'Dans 26 jours' },
      { label: 'Vidange', when: 'à 100 000 km', state: 'soon', text: 'Dans 1 500 km' },
    ]);
    expect(plain(worstDeadline(vehicle({ mileage: 101_000 }), '2026-12-20'))).toMatchObject({
      label: 'Vidange',
      state: 'late',
      text: 'Dépassée de 1 000 km',
    });
    expect(worstDeadline(vehicle(), '2027-01-17')?.text).toBe('Expirée depuis 2 jours');
  });

  it('une remorque n’a pas de vidange', () => {
    expect(fleetDeadlines(vehicle({ category: 'trailer' }), '2026-10-03').map((d) => d.label)).toEqual([
      'Contrôle technique',
      'Assurance',
    ]);
  });
});

describe('flotte : formulaire du véhicule', () => {
  const values = {
    ...emptyFleetVehicle('trailer'),
    plate: 'ab-123-cd',
    brand: 'Krone',
    model: 'Profi Liner',
    vin: 'wkv-da 123 456 789 012',
    daily_rate: '120',
    deposit: '2 000',
    mileage: '50000',
  };

  it('plaque en majuscules, VIN nettoyé, remorque sans kilométrage ni carburant', () => {
    const parsed = fleetVehicleSchema.parse(values);
    const input = fleetVehicleFromForm(parsed);
    expect(input).toMatchObject({
      plate: 'AB-123-CD',
      vin: 'WKVDA123456789012',
      category: 'trailer',
      mileage: null,
      fuel_type: null,
      daily_rate: 120,
      fuel_price_per_liter: 2.2,
      cleaning_fee: 45,
    });
  });

  it('VIN de 17 caractères sans I, O ni Q ; tarif journalier requis', () => {
    const result = fleetVehicleSchema.safeParse({ ...values, vin: 'WKVDA1234567890O1', daily_rate: '' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['vin', 'daily_rate']));
  });
});
