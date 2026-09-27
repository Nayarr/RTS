import { describe, expect, it } from 'vitest';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { parseTimeOption, seenState, splitMyOrders, timeOptionsFor, timeOptionValue } from './domain';

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

describe('liste du technicien', () => {
  it('OR planifiés d’abord (par heure), puis les plus récents ; terminés des 7 derniers jours à part', () => {
    const now = new Date('2026-09-27T12:00:00Z').getTime();
    const { active, recentlyDone } = splitMyOrders(
      [
        order({ id: 'recent', created_at: '2026-09-26T08:00:00Z' }),
        order({ id: 'old', created_at: '2026-09-01T08:00:00Z' }),
        order({ id: 'at14', planned_date: '2026-09-27', planned_start: '14:00:00' }),
        order({ id: 'at9', planned_date: '2026-09-27', planned_start: '09:00:00' }),
        order({ id: 'done', status: 'work_done', updated_at: '2026-09-25T08:00:00Z' }),
        order({ id: 'done-old', status: 'invoiced', updated_at: '2026-09-10T08:00:00Z' }),
      ],
      now,
    );
    expect(active.map((o) => o.id)).toEqual(['at9', 'at14', 'recent', 'old']);
    expect(recentlyDone.map((o) => o.id)).toEqual(['done']);
  });
});
