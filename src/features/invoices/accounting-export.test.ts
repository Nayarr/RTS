import { describe, expect, it } from 'vitest';
import type { InvoiceLine, InvoiceOverview } from './api';
import {
  accountingSheets,
  csvCells,
  entriesSheet,
  parisDay,
  sheetFileName,
  type AccountingData,
  type AccountingSheet,
} from './accounting-export';

const invoice = (patch: Partial<InvoiceOverview>) =>
  ({
    id: 'i1',
    number: 'F1',
    status: 'issued',
    client_id: 'abcdef12-0000',
    client_name: 'Transports Martin',
    client_siret: '98498913700018',
    vehicle_label: 'AA-123-BB',
    mileage: 120000,
    issued_at: '2026-10-15T10:00:00Z',
    service_date: '2026-10-14',
    due_date: '2026-11-14',
    total_ht: 390,
    total_vat: 78,
    total_ttc: 468,
    paid_ttc: 100,
    credited_ttc: 0,
    balance_due: 368,
    payment_status: 'partial',
    repair_order_numbers: ['OR1'],
    reminders_count: 0,
    vat_scheme: 'normal',
    vat_exempt: false,
    ...patch,
  }) as InvoiceOverview;

const line = (patch: Partial<InvoiceLine>) =>
  ({
    invoice_id: 'i1',
    line_type: 'labor',
    description: 'Vidange',
    quantity: 3,
    unit_price: 90,
    discount_percent: 0,
    net_ht: 270,
    vat_rate: 20,
    purchase_price: null,
    shipping_cost: null,
    ...patch,
  }) as InvoiceLine;

const base: AccountingData = {
  from: '2026-10-01',
  to: '2026-10-31',
  invoices: [invoice({})],
  lines: new Map([
    [
      'i1',
      [
        line({}),
        line({
          line_type: 'part',
          description: 'Filtre\nMann',
          quantity: 2,
          unit_price: 60,
          net_ht: 120,
          purchase_price: 40,
          shipping_cost: 5,
          manufacturer_ref: 'HU 12',
          oem_ref: '5010',
        }),
        line({ line_type: 'text', description: 'Remarque', net_ht: 0 }),
      ],
    ],
  ]),
  payments: [
    {
      id: 'p1',
      invoice_id: 'i1',
      paid_on: '2026-10-20',
      method: 'cash',
      amount_ttc: 100,
      note: null,
      recorder_name: 'Réception',
      invoice_number: 'F1',
      client_id: 'abcdef12-0000',
      client_name: 'Transports Martin',
      invoice_ht: 390,
      invoice_vat: 78,
      invoice_ttc: 468,
    },
  ],
  creditNotes: [
    {
      id: 'c1',
      number: 'AV1',
      issued_at: '2026-10-25T10:00:00Z',
      reason: 'Geste',
      amount_ht: 50,
      vat_rate: 20,
      total_vat: 10,
      total_ttc: 60,
      invoice_number: 'F1',
      client_id: 'abcdef12-0000',
      client_name: 'Transports Martin',
      vehicle_label: 'AA-123-BB',
    },
  ],
  marginRates: new Map(),
};

const margin: AccountingData = {
  ...base,
  invoices: [
    invoice({
      id: 'i2',
      number: 'F2',
      vat_scheme: 'margin',
      margin_purchase_price: 9000,
      total_ht: 11500,
      total_vat: 500,
      total_ttc: 12000,
    }),
  ],
  lines: new Map([
    [
      'i2',
      [
        line({
          invoice_id: 'i2',
          line_type: 'vehicle',
          quantity: 1,
          unit_price: 12000,
          net_ht: 12000,
          vat_rate: 0,
        }),
      ],
    ],
  ]),
  payments: [],
  creditNotes: [],
  marginRates: new Map([['i2', 20]]),
};

const sheet = (data: AccountingData, name: string) => {
  const found = accountingSheets(data).find((item) => item.name === name);
  if (!found) throw new Error(name);
  return found;
};
/** Ligne sous forme { en-tête: valeur }. */
const record = (from: AccountingSheet, index: number) =>
  Object.fromEntries(from.columns.map((column, i) => [column.header, from.rows[index]?.[i]]));

/** Débit et crédit de chaque écriture. */
function balances(data: AccountingData) {
  const entries = entriesSheet(data);
  const at = (header: string) => entries.columns.findIndex((column) => column.header === header);
  const totals = new Map<string, number>();
  for (const row of entries.rows) {
    const key = row[at('EcritureNum')] as string;
    const delta = (row[at('Debit')] as number) - (row[at('Credit')] as number);
    totals.set(key, Math.round(((totals.get(key) ?? 0) + delta) * 100) / 100);
  }
  return totals;
}

describe('export comptable : onglets', () => {
  it('7 onglets, fichiers CSV sans accents', () => {
    const sheets = accountingSheets(base);
    expect(sheets.map((item) => item.name)).toEqual([
      'Synthèse',
      'Factures',
      'Lignes',
      'TVA',
      'Paiements',
      'Avoirs',
      'Écritures',
    ]);
    expect(sheets.map(sheetFileName)).toContain('ecritures.csv');
  });

  it('chaque ligne a autant de cellules que de colonnes', () => {
    for (const data of [base, margin]) {
      for (const item of accountingSheets(data)) {
        for (const row of item.rows) expect(row).toHaveLength(item.columns.length);
      }
    }
  });

  it('factures : montants par nature, coût, marge, reste dû', () => {
    expect(record(sheet(base, 'Factures'), 0)).toMatchObject({
      'N° facture': 'F1',
      'Date facture': '2026-10-15',
      Mois: '2026-10',
      'Régime TVA': 'Normal',
      'Total HT': 390,
      'Main d’œuvre HT': 270,
      'Pièces et fournitures HT': 120,
      'Coût d’achat': 85,
      'Marge brute HT': 305,
      'Reste dû': 368,
    });
  });

  it('lignes : pas de ligne de texte, désignation sur une ligne, références, marge', () => {
    const lines = sheet(base, 'Lignes');
    expect(lines.rows).toHaveLength(2);
    expect(record(lines, 1)).toMatchObject({
      Désignation: 'Filtre · Mann',
      'Réf. fabricant': 'HU 12',
      'Réf. constructeur': '5010',
      'Net HT': 120,
      TVA: 24,
      'Total TTC': 144,
      'Coût d’achat': 85,
      'Marge HT': 35,
      Compte: '707000',
    });
  });

  it('TVA : par mois et taux, avoirs à part', () => {
    const vat = sheet(base, 'TVA');
    expect(record(vat, 0)).toMatchObject({
      Mois: '2026-10',
      Régime: 'Normal',
      'Base HT facturée': 390,
      'TVA facturée': 78,
    });
    expect(record(vat, 1)).toMatchObject({
      Régime: 'Avoir',
      'Avoirs HT': 50,
      'Avoirs TVA': 10,
      'TVA nette': -10,
    });
  });

  it('paiements : TVA encaissée au prorata', () => {
    expect(record(sheet(base, 'Paiements'), 0)).toMatchObject({
      Mode: 'Espèces',
      'Montant TTC': 100,
      'dont TVA': 16.67,
      'dont HT': 83.33,
      Compte: '530000',
    });
  });

  it('TVA sur la marge : vraie TVA en comptabilité, net sans la TVA', () => {
    expect(record(sheet(margin, 'Factures'), 0)).toMatchObject({
      'Régime TVA': 'TVA sur la marge',
      'Total HT': 11500,
      TVA: 500,
      'Total TTC': 12000,
      'Coût d’achat': 9000,
      'Marge brute HT': 2500,
      'Autres HT': 11500,
    });
    expect(record(sheet(margin, 'Lignes'), 0)).toMatchObject({
      'Net HT': 11500,
      'Taux TVA %': 20,
      TVA: 500,
      'Total TTC': 12000,
      Compte: '775000',
    });
    expect(record(sheet(margin, 'TVA'), 0)).toMatchObject({
      Régime: 'TVA sur la marge',
      'Taux %': 20,
      'TVA facturée': 500,
    });
  });
});

describe('export comptable : écritures', () => {
  it('chaque écriture est équilibrée', () => {
    for (const data of [base, margin]) {
      const totals = balances(data);
      expect(totals.size).toBeGreaterThan(0);
      for (const total of totals.values()) expect(total).toBe(0);
    }
  });

  it('facture : client au débit, produits par compte et TVA au crédit', () => {
    const entries = entriesSheet(base);
    const sales = entries.rows
      .map((_, index) => record(entries, index))
      .filter((row) => row.JournalCode === 'VT')
      .map((row) => [row.CompteNum, row.Debit, row.Credit]);
    expect(sales).toEqual([
      ['411000', 468, 0],
      ['706000', 0, 270],
      ['707000', 0, 120],
      ['445710', 0, 78],
    ]);
    expect(record(entries, 0)).toMatchObject({
      EcritureDate: '20261015',
      CompAuxNum: 'CABCDEF12',
      PieceRef: 'F1',
    });
  });

  it('facture reprise sans lignes ou écart d’arrondi : reste équilibrée', () => {
    const noLines = { ...base, lines: new Map(), payments: [], creditNotes: [] };
    expect([...balances(noLines).values()]).toEqual([0]);
    const gap = { ...base, invoices: [invoice({ total_ht: 390.01, total_vat: 78, total_ttc: 468.01 })] };
    for (const total of balances(gap).values()) expect(total).toBe(0);
  });

  it('avoir et paiement : sens inversé sur le client', () => {
    const entries = entriesSheet(base);
    const client = entries.rows
      .map((_, index) => record(entries, index))
      .filter((row) => row.CompteNum === '411000' && row.JournalCode !== 'VT')
      .map((row) => [row.JournalCode, row.Debit, row.Credit]);
    expect(client).toEqual([
      ['AV', 0, 60],
      ['BQ', 0, 100],
    ]);
  });
});

describe('export comptable : fichiers', () => {
  it('CSV : dates françaises, entiers sans décimales', () => {
    const { headers, rows } = csvCells(sheet(base, 'Factures'));
    const row = rows[0]!;
    expect(row[headers.indexOf('Date facture')]).toBe('15/10/2026');
    expect(row[headers.indexOf('Kilométrage')]).toBe('120000');
    expect(row[headers.indexOf('Total HT')]).toBe(390);
  });

  it('jour de Paris : facture émise tard le soir', () => {
    expect(parisDay('2026-10-31T23:30:00Z')).toBe('2026-11-01');
    expect(parisDay('2026-10-31')).toBe('2026-10-31');
    expect(parisDay(null)).toBeNull();
  });
});
