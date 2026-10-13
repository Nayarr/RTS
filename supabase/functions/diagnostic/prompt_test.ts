import { assert, assertStringIncludes } from '@std/assert';
import { diagnosticMessage, searchQuery, SYSTEM_PROMPT } from './prompt.ts';

Deno.test('consignes : sources citées, pas de valeur inventée, sans tiret cadratin', () => {
  assertStringIncludes(SYSTEM_PROMPT, 'cite-les par leur numéro');
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
  assertStringIncludes(diagnosticMessage('x', {}, []), 'Aucun extrait');
});

Deno.test('recherche : symptômes, marque et modèle', () => {
  assertStringIncludes(
    searchQuery('Perte de puissance', { vehicule: { marque: 'Renault', modele: 'T 480' } }),
    'Perte de puissance Renault T 480',
  );
});
