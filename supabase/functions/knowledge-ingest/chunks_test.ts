import { assert, assertEquals } from '@std/assert';
import { chunkPages, cleanText, splitPage } from './chunks.ts';

Deno.test('texte remis à plat : espaces et césures', () => {
  assertEquals(cleanText('Vérifier  le cap-\n teur de\npression'), 'Vérifier le capteur de pression');
});

Deno.test('page courte : un passage ; page vide : aucun', () => {
  assertEquals(splitPage('Purger le circuit de freinage.'), ['Purger le circuit de freinage.']);
  assertEquals(splitPage('   '), []);
});

Deno.test('page longue : passages coupés après une phrase, sans dépasser la taille', () => {
  const sentence = 'Contrôler la pression des pneus à froid avant chaque départ. ';
  const parts = splitPage(sentence.repeat(60), 400);
  assert(parts.length > 3);
  for (const part of parts) {
    assert(part.length <= 400, String(part.length));
    assert(part.endsWith('.'), part.slice(-20));
  }
});

Deno.test('document : numéro de page et ordre gardés', () => {
  const chunks = chunkPages(['Page un.', '', 'Page trois.']);
  assertEquals(chunks, [
    { page: 1, position: 0, content: 'Page un.' },
    { page: 3, position: 0, content: 'Page trois.' },
  ]);
});
