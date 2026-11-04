import { describe, expect, it } from 'vitest';
import type { PartStats } from './api';
import { filterGroups, groupParts, refKey } from './part-groups';

const part = (patch: Partial<PartStats>) =>
  ({
    id: 'p',
    designation: 'Filtre à huile',
    oem_ref: null,
    manufacturer_ref: null,
    brand: null,
    vehicle_ref: null,
    supplier_name: null,
    quantity_sold: 0,
    quotes_count: 0,
    revenue_ht: 0,
    margin_ht: 0,
    ...patch,
  }) as PartStats;

const mann = part({
  id: 'a',
  oem_ref: '5010-477 842',
  manufacturer_ref: 'HU 12 140 x',
  brand: 'Mann',
  quantity_sold: 2,
  revenue_ht: 60,
});
const hengst = part({
  id: 'b',
  oem_ref: '5010477842',
  manufacturer_ref: 'E 340 H',
  supplier_name: 'Autodistribution',
  quantity_sold: 3,
  revenue_ht: 90,
});
const seule = part({ id: 'c', designation: 'Ampoule H7' });

describe('références des pièces', () => {
  it('compare sans casse ni séparateurs', () => {
    expect(refKey('5010-477 842')).toBe(refKey('5010477842'));
    expect(refKey('hu 12.140/x')).toBe('HU12140X');
  });

  it('même référence constructeur : une seule pièce, chiffres additionnés', () => {
    const groups = groupParts([mann, hengst, seule]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ quantitySold: 5, revenue: 150 });
    expect(groups[0]?.variants.map((variant) => variant.id)).toEqual(['a', 'b']);
  });

  it('sans référence constructeur : pièces séparées', () => {
    expect(groupParts([seule, part({ id: 'd', designation: 'Courroie' })])).toHaveLength(2);
  });

  it.each(['e340h', 'E 340 H', '5010 477 842', 'mann', 'autodistribution', 'filtre a huile'])(
    'recherche « %s » : la pièce et toutes ses références équivalentes',
    (search) => {
      const [found, ...others] = filterGroups(groupParts([mann, hengst, seule]), search);
      expect(others).toEqual([]);
      expect(found?.variants).toHaveLength(2);
    },
  );
});
