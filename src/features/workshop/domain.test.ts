import { describe, expect, it } from 'vitest';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { parseTimeOption, planMyDay, seenState, timeOptionsFor, timeOptionValue } from './domain';

const order = (overrides: Partial<RepairOrderOverview>): RepairOrderOverview =>
  ({
    id: 'ro',
    status: 'assigned',
    created_at: '2026-09-20T08:00:00Z',
    updated_at: '2026-09-20T08:00:00Z',
    assignment_changed_at: '2026-09-20T08:00:00Z',
    planned_date: null,
    planned_start: null,
    ...overrides,
  }) as RepairOrderOverview;

describe('temps estimés', () => {
  it('convertit le sélecteur vers la base et inversement, « 12h+ » compris', () => {
    expect(parseTimeOption('3h')).toEqual({ estimated_hours: 3, estimate_is_minimum: false });
    expect(parseTimeOption('12h+')).toEqual({ estimated_hours: 12, estimate_is_minimum: true });
    expect(parseTimeOption('')).toEqual({ estimated_hours: null, estimate_is_minimum: false });
    expect(timeOptionValue(12, true)).toBe('12h+');
    expect(timeOptionValue(0.5, false)).toBe('0.5h');
    expect(timeOptionValue(null, false)).toBe('');
  });

  it('garde une valeur hors liste (ex. 0,5 h saisie au bureau)', () => {
    expect(timeOptionsFor('0.5h').slice(0, 3)).toEqual(['0h', '0.5h', '1h']);
    expect(timeOptionsFor('2h')).toHaveLength(14);
  });
});

describe('badges Nouveau / Modifié', () => {
  it('jamais ouvert → Nouveau ; modifié depuis la dernière ouverture → Modifié', () => {
    const ro = order({ assignment_changed_at: '2026-09-21T10:00:00Z' });
    expect(seenState(ro, undefined)).toBe('new');
    expect(seenState(ro, '2026-09-21T09:00:00Z')).toBe('updated');
    expect(seenState(ro, '2026-09-21T11:00:00Z')).toBeNull();
  });

  it('pas de badge sur un OR terminé', () => {
    expect(seenState(order({ status: 'work_done' }), undefined)).toBeNull();
  });
});

describe('journée du technicien', () => {
  const today = '2026-09-27';
  const now = new Date('2026-09-27T12:00:00Z').getTime();
  const ids = (orders: RepairOrderOverview[]) => orders.map((o) => o.id);

  it('seulement les OR du jour : ceux prévus plus tard restent masqués', () => {
    const day = planMyDay(
      [
        order({ id: 'today', planned_date: today, planned_start: '09:00:00' }),
        order({ id: 'tomorrow', planned_date: '2026-09-28', planned_start: '08:00:00' }),
        order({ id: 'next-week', planned_date: '2026-10-02' }),
      ],
      today,
      now,
    );
    expect(ids(day.timed)).toEqual(['today']);
    expect([...day.carriedOver, ...day.flexible]).toEqual([]);
  });

  it('un OR pas terminé les jours précédents reste affiché, jusqu’à sa fin', () => {
    const day = planMyDay(
      [
        order({ id: 'yesterday', planned_date: '2026-09-26', planned_start: '14:00:00' }),
        order({ id: 'last-week', planned_date: '2026-09-20' }),
        order({
          id: 'finished',
          status: 'work_done',
          planned_date: '2026-09-26',
          updated_at: '2026-09-26T17:00:00Z',
        }),
      ],
      today,
      now,
    );
    expect(ids(day.carriedOver)).toEqual(['last-week', 'yesterday']);
    expect(ids(day.recentlyDone)).toEqual(['finished']);
  });

  it('tri par heure de début puis de fin ; sans heure → catégorie flexible', () => {
    const day = planMyDay(
      [
        order({ id: 'at14', planned_date: today, planned_start: '14:00:00', planned_end: '16:00:00' }),
        order({ id: 'at9-long', planned_date: today, planned_start: '09:00:00', planned_end: '12:00:00' }),
        order({ id: 'at9-short', planned_date: today, planned_start: '09:00:00', planned_end: '10:00:00' }),
        order({ id: 'at9-open', planned_date: today, planned_start: '09:00:00' }),
        order({ id: 'no-time', planned_date: today, created_at: '2026-09-26T08:00:00Z' }),
        order({ id: 'no-date', created_at: '2026-09-01T08:00:00Z' }),
      ],
      today,
      now,
    );
    expect(ids(day.timed)).toEqual(['at9-short', 'at9-long', 'at9-open', 'at14']);
    expect(ids(day.flexible)).toEqual(['no-date', 'no-time']);
  });

  it('un OR déjà commencé reste visible même s’il était prévu plus tard', () => {
    const day = planMyDay(
      [
        order({
          id: 'started',
          status: 'in_progress',
          planned_date: '2026-09-29',
          planned_start: '08:00:00',
        }),
        order({ id: 'running', planned_date: '2026-09-30', running_since: '2026-09-27T10:00:00Z' }),
      ],
      today,
      now,
    );
    expect(ids(day.flexible)).toEqual(['started', 'running']);
  });

  it('terminés des 7 derniers jours, les plus récents d’abord', () => {
    const day = planMyDay(
      [
        order({ id: 'done', status: 'work_done', updated_at: '2026-09-25T08:00:00Z' }),
        order({ id: 'done-later', status: 'to_invoice', updated_at: '2026-09-26T08:00:00Z' }),
        order({ id: 'done-old', status: 'invoiced', updated_at: '2026-09-10T08:00:00Z' }),
      ],
      today,
      now,
    );
    expect(ids(day.recentlyDone)).toEqual(['done-later', 'done']);
  });
});
