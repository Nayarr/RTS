import { useState } from 'react';
import type { PdfFile } from '@/components/PdfPreviewDialog';
import { fetchFileUrls } from '@/features/files/api';
import { fetchSettings, type CompanySettings } from '@/features/settings/api';
import { imageToDataUrl } from '@/lib/pdf';
import { assignQuoteNumber, fetchQuote } from './api';
import { useQuoteMutation } from './hooks';
import { buildQuotePdf } from './quote-pdf';

/** Logo des réglages (stocké dans R2), sinon l'icône de l'appli. */
async function companyLogo(company: CompanySettings): Promise<string | null> {
  if (company.logo_file_id) {
    const noUrls: Record<string, string> = {};
    const urls = await fetchFileUrls([company.logo_file_id]).catch(() => noUrls);
    const url = urls[company.logo_file_id];
    const logo = url ? await imageToDataUrl(url) : null;
    if (logo) return logo;
  }
  return imageToDataUrl('/icons/icon-192.png');
}

/**
 * Génère le PDF du devis : le numéro (et la date de validité) sont attribués à la
 * première génération, puis le document est construit avec les données à jour.
 */
export function useQuotePdf(quoteId: string) {
  const [file, setFile] = useState<PdfFile | null>(null);
  const generate = useQuoteMutation(async () => {
    await assignQuoteNumber(quoteId, false);
    const [detail, settings] = await Promise.all([fetchQuote(quoteId), fetchSettings()]);
    if (!detail) throw new Error('Devis introuvable');
    const { doc, fileName } = await buildQuotePdf({
      quote: detail.quote,
      lines: detail.lines,
      company: settings.company,
      logo: await companyLogo(settings.company),
    });
    setFile({ blob: doc.output('blob'), fileName });
  }, null);

  return { generate, file, close: () => setFile(null) };
}
