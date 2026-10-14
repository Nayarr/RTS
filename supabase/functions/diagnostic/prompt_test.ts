import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { BRAND_SHEETS, brandText, sheetsFor } from './brands.ts';
import { DIAGNOSTIC_SHEET, SHEET_TITLES } from './knowledge.ts';
import { diagnosticMessage, searchQuery, SYSTEM_PROMPT, SYSTEM_WITH_SHEET } from './prompt.ts';

Deno.test('consignes : sources citées, pas de valeur inventée, sans tiret cadratin', () => {
  assertStringIncludes(SYSTEM_PROMPT, 'cite les extraits par leur numéro');
  assertStringIncludes(SYSTEM_PROMPT, 'n’invente jamais une valeur constructeur');
  assert(!SYSTEM_PROMPT.includes(String.fromCharCode(0x2014)));
});

Deno.test('message : symptômes, historique et extraits numérotés', () => {
  const message = diagnosticMessage(
    'Voyant huile allumé au ralenti',
    { vehicule: { marque: 'Volvo', modele: 'FH 500' } },
    [{ title: 'Manuel FH', page: 12, content: 'Vérifier le capteur de pression.' }],
  );
  assertStringIncludes(message, 'Voyant huile allumé au ralenti');
  assertStringIncludes(message, '"marque":"Volvo"');
  assertStringIncludes(message, '[1] Manuel FH, page 12 :\nVérifier le capteur de pression.');
  assertStringIncludes(diagnosticMessage('x', {}, []), 'facultative');
});

Deno.test('recherche : symptômes, marque et modèle', () => {
  assertStringIncludes(
    searchQuery('Perte de puissance', { vehicule: { marque: 'Renault', modele: 'T 480' } }),
    'Perte de puissance Renault T 480',
  );
});

Deno.test('fiche de diagnostic : jointe aux consignes, tous les systèmes, sans tiret cadratin', () => {
  assertStringIncludes(SYSTEM_WITH_SHEET, DIAGNOSTIC_SHEET);
  for (
    const title of [
      'Freinage pneumatique et EBS',
      'Post-traitement (FAP, SCR et AdBlue, EGR)',
      'Hayon élévateur',
    ]
  ) {
    assert(SHEET_TITLES.includes(title), title);
  }
  assert(!DIAGNOSTIC_SHEET.includes(String.fromCharCode(0x2014)));
  assertStringIncludes(SYSTEM_PROMPT, '[Fiche]');
});

const keys = (vehicle: Parameters<typeof sheetsFor>[0], question = '') =>
  sheetsFor(vehicle, question).map((s) => s.key);

Deno.test('fiche marque : choisie d’après la marque, le modèle et le type du véhicule', () => {
  assertEquals(keys({ marque: 'VOLVO', modele: 'FH 500', type: 'pl' }), ['volvo']);
  assertEquals(keys({ marque: 'Renault Trucks', modele: 'T 480', type: 'pl' }), ['renault']);
  assertEquals(keys({ marque: 'Mercedes-Benz', modele: 'Actros 1845', type: 'pl' }), ['mercedes']);
  assertEquals(keys({ marque: 'Scania', modele: 'R 450', type: 'pl' }), ['scania']);
  assertEquals(keys({ marque: 'DAF', modele: 'XF 480', type: 'pl' }), ['daf']);
  assertEquals(keys({ marque: 'MAN', modele: 'TGX 18.510', type: 'pl' }), ['man']);
  assertEquals(keys({ marque: 'Iveco', modele: 'S-Way', type: 'pl' }), ['iveco']);
  // Utilitaire : fiche utilitaires seulement, même pour une marque de poids lourd
  assertEquals(keys({ marque: 'Renault', modele: 'Master', type: 'vul' }), ['vul']);
  assertEquals(keys({ marque: 'Mercedes', modele: 'Sprinter', type: 'pl' }), ['vul']);
  assertEquals(keys({ marque: 'Schmitz Cargobull', modele: 'S.KO', type: 'remorque' }), ['trailer']);
  assertEquals(keys({ marque: 'Volvo', modele: 'FL', type: 'pl' }, 'Le hayon ne monte plus'), [
    'volvo',
    'tailgate',
  ]);
  assertEquals(keys({ marque: null, modele: null, type: 'pl' }), []);
});

Deno.test('fiches marque : textes sans tiret cadratin, marque inconnue signalée', () => {
  for (const sheet of BRAND_SHEETS) {
    assert(sheet.lines.length >= 4, sheet.key);
    assert(!sheet.lines.join(' ').includes(String.fromCharCode(0x2014)), sheet.key);
  }
  assertStringIncludes(brandText([]), 'marque du véhicule non reconnue');
  assertStringIncludes(
    diagnosticMessage('x', {}, [], brandText(sheetsFor({ marque: 'DAF' }))),
    'Fiche marque DAF',
  );
});
