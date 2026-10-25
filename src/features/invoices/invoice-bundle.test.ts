import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { mergePdfs, zipFiles } from './invoice-bundle';

const pdf = (pages: number) => {
  const doc = new jsPDF();
  for (let page = 1; page < pages; page += 1) doc.addPage();
  return new Uint8Array(doc.output('arraybuffer'));
};

const bytes = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.readAsArrayBuffer(blob);
  });

describe('lot de factures', () => {
  it('un seul PDF : toutes les pages des documents à la suite', async () => {
    const merged = await mergePdfs([pdf(1), pdf(2), pdf(1)]);
    expect(merged.type).toBe('application/pdf');
    expect((await PDFDocument.load(await bytes(merged))).getPageCount()).toBe(4);
  });

  it('ZIP : un fichier par facture, noms en double numérotés', async () => {
    const zip = await zipFiles([
      { fileName: 'Extrait_CBTP.pdf', bytes: pdf(1) },
      { fileName: 'Facture_11187_ET-184-VT.pdf', bytes: pdf(1) },
      { fileName: 'Facture_11187_ET-184-VT.pdf', bytes: pdf(1) },
    ]);
    expect(Object.keys(unzipSync(await bytes(zip)))).toEqual([
      'Extrait_CBTP.pdf',
      'Facture_11187_ET-184-VT.pdf',
      'Facture_11187_ET-184-VT_2.pdf',
    ]);
  });
});
