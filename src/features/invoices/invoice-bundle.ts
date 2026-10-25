// Lot de factures : un PDF par facture émise (même rendu que la facture seule), réunis en un seul
// PDF ou dans un ZIP. Bibliothèques chargées à la première utilisation.
import { loadPdfContext } from '@/features/documents/pdf-context';
import type { InvoiceOverview } from './api';
import { buildInvoicePdf } from './invoice-pdf';
import { fetchInvoicesLines } from './statement-api';

export interface BundleFile {
  fileName: string;
  bytes: Uint8Array;
}

/** PDF de chaque facture, dans l'ordre donné. */
export async function buildInvoiceFiles(
  invoices: InvoiceOverview[],
  onProgress?: (done: number, total: number) => void,
): Promise<BundleFile[]> {
  const [{ settings, logo }, lines] = await Promise.all([
    loadPdfContext(),
    fetchInvoicesLines(invoices.map((invoice) => invoice.id)),
  ]);
  const files: BundleFile[] = [];
  for (const invoice of invoices) {
    const { doc, fileName } = await buildInvoicePdf({
      invoice,
      lines: lines.get(invoice.id) ?? [],
      company: settings.company,
      logo,
    });
    files.push({ fileName, bytes: new Uint8Array(doc.output('arraybuffer')) });
    onProgress?.(files.length, invoices.length);
  }
  return files;
}

/** Un seul PDF : les documents à la suite, pages gardées telles quelles. */
export async function mergePdfs(parts: Uint8Array[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const part of parts) {
    const source = await PDFDocument.load(part);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  const bytes = await merged.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** ZIP des fichiers (noms en double numérotés). */
export async function zipFiles(files: BundleFile[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    let name = file.fileName;
    for (let index = 2; name in entries; index += 1) name = file.fileName.replace(/\.pdf$/, `_${index}.pdf`);
    entries[name] = file.bytes;
  }
  const bytes = zipSync(entries, { level: 0 });
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}
