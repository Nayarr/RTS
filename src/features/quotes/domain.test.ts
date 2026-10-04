import { describe, expect, it } from 'vitest';
import type { CompanySettings } from '@/features/settings/api';
import { companyLines } from '@/lib/pdf';
import type { QuoteLine } from './api';
import {
  computeTotals,
  isQuoteLocked,
  lineNet,
  nextPosition,
  packageFitsVehicle,
  pricedDoneLines,
} from './domain';
import { printedSections } from './quote-pdf';

const line = (overrides: Partial<QuoteLine>): QuoteLine =>
  ({
    id: 'l',
    section: 'planned',
    position: 0,
    line_type: 'labor',
    description: 'Ligne',
    unit_price: 100,
    quantity: 1,
    discount_percent: 0,
    vat_rate: 20,
    ...overrides,
  }) as QuoteLine;

describe('calculs du devis (identiques à la base)', () => {
  it('net HT : prix × quantité − remise, arrondi au centime ; texte à 0', () => {
    expect(lineNet(line({ unit_price: 90, quantity: 2.5, discount_percent: 10 }))).toBe(202.5);
    expect(lineNet(line({ unit_price: 33.33, quantity: 3, discount_percent: 15 }))).toBe(84.99);
    expect(lineNet(line({ line_type: 'text', unit_price: 50 }))).toBe(0);
    expect(lineNet(line({ unit_price: null }))).toBe(0);
  });

  it('TVA arrondie par taux', () => {
    const totals = computeTotals([
      line({ unit_price: 100 }),
      line({ unit_price: 50.05 }),
      line({ unit_price: 10, vat_rate: 5.5 }),
      line({ line_type: 'text', unit_price: 999 }),
    ]);
    expect(totals).toEqual({
      ht: 160.05,
      vat: 30.56,
      ttc: 190.61,
      rates: [
        { rate: 20, amount: 30.01 },
        { rate: 5.5, amount: 0.55 },
      ],
    });
  });

  it('forfaits proposés selon le type de véhicule', () => {
    expect(packageFitsVehicle(null, 'vul')).toBe(true);
    expect(packageFitsVehicle('tolerie', 'remorque')).toBe(true);
    expect(packageFitsVehicle('pl', 'remorque')).toBe(true);
    expect(packageFitsVehicle('vul', 'pl')).toBe(false);
    expect(packageFitsVehicle('pl', 'vul')).toBe(false);
  });

  it('position suivante par section ; devis accepté ou rattaché figé', () => {
    const lines = [line({ position: 4 }), line({ section: 'done', position: 9 })];
    expect(nextPosition(lines, 'planned')).toBe(5);
    expect(nextPosition([], 'planned')).toBe(0);
    expect(isQuoteLocked({ status: 'accepted', merged_into_repair_order_id: null })).toBe(true);
    expect(isQuoteLocked({ status: 'sent', merged_into_repair_order_id: 'ro' })).toBe(true);
    expect(isQuoteLocked({ status: 'refused', merged_into_repair_order_id: null })).toBe(false);
  });
});

describe('document PDF', () => {
  it('travaux déjà effectués : seulement ceux qui ont un prix, comme l’ancienne appli', () => {
    const lines = [
      line({ id: 'd1', section: 'done', unit_price: 180 }),
      line({ id: 'd2', section: 'done', unit_price: 0 }),
      line({ id: 'd3', section: 'done', line_type: 'text', unit_price: null }),
      line({ id: 'p1' }),
      line({ id: 'p2', line_type: 'text', unit_price: null }),
    ];
    expect(pricedDoneLines(lines).map((l) => l.id)).toEqual(['d1']);
    expect(printedSections(lines).planned.map((l) => l.id)).toEqual(['p1', 'p2']);
  });

  it('en-tête : coordonnées reprises des réglages, espaces insécables remplacés', () => {
    const company = {
      legal_name: 'RAPID TRUCK SERVICE',
      address_line: '19 rue Gaston Monmousseau',
      postal_code: '95190',
      city: 'Goussainville',
      email: 'atelier@rapidtruckservice.fr',
      legal_form: 'SASU',
      share_capital: '181 726 €',
      siren: '984 989 137',
      siret: '984 989 137 00018',
      vat_number: 'FR66984989137',
      rcs: 'RCS Pontoise',
    } as CompanySettings;
    expect(companyLines(company)).toEqual([
      'RAPID TRUCK SERVICE',
      '19 rue Gaston Monmousseau, 95190 Goussainville · atelier@rapidtruckservice.fr',
      'SASU au capital de 181 726 € · SIREN 984 989 137 · SIRET 984 989 137 00018',
      'TVA intracommunautaire : FR66984989137 · RCS Pontoise',
    ]);
    expect(companyLines({ ...company, email: null, vat_number: null, rcs: null })[1]).toBe(
      '19 rue Gaston Monmousseau, 95190 Goussainville',
    );
  });
});
