import { describe, expect, it } from 'vitest';
import { docQuantity } from '@/lib/pdf-document';
import type { InvoiceLine } from './api';
import { invoiceDocumentLines } from './invoice-pdf';

const line = (patch: Partial<InvoiceLine>) =>
  ({
    line_type: 'labor',
    description: 'Remplacement embrayage',
    unit_price: 90,
    quantity: 6,
    discount_percent: 0,
    vat_rate: 20,
    ...patch,
  }) as InvoiceLine;

/** Quantité imprimée, comme dans le tableau des lignes. */
const printed = (printedLine: ReturnType<typeof invoiceDocumentLines>[number]) =>
  docQuantity(printedLine.quantity, printedLine.line_type === 'labor' && !printedLine.plainQuantity);

describe('lignes imprimées de la facture', () => {
  it('pro forma : quantité de main d’œuvre sans « h », prix et total inchangés', () => {
    const [labor] = invoiceDocumentLines([line({})], true);
    expect(labor).toMatchObject({ quantity: 6, unit_price: 90, net: 540 });
    expect(printed(labor!)).toBe('6');
  });

  it('facture émise : « 6 h » gardé', () => {
    const [labor] = invoiceDocumentLines([line({})], false);
    expect(printed(labor!)).toBe('6 h');
  });
});
