import { describe, expect, it } from 'vitest';
import { computeTotals, lineNet, type PricedLine } from './lines';

/** [prix HT, quantité, remise %, TVA %] */
type Row = [number, number, number, number];

const lines = (rows: Row[]) =>
  rows.map(([unit_price, quantity, discount_percent, vat_rate]): PricedLine => ({
    line_type: 'labor',
    unit_price,
    quantity,
    discount_percent,
    vat_rate,
  }));

// Totaux calculés par la base (numeric exact) sur des documents tirés au hasard.
// Les trois premiers donnaient 1 centime d'écart avec l'ancien calcul du navigateur.
const DATABASE_CASES: { rows: Row[]; ht: number; vat: number }[] = [
  {
    rows: [
      [924.01, 2.5, 12.5, 20],
      [618.12, 0.25, 0, 5.5],
      [68.91, 2.5, 0, 20],
      [716.49, 2.5, 33.33, 5.5],
      [835.85, 2.5, 0, 20],
    ],
    ht: 5631.92,
    vat: 930.82,
  },
  {
    rows: [
      [620.28, 1.33, 33.33, 20],
      [917.28, 0.25, 33.33, 5.5],
      [934.98, 7, 3, 20],
      [704.63, 1, 7.5, 20],
      [954.86, 1, 33.33, 5.5],
      [43.91, 1.5, 0, 20],
    ],
    ht: 8405.67,
    vat: 1566.65,
  },
  {
    rows: [
      [334.82, 0.75, 0, 20],
      [558.05, 0.5, 0, 10],
      [403.81, 2, 5, 20],
      [326.06, 2, 5, 20],
      [731.93, 7, 7.5, 20],
    ],
    ht: 6656.15,
    vat: 1303.32,
  },
  {
    rows: [
      [997.52, 3, 33.33, 20],
      [246.95, 1.5, 0, 20],
    ],
    ht: 2365.57,
    vat: 473.11,
  },
  {
    rows: [
      [465.51, 0.25, 100, 20],
      [523.84, 12.5, 7.5, 10],
      [224.95, 0.5, 33.33, 20],
    ],
    ht: 6131.89,
    vat: 620.69,
  },
  { rows: [[345.55, 7, 33.33, 5.5]], ht: 1612.65, vat: 88.7 },
  {
    rows: [
      [918.88, 1, 3, 5.5],
      [858.24, 2, 5, 20],
      [300.07, 0.25, 100, 20],
      [408.8, 12.5, 10, 10],
      [797.25, 1.5, 0, 20],
    ],
    ht: 8316.85,
    vat: 1074.23,
  },
  {
    rows: [
      [905.85, 1.5, 12.5, 20],
      [29.27, 12.5, 0, 5.5],
    ],
    ht: 1554.81,
    vat: 257.91,
  },
  {
    rows: [
      [679.77, 1.5, 10, 20],
      [914.33, 7, 12.5, 20],
      [58.19, 12.5, 5, 20],
      [214, 0.25, 33.33, 20],
      [626.75, 1, 3, 20],
    ],
    ht: 7852.59,
    vat: 1570.52,
  },
];

describe('montants au centime près, comme la base', () => {
  it.each(DATABASE_CASES.map((c, i) => [i + 1, c] as const))('document %i', (_, { rows, ht, vat }) => {
    const totals = computeTotals(lines(rows));
    expect({ ht: totals.ht, vat: totals.vat }).toEqual({ ht, vat });
    expect(totals.ttc).toBe(Math.round((ht + vat) * 100) / 100);
  });

  it('net de ligne : moitié de centime arrondie vers le haut', () => {
    expect(lineNet({ line_type: 'labor', unit_price: 10.05, quantity: 0.5, discount_percent: 0 })).toBe(5.03);
    expect(lineNet({ line_type: 'labor', unit_price: 1.01, quantity: 0.5, discount_percent: 0 })).toBe(0.51);
    expect(lineNet({ line_type: 'text', unit_price: 50, quantity: 1, discount_percent: 0 })).toBe(0);
    expect(lineNet({ line_type: 'part', unit_price: null, quantity: 2, discount_percent: 0 })).toBe(0);
  });

  it('TVA arrondie par taux puis additionnée', () => {
    const totals = computeTotals(
      lines([
        [10.01, 1, 0, 20],
        [10.01, 1, 0, 5.5],
      ]),
    );
    expect(totals.rates).toEqual([
      { rate: 20, amount: 2 },
      { rate: 5.5, amount: 0.55 },
    ]);
    expect(totals).toMatchObject({ ht: 20.02, vat: 2.55, ttc: 22.57 });
  });
});
