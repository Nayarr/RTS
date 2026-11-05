import { describe, expect, it } from 'vitest';
import type { InvoiceLine, InvoiceOverview } from '@/features/invoices/api';
import { buildInvoicePdf } from '@/features/invoices/invoice-pdf';
import type { CompanySettings } from '@/features/settings/api';
import type { QuoteLine, QuoteOverview } from './api';
import { buildQuotePdf } from './quote-pdf';

const MENTION = 'VALABLE SOUS RÉSERVE DE DÉMONTAGE';

const company = (quote_legal_mentions: string[]) =>
  ({
    legal_name: 'RTS',
    address_line: '19 rue Gaston Monmousseau',
    postal_code: '95190',
    city: 'Goussainville',
    default_vat_rate: 20,
    payment_terms_days: 30,
    quote_validity_days: 30,
    invoice_legal_mentions: [],
    quote_legal_mentions,
    invoice_terms: '',
  }) as unknown as CompanySettings;

/** Texte du PDF : jsPDF écrit les chaînes en clair, É compris (Latin-1). */
const printed = (doc: { output: (type: 'arraybuffer') => ArrayBuffer }) =>
  new TextDecoder('latin1').decode(doc.output('arraybuffer'));

const quotePdf = (mentions: string[]) =>
  buildQuotePdf({
    quote: { number: 'DV00001', client_name: 'Client', plate: 'AA-123-BB' } as unknown as QuoteOverview,
    lines: [
      {
        section: 'planned',
        line_type: 'labor',
        description: 'Embrayage',
        unit_price: 90,
        quantity: 1,
        discount_percent: 0,
        vat_rate: 20,
      } as QuoteLine,
    ],
    company: company(mentions),
    logo: null,
  });

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
  total_ht: 90,
  total_vat: 18,
  total_ttc: 108,
} as unknown as InvoiceOverview;
const invoiceLines = [
  {
    line_type: 'labor',
    description: 'Embrayage',
    unit_price: 90,
    quantity: 1,
    discount_percent: 0,
    vat_rate: 20,
  } as InvoiceLine,
];

describe('mention des devis', () => {
  it('imprimée sur le PDF du devis, accents compris', async () => {
    const { doc } = await quotePdf([MENTION]);
    expect(printed(doc)).toContain(`(${MENTION})`);
  });

  it('retirée des réglages : plus rien sur le PDF', async () => {
    const { doc } = await quotePdf([]);
    expect(printed(doc)).not.toContain('DÉMONTAGE');
  });

  it.each([
    ['facture émise', undefined],
    [
      'pro forma',
      { client: { name: 'C', billing_address: null, siret: null, email: null }, paymentTermsDays: 30 },
    ],
  ])('jamais sur une %s', async (_label, proforma) => {
    const { doc } = await buildInvoicePdf({
      invoice,
      lines: invoiceLines,
      company: company([MENTION]),
      logo: null,
      ...(proforma ? { proforma } : {}),
    });
    expect(printed(doc)).toContain('(Embrayage)');
    expect(printed(doc)).not.toContain('DÉMONTAGE');
  });
});
