import { describe, expect, it } from 'vitest';
import { docQuantity } from '@/lib/pdf-document';
import type { CompanySettings } from '@/features/settings/api';
import type { InvoiceLine, InvoiceOverview } from './api';
import { buildInvoicePdf, invoiceDocumentLines } from './invoice-pdf';

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

describe('conditions générales', () => {
  const invoice = {
    number: 'F1',
    created_at: '2026-11-03T10:00:00Z',
    issued_at: '2026-11-03T10:00:00Z',
    due_date: '2026-11-03',
    service_date: '2026-11-03',
    client_name: 'Client',
    client_address: '1 rue du Test',
    vehicle_label: 'AA-123-BB',
    repair_order_numbers: [],
    total_ht: 540,
    total_vat: 108,
    total_ttc: 648,
  } as unknown as InvoiceOverview;
  const company = (invoice_terms: string) =>
    ({
      legal_name: 'RTS',
      address_line: '19 rue Gaston Monmousseau',
      postal_code: '95190',
      city: 'Goussainville',
      default_vat_rate: 20,
      payment_terms_days: 30,
      invoice_legal_mentions: [],
      invoice_terms,
    }) as unknown as CompanySettings;

  it.each([
    ['facture émise', undefined],
    [
      'pro forma',
      { client: { name: 'C', billing_address: null, siret: null, email: null }, paymentTermsDays: 30 },
    ],
  ])('%s : une page de conditions à la fin', async (_label, proforma) => {
    const pages = async (terms: string) =>
      (
        await buildInvoicePdf({
          invoice,
          lines: [line({})],
          company: company(terms),
          logo: null,
          ...(proforma ? { proforma } : {}),
        })
      ).doc.getNumberOfPages();
    expect(await pages('1. OBJET\nConditions.')).toBe((await pages('')) + 1);
  });
});
