import type { PdfFile } from '@/components/PdfPreviewDialog';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { fetchInvoice } from './api';

/** PDF de la facture émise, joint à l'e-mail envoyé par l'appli. */
export async function invoicePdfFile(invoiceId: string): Promise<PdfFile> {
  const [detail, { settings, logo }, { buildInvoicePdf }] = await Promise.all([
    fetchInvoice(invoiceId),
    loadPdfContext(),
    import('./invoice-pdf'),
  ]);
  if (!detail) throw new Error('Facture introuvable');
  const { doc, fileName } = await buildInvoicePdf({
    invoice: detail.invoice,
    lines: detail.lines,
    company: settings.company,
    logo,
  });
  return { blob: doc.output('blob'), fileName };
}
