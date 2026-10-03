import type { PdfFile } from '@/components/PdfPreviewDialog';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { fetchQuote } from './api';

/** PDF du devis envoyé, joint à l'e-mail envoyé par l'appli. */
export async function quotePdfFile(quoteId: string): Promise<PdfFile> {
  const [detail, { settings, logo }, { buildQuotePdf }] = await Promise.all([
    fetchQuote(quoteId),
    loadPdfContext(),
    import('./quote-pdf'),
  ]);
  if (!detail) throw new Error('Devis introuvable');
  const { doc, fileName } = await buildQuotePdf({
    quote: detail.quote,
    lines: detail.lines,
    company: settings.company,
    logo,
  });
  return { blob: doc.output('blob'), fileName };
}
