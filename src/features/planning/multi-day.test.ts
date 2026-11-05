import { describe, expect, it } from 'vitest';
import { newRepairOrderDefaults, newRepairOrderSchema } from '@/features/repair-orders/schemas';
import { daySegment, isMultiDay, multiDayLabel, planningBounds, type PlannedSlot } from './domain';
import { assignOrderSchema } from './schemas';

const WORKDAY = { start: 9 * 60, end: 18 * 60 };
const NIGHT: PlannedSlot = { date: '2026-11-04', start: '20:00', end: '08:00', endDate: '2026-11-05' };

describe('créneau sur plusieurs jours', () => {
  it('une date de fin identique ou absente reste un créneau d’une journée', () => {
    expect(isMultiDay({ date: '2026-11-04', start: '09:00', end: '10:00' })).toBe(false);
    expect(isMultiDay({ ...NIGHT, endDate: '2026-11-04' })).toBe(false);
    expect(isMultiDay(NIGHT)).toBe(true);
  });

  it('la grille s’élargit au soir et au matin, à l’heure pleine', () => {
    expect(planningBounds([NIGHT], WORKDAY)).toEqual({ start: 7 * 60, end: 21 * 60 });
    expect(planningBounds([{ date: '2026-11-04', start: '19:15', end: '20:10' }], WORKDAY)).toEqual({
      start: 9 * 60,
      end: 21 * 60,
    });
  });

  it('la grille garde les heures de l’atelier sans créneau qui en sort', () => {
    expect(planningBounds([{ date: '2026-11-04', start: '10:00', end: '11:00' }], WORKDAY)).toEqual(WORKDAY);
  });

  it('jamais au-delà de minuit', () => {
    expect(planningBounds([{ date: '2026-11-04', start: '23:30', end: null }], WORKDAY).end).toBe(24 * 60);
  });

  it('le premier jour descend en bas de la grille, le dernier repart du haut', () => {
    const bounds = planningBounds([NIGHT], WORKDAY);
    expect(daySegment(NIGHT, '2026-11-04', bounds)).toEqual({
      start: 20 * 60,
      end: 21 * 60,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(daySegment(NIGHT, '2026-11-05', bounds)).toEqual({
      start: 7 * 60,
      end: 8 * 60,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it('un jour du milieu occupe toute la colonne ; rien en dehors du créneau', () => {
    const slot = { ...NIGHT, endDate: '2026-11-06' };
    expect(daySegment(slot, '2026-11-05', WORKDAY)).toEqual({
      ...WORKDAY,
      continuesBefore: true,
      continuesAfter: true,
    });
    expect(daySegment(slot, '2026-11-03', WORKDAY)).toBeNull();
    expect(daySegment(slot, '2026-11-07', WORKDAY)).toBeNull();
  });

  it('un créneau d’une journée n’apparaît que ce jour-là', () => {
    const slot = { date: '2026-11-04', start: '10:00', end: '11:00' };
    expect(daySegment(slot, '2026-11-04', WORKDAY)).toEqual({
      start: 10 * 60,
      end: 11 * 60,
      continuesBefore: false,
      continuesAfter: false,
    });
    expect(daySegment(slot, '2026-11-05', WORKDAY)).toBeNull();
  });

  it('le bloc annonce la fin le premier jour, la suite le jour suivant', () => {
    const first = daySegment(NIGHT, '2026-11-04', WORKDAY)!;
    const last = daySegment(NIGHT, '2026-11-05', WORKDAY)!;
    expect(multiDayLabel(NIGHT, first)).toBe('20:00 → Jeu 05/11 08:00');
    expect(multiDayLabel(NIGHT, last)).toBe('Suite → 08:00');
    const longer = { ...NIGHT, endDate: '2026-11-06' };
    expect(multiDayLabel(longer, daySegment(longer, '2026-11-05', WORKDAY)!)).toBe('Suite → Ven 06/11 08:00');
  });
});

describe('saisie d’un créneau', () => {
  const order = {
    repair_order_id: 'ro',
    technician_id: 't',
    planned_date: '2026-11-04',
    planned_start: '20:00',
    planned_end_date: '',
    planned_end: '08:00',
  };
  const messages = (patch: object) =>
    assignOrderSchema.safeParse({ ...order, ...patch }).error?.issues.map((issue) => issue.message);

  it('20 h - 8 h exige la date de fin', () => {
    expect(messages({})).toEqual(['L’heure de fin doit être après le début']);
    expect(messages({ planned_end_date: '2026-11-05' })).toBeUndefined();
  });

  it('la date de fin ne précède jamais la date de début', () => {
    expect(messages({ planned_end_date: '2026-11-03' })).toEqual([
      'La date de fin doit être après la date de début',
    ]);
  });

  it('nouvel OR : date de fin sans heures refusée', () => {
    const result = newRepairOrderSchema.safeParse({
      ...newRepairOrderDefaults(),
      plate: 'AB-123-CD',
      requested_work: 'Freins',
      planned_date: '2026-11-04',
      planned_end_date: '2026-11-05',
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Indique l’heure de début',
      'Indique l’heure de fin',
    ]);
  });
});
