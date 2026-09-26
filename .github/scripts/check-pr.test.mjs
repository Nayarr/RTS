import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkTitle, checkBody } from './check-pr.mjs';

const template = readFileSync(new URL('../pull_request_template.md', import.meta.url), 'utf8');

const validBody = `## Contexte

Les techniciens doivent pouvoir signer.

## Changements

- Ajout de la signature

## Tests

- Tests pgTAP ajoutés

## Checklist

- [x] La CI passe
- [X] Pas de secret
`;

test('titres conformes', () => {
  for (const title of ['feat(devis): signature en ligne', 'fix: arrondi TVA', 'ci(database): tests pgTAP', 'feat!: refonte auth']) {
    assert.deepEqual(checkTitle(title), [], title);
  }
});

test('titres refusés', () => {
  for (const title of ['Signature en ligne', 'feature: x', 'feat(Devis): majuscule', 'feat: ', 'fix:sans espace', '']) {
    assert.equal(checkTitle(title).length, 1, title);
  }
});

test('description complète acceptée', () => {
  assert.deepEqual(checkBody(validBody), []);
});

test('le modèle non rempli est refusé', () => {
  const errors = checkBody(template);
  assert.ok(errors.includes('Section vide : « ## Contexte ».'));
  assert.ok(errors.includes('Section vide : « ## Changements ».'));
  assert.ok(errors.includes('Section vide : « ## Tests ».'));
  assert.ok(errors.some((e) => e.startsWith('Case non cochée')));
});

test('section manquante', () => {
  const body = validBody.replace(/## Tests[\s\S]*?(?=## Checklist)/, '');
  assert.deepEqual(checkBody(body), ['Section manquante : « ## Tests ».']);
});

test('un commentaire HTML seul ne remplit pas une section', () => {
  const body = validBody.replace('Les techniciens doivent pouvoir signer.', '<!-- à compléter -->');
  assert.deepEqual(checkBody(body), ['Section vide : « ## Contexte ».']);
});

test('case non cochée signalée', () => {
  const body = validBody.replace('- [x] La CI passe', '- [ ] La CI passe');
  assert.deepEqual(checkBody(body), ['Case non cochée : La CI passe']);
});

test('description vide', () => {
  assert.equal(checkBody(null).length, 4);
});
