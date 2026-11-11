import { describe, expect, it } from 'vitest';
import {
  mileageValue,
  oilChangeStatus,
  upcomingWork,
  upcomingWorkMessage,
  type UpcomingInput,
} from './upcoming-work';

const TODAY = '2026-11-08';
const base: UpcomingInput = {
  vehicleType: 'pl',
  ctDueDate: null,
  tailgateDueMonth: null,
  antipollutionDueDate: null,
  mileage: 442_000,
  currentLines: ['Disques et plaquettes avant'],
  history: [
    { date: '2026-03-02T09:00:00Z', mileage: 400_000, lines: ['Vidange moteur et filtres'] },
    { date: '2026-10-20T09:00:00Z', mileage: 438_000, lines: ['Contrôle extincteurs'] },
  ],
  oilChanges: [],
};

describe('profitez de l’immobilisation : échéances', () => {
  it('contrôle technique et hayon dans les deux mois, vidange au-delà de 40 000 km pour un PL', () => {
    const items = upcomingWork(
      {
        ...base,
        ctDueDate: '2026-11-28',
        tailgateDueMonth: '2026-11-01',
        antipollutionDueDate: '2027-06-01',
      },
      TODAY,
    );
    expect(items.map((item) => [item.kind, item.detail])).toEqual([
      ['ct', 'à faire avant le 28/11/2026'],
      ['tailgate', 'échéance novembre 2026'],
      [
        'oil',
        '42 000 km depuis la dernière vidange (à 400 000 km le 02/03/2026), conseillée tous les 40 000 km',
      ],
    ]);
    expect(items[0]?.days).toBe(20);
  });

  it('échéance dépassée en premier', () => {
    const items = upcomingWork({ ...base, ctDueDate: '2026-11-01', tailgateDueMonth: '2026-12-01' }, TODAY);
    expect(items[0]).toMatchObject({ kind: 'ct', days: -7, detail: 'dépassé depuis le 01/11/2026' });
  });

  it('extincteurs : un an après le dernier contrôle, ou jamais contrôlés à l’atelier', () => {
    const old = upcomingWork(
      {
        ...base,
        history: [{ date: '2025-11-20T09:00:00Z', mileage: 300_000, lines: ['Contrôle extincteurs'] }],
      },
      TODAY,
    );
    expect(old.find((item) => item.kind === 'extinguisher')?.detail).toBe(
      'dernier contrôle le 20/11/2025, à refaire avant le 20/11/2026',
    );
    const never = upcomingWork({ ...base, history: [] }, TODAY);
    expect(never.find((item) => item.kind === 'extinguisher')?.detail).toBe(
      'aucun contrôle enregistré à l’atelier',
    );
    expect(upcomingWork(base, TODAY).some((item) => item.kind === 'extinguisher')).toBe(false);
  });

  it('rien de reproposé quand c’est déjà dans les tâches, rien pour une remorque', () => {
    const planned = upcomingWork(
      {
        ...base,
        ctDueDate: '2026-11-28',
        currentLines: ['Passage au contrôle technique', 'Vidange', 'Contrôle des extincteurs'],
        history: [],
      },
      TODAY,
    );
    expect(planned).toEqual([]);
    expect(upcomingWork({ ...base, vehicleType: 'remorque', history: [] }, TODAY)).toEqual([]);
  });

  it('mail modèle : nom du client, véhicule et prestations, signé par l’atelier', () => {
    const items = upcomingWork({ ...base, ctDueDate: '2026-11-28' }, TODAY);
    const message = upcomingWorkMessage(
      { clientName: 'Transports Martin', plate: 'GH-412-KL', items },
      { legal_name: 'RAPID TRUCK SERVICE', email: 'atelier@rapidtruckservice.fr' },
    );
    expect(message.subject).toBe(
      'Profitez de l’immobilisation de votre véhicule GH-412-KL · RAPID TRUCK SERVICE',
    );
    expect(message.body).toContain(
      'Votre véhicule GH-412-KL de Transports Martin est actuellement dans notre atelier.',
    );
    expect(message.body).toContain('- Contrôle technique : à faire avant le 28/11/2026');
    expect(message.body).toContain('- Vidange : 42 000 km depuis la dernière vidange');
    expect(message.body).toMatch(/Cordialement,\nRAPID TRUCK SERVICE\natelier@rapidtruckservice\.fr$/);
    expect(message.body).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('vidange : 40 000 km (PL), 15 000 km (utilitaire), ou plus d’un an', () => {
  const recent = [{ date: '2026-06-01', mileage: 100_000 }];

  it('écart de kilométrage au-delà de l’intervalle du type de véhicule', () => {
    expect(oilChangeStatus({ vehicleType: 'pl', mileage: 140_000, changes: recent }, TODAY)?.reason).toBe(
      'km',
    );
    expect(oilChangeStatus({ vehicleType: 'pl', mileage: 139_000, changes: recent }, TODAY)).toBeNull();
    expect(oilChangeStatus({ vehicleType: 'vul', mileage: 115_000, changes: recent }, TODAY)?.reason).toBe(
      'km',
    );
    expect(oilChangeStatus({ vehicleType: 'vul', mileage: 114_000, changes: recent }, TODAY)).toBeNull();
  });

  it('pas de vidange depuis plus d’un an, ou aucune connue', () => {
    expect(
      oilChangeStatus(
        { vehicleType: 'pl', mileage: null, changes: [{ date: '2025-10-30', mileage: null }] },
        TODAY,
      ),
    ).toEqual({ reason: 'time', detail: 'dernière vidange le 30/10/2025, il y a plus d’un an' });
    expect(oilChangeStatus({ vehicleType: 'pl', mileage: null, changes: [] }, TODAY)).toEqual({
      reason: 'unknown',
      detail: 'aucune vidange enregistrée pour ce véhicule',
    });
    expect(oilChangeStatus({ vehicleType: 'remorque', mileage: null, changes: [] }, TODAY)).toBeNull();
  });

  it('vidange déclarée par le client : comptée comme une vidange de l’atelier', () => {
    const items = upcomingWork(
      { ...base, history: [], oilChanges: [{ date: '2026-09-15', mileage: 430_000 }] },
      TODAY,
    );
    expect(items.some((item) => item.kind === 'oil')).toBe(false);
  });

  it('kilométrage saisi avec espaces', () => {
    expect(mileageValue('412 000')).toBe(412_000);
    expect(mileageValue('')).toBeNull();
  });
});
