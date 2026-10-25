import { describe, expect, it } from 'vitest';
import type { CreditNote, InvoiceOverview } from './api';
import {
  clientNumber,
  settlementLabel,
  settlementOf,
  sortStatement,
  statementPeriod,
  statementRows,
  statementTotals,
  type StatementFilters,
} from './statement';

const TODAY = '2026-10-21';

const invoice = (
  id: string,
  number: string,
  issued: string,
  ttc: number,
  paid: number,
  overrides: Partial<InvoiceOverview> = {},
): InvoiceOverview =>
  ({
    id,
    number,
    status: 'issued',
    client_id: 'cbtp',
    client_name: 'SOCIETE CBTP',
    vehicle_label: null,
    issued_at: `${issued}T09:00:00Z`,
    due_date: '2026-10-01',
    created_at: `${issued}T08:00:00Z`,
    total_ht: Math.round((ttc / 1.2) * 100) / 100,
    total_vat: Math.round((ttc - ttc / 1.2) * 100) / 100,
    total_ttc: ttc,
    paid_ttc: paid,
    credited_ttc: 0,
    balance_due: Math.round((ttc - paid) * 100) / 100,
    repair_order_ids: [],
    repair_order_numbers: [],
    ...overrides,
  }) as InvoiceOverview;

// Exemple validé avec le client (relevé du 01/08/2026 au 30/09/2026)
const invoices = [
  invoice('a', '11000', '2026-08-07', 108, 108),
  invoice('b', '11187', '2026-08-17', 96, 0, { vehicle_label: 'ET-184-VT' }),
  invoice('c', '11240', '2026-08-19', 108, 50, { due_date: '2026-11-30' }),
  invoice('d', '11736', '2026-09-14', 74.4, 0, { due_date: '2026-11-14' }),
  invoice('e', '11941', '2026-09-25', 3600, 1000),
  invoice('z', '12001', '2026-10-05', 120, 0),
  { ...invoice('draft', '', '2026-09-01', 50, 0), status: 'draft', number: null } as InvoiceOverview,
];
const vehicles = {
  b: { plate: 'ET-184-VT', brand: 'MAN', model: null },
  d: { plate: 'GZ-987-QZ', brand: 'MAN', model: 'TGS' },
};
const all: StatementFilters = {
  from: '2026-08-01',
  to: '2026-09-30',
  settlements: ['unpaid', 'partial', 'paid'],
  credits: true,
};

describe('extrait de compte', () => {
  it('état de chaque facture : payée, partielle, impayée, en retard une fois échue', () => {
    expect(settlementOf(invoices[0]!)).toBe('paid');
    expect(settlementOf(invoices[2]!)).toBe('partial');
    expect(settlementOf(invoices[3]!)).toBe('unpaid');
    expect(settlementLabel(invoices[1]!, TODAY)).toBe('En retard');
    expect(settlementLabel(invoices[2]!, TODAY)).toBe('Partielle');
    expect(settlementLabel(invoices[3]!, TODAY)).toBe('Impayée');
    expect(settlementLabel(invoices[4]!, TODAY)).toBe('Partielle, en retard');
    // Soldée par un avoir : payée
    expect(settlementOf({ paid_ttc: 0, balance_due: 0 })).toBe('paid');
  });

  it('période et toutes les factures : lignes, véhicules, totaux de l’exemple', () => {
    const rows = statementRows(invoices, [], vehicles, all, TODAY);
    expect(rows.map((row) => row.number)).toEqual(['11000', '11187', '11240', '11736', '11941']);
    expect(rows[3]).toMatchObject({ plate: 'GZ-987-QZ', brand: 'MAN', model: 'TGS', paid: 0, due: 74.4 });
    expect(rows[1]).toMatchObject({ plate: 'ET-184-VT', brand: 'MAN', model: '', state: 'En retard' });
    expect(statementTotals(rows)).toEqual({ ht: 3322, vat: 664.4, ttc: 3986.4, paid: 1158, due: 2828.4 });
  });

  it('impayées et partielles seulement : la facture payée sort, totaux recalculés', () => {
    const rows = statementRows(invoices, [], vehicles, { ...all, settlements: ['unpaid', 'partial'] }, TODAY);
    expect(rows.map((row) => row.number)).toEqual(['11187', '11240', '11736', '11941']);
    expect(statementTotals(rows)).toEqual({ ht: 3232, vat: 646.4, ttc: 3878.4, paid: 1050, due: 2828.4 });
  });

  it('avoir en ligne négative sous sa facture, sans réglé ni reste dû ; masqué sans « Avoirs »', () => {
    const note = {
      id: 'n1',
      invoice_id: 'e',
      number: 'AV12',
      issued_at: '2026-09-28T10:00:00Z',
      amount_ht: 100,
      total_vat: 20,
      total_ttc: 120,
    } as CreditNote;
    const credited = invoices.map((item) =>
      item.id === 'e' ? { ...item, credited_ttc: 120, balance_due: 2480 } : item,
    );
    const rows = statementRows(credited, [note], vehicles, all, TODAY);
    expect(rows.at(-1)).toMatchObject({
      kind: 'credit',
      number: 'AV12',
      ttc: -120,
      paid: null,
      due: null,
      state: 'Avoir sur 11941',
    });
    const totals = statementTotals(rows);
    expect(totals).toMatchObject({ ttc: 3866.4, paid: 1158, due: 2708.4 });
    expect(totals.ttc - totals.paid).toBeCloseTo(totals.due);
    expect(statementRows(credited, [note], vehicles, { ...all, credits: false }, TODAY)).toHaveLength(5);
  });

  it('tri par colonne, dans les deux sens', () => {
    const rows = statementRows(invoices, [], vehicles, all, TODAY);
    expect(sortStatement(rows, 'due', 'desc').map((row) => row.number)).toEqual([
      '11941',
      '11187',
      '11736',
      '11240',
      '11000',
    ]);
    expect(sortStatement(rows, 'plate', 'asc')[3]?.plate).toBe('ET-184-VT');
    expect(sortStatement(rows, 'number', 'desc')[0]?.number).toBe('11941');
  });

  it('période imprimée et n° client repris de l’ancien logiciel', () => {
    const rows = statementRows(invoices, [], vehicles, { ...all, from: '', to: '' }, TODAY);
    expect(statementPeriod(rows, { ...all, from: '', to: '' }, TODAY)).toEqual({
      from: '2026-08-07',
      to: TODAY,
    });
    expect(statementPeriod(rows, all, TODAY)).toEqual({ from: '2026-08-01', to: '2026-09-30' });
    expect(clientNumber('GTA-41100091')).toBe('41100091');
    expect(clientNumber(null)).toBeNull();
  });
});
