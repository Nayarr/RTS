import { describe, expect, it } from 'vitest';
import {
  durationLabel,
  roadsideLabel,
  roadsideProblem,
  roadsideSummary,
  roadsideTravel,
  type RoadsideSettings,
} from './roadside';

const SETTINGS: RoadsideSettings = {
  roadside_flat_fee: 60,
  roadside_zone2_price: 90,
  roadside_zone3_price: 130,
  roadside_zone1_max_km: 10,
  roadside_zone2_max_km: 20,
  roadside_zone3_max_km: 40,
  roadside_zone1_max_minutes: 30,
  roadside_zone2_max_minutes: 60,
  roadside_zone3_max_minutes: 90,
  roadside_tolerance_minutes: 7,
  roadside_travel_hourly_rate: 90,
};

describe('déplacement du dépannage (mêmes cas que la base)', () => {
  it.each([
    [8, 25, 1, 60, false],
    [8, 31, 1, 90, true],
    [8, 80, 1, 120, true],
    [10, 65, 2, 90, false],
    [15, 70, 2, 105, true],
    [40, 97, 3, 130, false],
    [30, 100, 3, 150, true],
  ])('%s km, %s min : zone %s, %s €', (km, minutes, zone, price, byTime) => {
    expect(roadsideTravel(km, minutes, null, SETTINGS)).toEqual({ zone, price, byTime });
  });

  it('au-delà de 40 km : prix à saisir ; prix saisi à la main', () => {
    expect(roadsideTravel(52.4, 80, null, SETTINGS)).toEqual({ zone: 4, price: null, byTime: false });
    expect(roadsideTravel(52.4, 80, 210, SETTINGS).price).toBe(210);
    expect(roadsideTravel(8, 25, 75, SETTINGS).price).toBe(75);
  });

  it('durée et champs à remplir', () => {
    expect([durationLabel(40), durationLabel(60), durationLabel(80)]).toEqual(['40 min', '1 h', '1 h 20']);
    const base = { enabled: true, address: 'Roissy', km: 52, minutes: 60, manualPrice: null };
    expect(roadsideProblem(base, SETTINGS)).toBe('Au-delà de la zone 3 : indique le prix du déplacement');
    expect(roadsideProblem({ ...base, manualPrice: 200 }, SETTINGS)).toBeNull();
    expect(roadsideProblem({ ...base, address: ' ' }, SETTINGS)).toBe(
      'Indique le lieu d’intervention du dépannage',
    );
    expect(roadsideProblem({ ...base, enabled: false }, SETTINGS)).toBeNull();
  });
});

describe('résumé affiché au client (mêmes libellés que la base)', () => {
  it.each([
    [8, 25, null, 'Forfait déplacement zone 1 (proximité)'],
    [30, 60, null, 'Forfait déplacement zone 3'],
    [15, 70, null, 'Déplacement zone 2 : 1 h 10 de trajet aller-retour'],
    [30, 60, 75, 'Déplacement zone 3'],
    [52.4, 80, 210, 'Déplacement (52,4 km aller-retour)'],
  ])('%s km, %s min, prix saisi %s : %s', (km, minutes, manual, label) => {
    const travel = roadsideTravel(km, minutes, manual, SETTINGS);
    expect(roadsideLabel(travel, km, minutes, manual !== null)).toBe(label);
  });

  const value = { enabled: true, address: ' Roissy ', km: 30, minutes: 60, manualPrice: null };

  it('zone 3 : lieu, libellé et forfait', () => {
    expect(roadsideSummary(value, SETTINGS)).toEqual({
      address: 'Roissy',
      label: 'Forfait déplacement zone 3',
      price: 130,
    });
  });

  it('trajet pas encore renseigné : le lieu seul ; sans dépannage ou sans lieu : rien', () => {
    expect(roadsideSummary({ ...value, km: null }, SETTINGS)).toEqual({
      address: 'Roissy',
      label: null,
      price: null,
    });
    expect(roadsideSummary({ ...value, enabled: false }, SETTINGS)).toBeNull();
    expect(roadsideSummary({ ...value, address: ' ' }, SETTINGS)).toBeNull();
  });
});
