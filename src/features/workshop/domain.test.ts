import { describe, expect, it } from 'vitest';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import type { RoLine } from '@/features/repair-orders/api';
import {
  CT_PHOTO_LABEL,
  finishBlockers,
  formatTireSize,
  parseTimeOption,
  planMyDay,
  seenState,
  isExtinguisherLine,
  TIME_OPTIONS,
  timeOptionLabel,
  timeOptionsFor,
  timeOptionValue,
} from './domain';
import {
  canAddAxles,
  CHECK_FIELDS,
  inspectionMissingPoints,
  WEAR_FIELDS,
  wearFieldsFor,
} from '@/features/repair-orders/inspection';

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

  it('par demi-heure de 0,5 h à 12 h, sans 0 h, libellés en français', () => {
    expect(TIME_OPTIONS.slice(0, 4)).toEqual(['0.5h', '1h', '1.5h', '2h']);
    expect(TIME_OPTIONS).toHaveLength(25);
    expect(TIME_OPTIONS).not.toContain('0h');
    expect(parseTimeOption('0.5h')).toEqual({ estimated_hours: 0.5, estimate_is_minimum: false });
    expect([timeOptionLabel('0.5h'), timeOptionLabel('3h'), timeOptionLabel('12h+')]).toEqual([
      '0,5 h',
      '3 h',
      '12 h et plus',
    ]);
  });

  it('garde à sa place une valeur hors liste ; 0,3 h pour un extincteur', () => {
    expect(timeOptionsFor('1.25h').slice(0, 4)).toEqual(['0.5h', '1h', '1.25h', '1.5h']);
    expect(timeOptionsFor('2h')).toHaveLength(25);
    expect(timeOptionsFor('', true).slice(0, 2)).toEqual(['0.3h', '0.5h']);
    expect(timeOptionsFor('0.3h', true).slice(0, 2)).toEqual(['0.3h', '0.5h']);
    expect(isExtinguisherLine('Contrôle Extincteur')).toBe(true);
  });
});

describe('clôture de l’OR par le technicien', () => {
  const line = (overrides: Partial<RoLine>): RoLine =>
    ({
      kind: 'done',
      line_type: 'labor',
      description: 'Travail',
      estimated_hours: null,
      standard_hours: null,
      ...overrides,
    }) as RoLine;
  // Photo du contrôle technique : toujours exigée
  const CT = [CT_PHOTO_LABEL];

  it('rien à compléter : la liste est vide', () => {
    expect(finishBlockers([line({ estimated_hours: 1 })], null, CT)).toEqual([]);
  });

  it('photo du contrôle technique exigée, sauf pour une remorque', () => {
    expect(finishBlockers([], null, [])).toEqual(['Photo du contrôle technique obligatoire']);
    expect(finishBlockers([], null, [], false, 'vul')).toEqual(['Photo du contrôle technique obligatoire']);
    expect(finishBlockers([], null, [], false, 'remorque')).toEqual([]);
  });

  it('temps estimé de chaque tâche, à l’aveugle : le barème ne compte jamais pour le technicien', () => {
    const lines = [
      line({}),
      line({ kind: 'planned' }),
      line({ kind: 'planned' }),
      line({ kind: 'planned', line_type: 'package', description: 'Freinage avant', standard_hours: 2 }),
      line({ kind: 'planned', line_type: 'package', description: 'Extincteur 6 kg', standard_hours: 0.3 }),
      line({ kind: 'planned', line_type: 'text' }),
      line({ kind: 'done', line_type: 'package', standard_hours: 2 }),
    ];
    expect(finishBlockers(lines, null, CT)).toEqual([
      'Temps estimé manquant : 2 tâches des travaux effectués',
      'Temps estimé manquant : 4 tâches à prévoir',
    ]);
  });

  it('taille des pneus : essieux ajoutés (3e, 4e…) et milieu d’une ancienne fiche aussi', () => {
    const inspection = { pneus: { milieu_etat: 'HS', essieux: [{ etat: '50' }, { etat: 'OK' }] } };
    expect(finishBlockers([], inspection, CT)).toEqual([
      'Taille des pneus milieu obligatoire (HS)',
      'Taille des pneus essieu 3 obligatoire (50 %)',
    ]);
  });

  it('fiche complète selon le véhicule : pas de barres sur un VUL, ni de kit sur une remorque', () => {
    const tyres = { avant_etat: 'OK', arriere_etat: 'OK' };
    const controles = Object.fromEntries(CHECK_FIELDS.map(([key]) => [key, 'OK']));
    const brakes = {
      plaquettes_avant: 'OK',
      plaquettes_arriere: 'OK',
      disques_avant: 'OK',
      disques_arriere: 'OK',
    };
    expect(inspectionMissingPoints({ usure: brakes, pneus: tyres, controles }, 'pl')).toBe(3);
    expect(inspectionMissingPoints({ usure: brakes, pneus: tyres, controles }, 'vul')).toBe(1);
    expect(inspectionMissingPoints({ usure: brakes, pneus: tyres, controles }, 'remorque')).toBe(0);
    expect(wearFieldsFor('remorque').map(([key]) => key)).not.toContain('kit_accessoires');
    expect(canAddAxles('vul')).toBe(false);
    expect(canAddAxles('remorque')).toBe(true);
  });

  it('taille des pneus mise en forme : barres et point posés tout seuls', () => {
    expect(formatTireSize('31570225')).toBe('315/70/22.5');
    expect(formatTireSize('315/70/22.5')).toBe('315/70/22.5');
    expect(formatTireSize('3157022')).toBe('315/70/22');
    expect(formatTireSize('2055516')).toBe('205/55/16');
    expect(formatTireSize('315')).toBe('315');
  });

  it('fiche complète exigée par la direction : tous les points OK / 50 % / HS', () => {
    const partial = { usure: { plaquettes_avant: 'OK' }, pneus: { avant_etat: 'OK', arriere_etat: 'OK' } };
    expect(finishBlockers([], partial, CT)).toEqual([]);
    expect(finishBlockers([], partial, CT, true)).toEqual([
      'Fiche de contrôle complète exigée : 12 points OK / 50 % / HS non renseignés',
    ]);
    const complete = {
      usure: Object.fromEntries(WEAR_FIELDS.map(([key]) => [key, 'OK'])),
      pneus: { avant_etat: 'OK', arriere_etat: '50', arriere_taille: '315/80/22.5' },
      controles: Object.fromEntries(CHECK_FIELDS.map(([key]) => [key, 'OK'])),
    };
    expect(inspectionMissingPoints(complete)).toBe(0);
    expect(finishBlockers([], complete, CT, true)).toEqual([]);
  });

  it('pneus à 50 % ou HS : taille obligatoire ; étiquette hayon HS : photo obligatoire', () => {
    const inspection = {
      pneus: { avant_etat: 'HS', arriere_etat: '50', arriere_taille: '315/80/22.5' },
      controles: { hayon: 'HS' },
    };
    expect(finishBlockers([], inspection, [...CT, 'Extincteur 1 kg cabine'])).toEqual([
      'Taille des pneus avant obligatoire (HS)',
      'Photo de l’étiquette contrôle hayon obligatoire (HS)',
    ]);
    expect(
      finishBlockers([], { ...inspection, pneus: { ...inspection.pneus, avant_taille: '315/70/22.5' } }, [
        ...CT,
        'Étiquette contrôle hayon',
      ]),
    ).toEqual([]);
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
