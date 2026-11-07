import { describe, expect, it } from 'vitest';
import type { InvoiceOverview } from './api';
import { buildDuesPdf } from './dues-pdf';
import { duesByClient, duesTotals, previousMonth, type DuesClient } from './dues';

const TODAY = '2026-11-07';

const invoice = (id: string, clientId: string, issued: string, ttc: number, paid: number): InvoiceOverview =>
  ({
    id,
    number: `F${id}`,
    status: 'issued',
    client_id: clientId,
    vehicle_label: null,
    issued_at: `${issued}T09:00:00Z`,
    due_date: issued,
    total_ht: Math.round((ttc / 1.2) * 100) / 100,
    total_vat: Math.round((ttc - ttc / 1.2) * 100) / 100,
    total_ttc: ttc,
    paid_ttc: paid,
    credited_ttc: 0,
    balance_due: Math.round((ttc - paid) * 100) / 100,
  }) as InvoiceOverview;

const client = (id: string, name: string, account_type: string, direct_debit_day: number | null = null) =>
  ({
    id,
    name,
    billing_address: null,
    siret: null,
    legacy_key: `GTA-411${id}`,
    account_type,
    direct_debit_day,
  }) as DuesClient;

const clients = [
  client('1', 'Nordis Fret', 'prelevement', 5),
  client('2', 'Garnier Bennes', 'prelevement', 5),
  client('3', 'TLM Express', 'quinzaine'),
  client('4', 'Transports Moreau', 'comptant'),
];
const invoices = [
  invoice('100', '1', '2026-10-10', 648, 0),
  invoice('101', '1', '2026-10-16', 97.2, 50),
  invoice('102', '2', '2026-10-11', 223.2, 0),
  invoice('103', '2', '2026-09-30', 500, 0), // septembre : hors période
  invoice('104', '2', '2026-11-02', 300, 0), // novembre : hors période
  invoice('105', '3', '2026-10-20', 900, 0),
  invoice('106', '4', '2026-10-21', 120, 0),
  invoice('107', '4', '2026-10-22', 80, 80), // réglée : pas due
];
const october = { from: '2026-10-01', to: '2026-10-31' };

describe('sommes dues par les clients', () => {
  it('période par défaut : le mois précédent (le 7 novembre → octobre)', () => {
    expect(previousMonth('2026-11-07')).toEqual(october);
    expect(previousMonth('2027-01-07')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(previousMonth('2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('prélèvement le 5, octobre : un bloc par client, factures restant dues, totaux', () => {
    const groups = duesByClient(invoices, clients, {}, { ...october, accounts: ['prelevement_5'] }, TODAY);
    expect(groups.map((group) => [group.client.name, group.account, group.clientNumber])).toEqual([
      ['Garnier Bennes', 'Prélèvement le 5', '4112'],
      ['Nordis Fret', 'Prélèvement le 5', '4111'],
    ]);
    expect(groups[0]?.rows.map((row) => row.number)).toEqual(['F102']);
    expect(groups[1]?.rows.map((row) => [row.number, row.due, row.state])).toEqual([
      ['F100', 648, 'En retard'],
      ['F101', 47.2, 'Partielle, en retard'],
    ]);
    expect(groups[1]?.totals.due).toBe(695.2);
    expect(duesTotals(groups)).toMatchObject({ ttc: 968.4, paid: 50, due: 918.4 });
  });

  it('tous les types de règlement : factures payées et hors période écartées', () => {
    const groups = duesByClient(invoices, clients, {}, { ...october, accounts: [] }, TODAY);
    expect(groups.map((group) => group.client.name)).toEqual([
      'Garnier Bennes',
      'Nordis Fret',
      'TLM Express',
      'Transports Moreau',
    ]);
    expect(groups.find((group) => group.client.id === '4')?.rows.map((row) => row.number)).toEqual(['F106']);
    expect(duesTotals(groups).due).toBe(1938.4);
  });

  it('PDF au format de l’extrait de compte : période, règlement, clients, total général', async () => {
    const groups = duesByClient(invoices, clients, {}, { ...october, accounts: ['prelevement_5'] }, TODAY);
    const { doc, fileName } = await buildDuesPdf({
      groups,
      period: october,
      accounts: ['Prélèvement le 5'],
      company: {
        legal_name: 'RTS',
        address_line: '19 rue Gaston Monmousseau',
        postal_code: '95190',
        city: 'Goussainville',
        default_vat_rate: 20,
        payment_terms_days: 30,
        invoice_legal_mentions: [],
        invoice_terms: '',
      } as never,
      logo: null,
      now: new Date('2026-11-07T14:57:00'),
    });
    expect(fileName).toBe('Sommes_dues_2026-10-01_2026-10-31.pdf');
    const text = (doc as unknown as { internal: { pages: string[][] } }).internal.pages.flat().join('\n');
    for (const expected of [
      'SOMMES DUES SUR LES FACTURES DU 01/10/2026 AU 31/10/2026',
      '07/11/2026',
      '14:57',
      'Garnier Bennes',
      'client 4112',
      'Total Nordis Fret',
      'Total Garnier Bennes',
      '918,40',
    ])
      expect(text).toContain(expected);
  });
});
