import { useState } from 'react';
import type { PdfFile } from '@/components/PdfPreviewDialog';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { assignQuoteNumber, fetchQuote } from './api';
import { useQuoteMutation } from './hooks';
import { buildQuotePdf } from './quote-pdf';

/**
 * Génère le PDF du devis : le numéro (et la date de validité) sont attribués à la
 * première génération, puis le document est construit avec les données à jour.
 */
export function useQuotePdf(quoteId: string) {
  const [file, setFile] = useState<PdfFile | null>(null);
  const generate = useQuoteMutation(async () => {
    await assignQuoteNumber(quoteId, false);
    const [detail, { settings, logo }] = await Promise.all([fetchQuote(quoteId), loadPdfContext()]);
    if (!detail) throw new Error('Devis introuvable');
    const { doc, fileName } = await buildQuotePdf({
      quote: detail.quote,
      lines: detail.lines,
      client: detail.clientBilling,
      company: settings.company,
      logo,
    });
    setFile({ blob: doc.output('blob'), fileName });
  }, null);

  return { generate, file, close: () => setFile(null) };
}
