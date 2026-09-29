import type { CompanySettings } from '@/features/settings/api';
import { createPdf, drawLetterhead, MARGIN, PAGE_W, pdfText, TITLE_GREEN } from '@/lib/pdf';
import { TECHNICIAN_TOPICS } from './help-content';

/** Fiche mémo à afficher à l'atelier (mêmes sujets que l'aide des techniciens). */
export async function buildTechnicianMemoPdf(company: CompanySettings, logo: string | null) {
  const { doc } = await createPdf();
  drawLetterhead(doc, company, logo, 'MÉMO TECHNICIEN');
  const width = PAGE_W - 2 * MARGIN - 4;
  let y = 46;

  TECHNICIAN_TOPICS.forEach((topic, index) => {
    if (y > 265) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...TITLE_GREEN);
    doc.text(pdfText(`${index + 1}. ${topic.title}`), MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    for (const item of topic.items) {
      (doc.splitTextToSize(pdfText(`• ${item}`), width) as string[]).forEach((line, lineIndex) => {
        doc.text(line, MARGIN + (lineIndex ? 4 : 2), y);
        y += 4.6;
      });
      y += 0.8;
    }
    y += 3;
  });

  return { doc, fileName: 'Memo_technicien.pdf' };
}
