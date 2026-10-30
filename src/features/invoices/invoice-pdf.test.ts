import { describe, expect, it } from 'vitest';
import type { InvoiceLine } from './api';
import { invoiceDocumentLines } from './invoice-pdf';

const line = (patch: Partial<InvoiceLine>) =>
  ({
    line_type: 'labor',
    description: 'Remplacement embrayage',
    unit_price: 90,
    quantity: 2.5,
    discount_percent: 0,
    vat_rate: 20,
    ...patch,
  }) as InvoiceLine;

describe('lignes imprimées de la facture', () => {
  it('pro forma : main d’œuvre au forfait, sans le nombre d’heures', () => {
    const [labor, part] = invoiceDocumentLines(
      [
        line({ discount_percent: 10 }),
        line({ line_type: 'part', description: 'Disque', unit_price: 40, quantity: 2 }),
      ],
      true,
    );
    expect(labor).toMatchObject({
      quantity: 1,
      unit_price: 225,
      lumpSum: true,
      discount_percent: 10,
      net: 202.5,
    });
    expect(part).toMatchObject({ quantity: 2, unit_price: 40, net: 80 });
    expect(part).not.toHaveProperty('lumpSum');
  });

  it('facture émise : heures et taux horaire gardés', () => {
    expect(invoiceDocumentLines([line({})], false)[0]).toMatchObject({
      quantity: 2.5,
      unit_price: 90,
      net: 225,
    });
  });
});
