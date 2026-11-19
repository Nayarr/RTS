import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { strToU8, zipSync } from 'fflate';
import { contentBlock, extractText, readableKind } from './attachments.ts';
import {
  clip,
  columnIndex,
  decodeXml,
  docxText,
  MAX_SHEET_ROWS,
  MAX_TEXT_CHARS,
  plainText,
  xlsxText,
} from './office.ts';

/** Fichier Office minimal : une archive zip avec les parties XML données. */
const office = (parts: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)])));

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const docx = (body: string) =>
  office({
    'word/document.xml': `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
  });
const p = (...runs: string[]) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${runs.join('')}</w:p>`;
const r = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;

Deno.test('Word : paragraphes dans l’ordre, tabulations, caractères échappés, tableau ligne par ligne', () => {
  const bytes = docx(
    p(r('Devis n° D-114')) +
      p(r('Transports Moreau &amp; Fils'), '<w:r><w:tab/></w:r>', r('AB-123-CD')) +
      '<w:tbl><w:tr><w:tc>' + p(r('Désignation')) + '</w:tc><w:tc>' + p(r('Prix HT')) + '</w:tc></w:tr>' +
      '<w:tr><w:tc>' + p(r('Kit '), r('embrayage')) + '</w:tc><w:tc>' + p(r('1 250,00 €')) +
      '</w:tc></w:tr></w:tbl>' +
      p(r('Valable 30 jours'), '<w:r><w:br/></w:r>', r('Signature')),
  );
  assertEquals(
    docxText(bytes),
    'Devis n° D-114\nTransports Moreau & Fils\tAB-123-CD\nDésignation | Prix HT\nKit embrayage | 1 250,00 €\n' +
      'Valable 30 jours\nSignature',
  );
});

Deno.test('Word : fichier illisible, vide ou sans document, rien de lu', () => {
  assertEquals(docxText(new TextEncoder().encode('pas une archive')), null);
  assertEquals(docxText(docx(p())), null);
  assertEquals(docxText(office({ 'autre.xml': '<x/>' })), null);
});

const sheet = (rows: string) =>
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

Deno.test('Excel : feuilles nommées, textes partagés et en ligne, nombres, booléens, colonnes vides gardées', () => {
  const bytes = office({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Tarifs &amp; remises" sheetId="1" r:id="rId1"/>' +
      '<sheet name="Clients" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/sharedStrings.xml':
      '<sst><si><t>Réf</t></si><si><t>Prix</t></si><si><r><t>Filtre </t></r><r><t>à huile</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42.5</v></c></row>' +
        '<row r="3"><c r="C3" t="inlineStr"><is><t>note &lt;isolée&gt;</t></is></c></row>' +
        '<row r="4"><c r="A4"/></row>',
    ),
    'xl/worksheets/sheet2.xml': sheet(
      '<row r="1"><c r="A1" t="str"><v>Moreau</v></c><c r="B1" t="b"><v>1</v></c></row>',
    ),
  });
  assertEquals(
    xlsxText(bytes),
    'Feuille « Tarifs & remises »\nRéf | Prix\nFiltre à huile | 42.5\n |  | note <isolée>\n\n' +
      'Feuille « Clients »\nMoreau | VRAI',
  );
});

Deno.test('Excel : 500 lignes par feuille au plus, feuilles dans l’ordre même au-delà de 9', () => {
  const rows = Array.from(
    { length: MAX_SHEET_ROWS + 20 },
    (_, index) => `<row r="${index + 1}"><c r="A${index + 1}"><v>${index + 1}</v></c></row>`,
  ).join('');
  const text = xlsxText(office({ 'xl/worksheets/sheet1.xml': sheet(rows) })) ?? '';
  assertStringIncludes(text, `\n${MAX_SHEET_ROWS}\n[… lignes suivantes non lues]`);
  assert(!text.includes(`\n${MAX_SHEET_ROWS + 1}\n`));

  const ordered = xlsxText(
    office({
      'xl/worksheets/sheet10.xml': sheet('<row><c r="A1" t="inlineStr"><is><t>dixième</t></is></c></row>'),
      'xl/worksheets/sheet2.xml': sheet('<row><c r="A1" t="inlineStr"><is><t>deuxième</t></is></c></row>'),
    }),
  ) ?? '';
  assert(ordered.indexOf('deuxième') < ordered.indexOf('dixième'));
});

Deno.test('Excel : fichier illisible ou vide, rien de lu', () => {
  assertEquals(xlsxText(new Uint8Array([1, 2, 3])), null);
  assertEquals(xlsxText(office({ 'xl/worksheets/sheet1.xml': sheet('') })), null);
});

Deno.test('CSV : UTF-8, ou Windows-1252 d’un vieux logiciel, sans marque BOM ni retours Windows', () => {
  assertEquals(
    plainText(new TextEncoder().encode('﻿Plaque;Échéance\r\nAB-123-CD;2027-10-27\r\n')),
    'Plaque;Échéance\nAB-123-CD;2027-10-27',
  );
  // « Échéance » en Windows-1252 : É = 0xC9, é = 0xE9
  const latin = new Uint8Array([0xc9, 0x63, 0x68, 0xe9, 0x61, 0x6e, 0x63, 0x65]);
  assertEquals(plainText(latin), 'Échéance');
  assertEquals(plainText(new TextEncoder().encode('  \n ')), null);
});

Deno.test('texte coupé à 30 000 caractères, avec une marque de coupure', () => {
  const long = 'a'.repeat(MAX_TEXT_CHARS + 50);
  const text = clip(long);
  assertEquals(text.length, MAX_TEXT_CHARS + '\n[… suite du fichier non lue]'.length);
  assert(text.endsWith('[… suite du fichier non lue]'));
  assertEquals(clip('court'), 'court');
});

Deno.test('caractères XML et numéros de colonne', () => {
  assertEquals(
    decodeXml('&lt;PL&gt; &amp; &quot;VL&quot; &#233;t&#xE9; &apos;x&apos; &inconnu;'),
    '<PL> & "VL" été \'x\' &inconnu;',
  );
  assertEquals([columnIndex('A1'), columnIndex('B12'), columnIndex('Z3'), columnIndex('AA4')], [
    0,
    1,
    25,
    26,
  ]);
});

Deno.test('Word, Excel, CSV et .txt lus d’après le type ou l’extension, pas une page HTML en texte', () => {
  const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  assertEquals(readableKind({ filename: 'devis.docx', content_type: docxType }), { kind: 'docx' });
  assertEquals(readableKind({ filename: 'DEVIS.DOCX', content_type: 'application/octet-stream' }), {
    kind: 'docx',
  });
  assertEquals(readableKind({ filename: 'tarifs.xlsx', content_type: xlsxType }), { kind: 'xlsx' });
  assertEquals(readableKind({ filename: 'tarifs.xlsx', content_type: null }), { kind: 'xlsx' });
  assertEquals(readableKind({ filename: 'export.csv', content_type: 'text/csv' }), { kind: 'text' });
  assertEquals(readableKind({ filename: 'export.csv', content_type: 'application/vnd.ms-excel' }), {
    kind: 'text',
  });
  assertEquals(readableKind({ filename: 'notes.txt', content_type: 'text/plain' }), { kind: 'text' });
  assertEquals(readableKind({ filename: 'page.html', content_type: 'text/plain' }), null);
  assertEquals(readableKind({ filename: 'devis.doc', content_type: 'application/msword' }), null);
});

Deno.test('texte extrait joint au tri comme document texte, avec le nom du fichier', () => {
  const bytes = docx(p(r('Facture 88')));
  const text = extractText('docx', bytes);
  assertEquals(text, 'Facture 88');
  const block = contentBlock({ filename: 'facture.docx', bytes, kind: { kind: 'docx' }, text: text ?? '' });
  assertEquals(block, {
    type: 'document',
    source: { type: 'text', media_type: 'text/plain', data: 'Facture 88' },
    title: 'facture.docx',
  });
  assertEquals(extractText('xlsx', new Uint8Array([0])), null);
  assertEquals(extractText('text', new TextEncoder().encode('a;b')), 'a;b');
});
