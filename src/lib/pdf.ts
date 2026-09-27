import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { CompanySettings } from '@/features/settings/api';

/**
 * Documents PDF (devis, factures) : même mise en page que l'ancienne appli
 * (jsPDF + autoTable, A4, marges 14 mm, en-tête société).
 * Les bibliothèques ne sont chargées qu'à la première génération.
 */
export const PAGE_W = 210;
export const MARGIN = 14;
export const GREEN: [number, number, number] = [19, 104, 23];
export const TITLE_GREEN: [number, number, number] = [19, 112, 23];

export interface PdfKit {
  doc: jsPDF;
  table: (options: UserOptions) => number;
}

export async function createPdf(): Promise<PdfKit> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF();
  return {
    doc,
    /** Dessine un tableau et renvoie l'ordonnée sous le tableau. */
    table: (options) => {
      autoTable(doc, options);
      return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    },
  };
}

/** Espaces insécables (saisies copiées, formats français) → espaces simples, lisibles par la police du PDF. */
export const pdfText = (value: string) => value.replace(/\s/g, ' ');

/** Montant tel qu'imprimé sur les documents (« 138.00 € », police standard du PDF). */
export const pdfMoney = (value: number) => `${value.toFixed(2)} €`;

export const pdfDate = (date: Date) =>
  date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Lignes de coordonnées sous le logo, reprises des réglages de l'entreprise. */
export function companyLines(company: CompanySettings): string[] {
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' — ');
  const legal = [
    company.legal_form && company.share_capital
      ? `${company.legal_form} au capital de ${company.share_capital}`
      : company.legal_form,
    company.siren && `SIREN ${company.siren}`,
    company.siret && `SIRET ${company.siret}`,
  ];
  return [
    company.legal_name,
    join(`${company.address_line}, ${company.postal_code} ${company.city}`, company.email),
    join(...legal),
    join(company.vat_number && `TVA intracommunautaire : ${company.vat_number}`, company.rcs),
  ]
    .filter((line) => line !== '')
    .map(pdfText);
}

/** En-tête : logo, coordonnées, titre du document à droite, filet. */
export function drawLetterhead(doc: jsPDF, company: CompanySettings, logo: string | null, title: string) {
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', MARGIN, 10, 20, 20);
    } catch {
      // Logo illisible : le document reste utilisable sans.
    }
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  companyLines(company).forEach((line, index) => doc.text(line, MARGIN + 24, 13 + index * 4));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, PAGE_W - MARGIN, 32, { align: 'right' });
  doc.setDrawColor(20, 20, 20);
  doc.line(MARGIN, 37, PAGE_W - MARGIN, 37);
  doc.setTextColor(0, 0, 0);
}

/** Image → data URL (le PDF embarque le logo). null si l'image est inaccessible. */
export async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Nom de fichier sans caractères spéciaux (« Devis_DV00001_GH-512-RT.pdf »). */
export const pdfFileName = (...parts: (string | null | undefined)[]) =>
  `${parts
    .filter(Boolean)
    .map((part) => part!.replace(/[^A-Za-z0-9-]/g, '_'))
    .join('_')}.pdf`;
