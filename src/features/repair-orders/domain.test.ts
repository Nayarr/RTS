import { describe, expect, it } from 'vitest';
import { formatDuration, formatPlate, normalizeKey } from './constants';
import { countAlerts } from './inspection';
import { newRepairOrderDefaults, newRepairOrderSchema, toNewRepairOrderInput } from './schemas';

describe('plaques', () => {
  it('met en forme les plaques SIV pendant la saisie', () => {
    expect(formatPlate('gh512rt')).toBe('GH-512-RT');
    expect(formatPlate('gh 51')).toBe('GH-51');
    expect(formatPlate('g')).toBe('G');
  });

  it('laisse telles quelles les anciennes plaques et les plaques étrangères', () => {
    expect(formatPlate('1234 ab 75')).toBe('1234 AB 75');
    expect(formatPlate('b-ab 1234')).toBe('B-AB 1234');
  });

  it('normalise comme la base (recherche, doublons)', () => {
    expect(normalizeKey('gh-512 rt')).toBe('GH512RT');
  });
});

describe('formatDuration', () => {
  it('affiche heures et minutes', () => {
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3h 05min');
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(null)).toBe('0 min');
  });
});

describe('countAlerts', () => {
  it('compte les points HS / 50 %, voyants et problème électrique', () => {
    expect(countAlerts(null)).toBe(0);
    expect(
      countAlerts({
        usure: { plaquettes_avant: 'HS', disques_avant: '50', barre_direction: 'OK' },
        pneus: { avant_etat: 'OK', arriere_etat: 'HS' },
        controles: { extincteur1: 'HS' },
        voyants: { abs: true, moteur: false },
        probleme_electrique: 'OUI',
      }),
    ).toBe(6);
  });
});

describe('nouvel OR', () => {
  const values = {
    ...newRepairOrderDefaults(),
    plate: 'GH-512-RT',
    client_name: ' Transports Martin ',
    requested_work: ' Freins ',
    planned_date: '2026-10-01',
  };

  it('exige plaque et tâche', () => {
    const result = newRepairOrderSchema.safeParse({ ...values, plate: ' - ', requested_work: ' ' });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Indique l’immatriculation',
      'Indique la tâche à faire',
    ]);
  });

  it('refuse une fin avant le début, ou une fin sans début', () => {
    const messages = (patch: object) =>
      newRepairOrderSchema.safeParse({ ...values, ...patch }).error?.issues.map((issue) => issue.message);
    expect(messages({ planned_start: '10:00', planned_end: '09:00' })).toEqual([
      'L’heure de fin doit être après le début',
    ]);
    expect(messages({ planned_end: '09:00' })).toEqual(['Indique l’heure de début']);
  });

  it('sans heure de début, la date prévue est gardée', () => {
    expect(toNewRepairOrderInput(values, null)).toEqual({
      plate: 'GH-512-RT',
      vehicle_type: 'pl',
      client_name: 'Transports Martin',
      requested_work: 'Freins',
      mileage: null,
      technician_id: null,
      planned_date: '2026-10-01',
      planned_start: null,
      planned_end: null,
      signature_file_id: null,
    });
  });

  it('planning, kilométrage, technicien et signature transmis', () => {
    expect(
      toNewRepairOrderInput(
        { ...values, planned_start: '09:00', planned_end: '11:00', mileage: '184320', technician_id: 't1' },
        'sig',
      ),
    ).toMatchObject({
      planned_date: '2026-10-01',
      planned_start: '09:00',
      planned_end: '11:00',
      mileage: 184320,
      technician_id: 't1',
      signature_file_id: 'sig',
    });
  });
});
