// Vérifie le titre et la description d'une pull request.
//
// Titre : Conventional Commits, ex. « feat(devis): signature en ligne ».
// Description : sections du modèle .github/pull_request_template.md, remplies,
// et toutes les cases de la checklist cochées.
//
// Utilisé par la CI (.github/workflows/pr-conventions.yml) :
//   node .github/scripts/check-pr.mjs            -> lit l'événement GitHub (GITHUB_EVENT_PATH)
// Tests : node --test ".github/scripts/*.test.mjs"

import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TITLE_PATTERN =
  /^(feat|fix|chore|ci|docs|refactor|test|perf|build|style|revert)(\([a-z0-9-]+\))?!?: \S.{2,}$/;

export const REQUIRED_SECTIONS = ['Contexte', 'Changements', 'Tests', 'Checklist'];

const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '');

/** Découpe la description en sections de niveau 2 (« ## Titre »). */
export function parseSections(body) {
  const sections = new Map();
  let current = null;
  for (const line of stripComments(body ?? '').split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1];
      sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return sections;
}

/** Une section est vide si elle ne contient que des blancs ou des puces vides. */
const isBlank = (lines) => lines.every((line) => /^\s*(-\s*)?$/.test(line));

export function checkTitle(title) {
  if (!TITLE_PATTERN.test((title ?? '').trim())) {
    return [
      `Titre invalide : « ${title ?? ''} ». Format attendu : type(portée optionnelle): description ` +
        '— types : feat, fix, chore, ci, docs, refactor, test, perf, build, style, revert. ' +
        'Exemple : « feat(devis): signature en ligne ».',
    ];
  }
  return [];
}

export function checkBody(body) {
  const errors = [];
  const sections = parseSections(body);

  for (const name of REQUIRED_SECTIONS) {
    if (!sections.has(name)) {
      errors.push(`Section manquante : « ## ${name} ».`);
    } else if (name !== 'Checklist' && isBlank(sections.get(name))) {
      errors.push(`Section vide : « ## ${name} ».`);
    }
  }

  const checklist = sections.get('Checklist');
  if (checklist) {
    const boxes = checklist.filter((line) => /^\s*-\s*\[[ xX]\]/.test(line));
    const unchecked = boxes.filter((line) => /^\s*-\s*\[ \]/.test(line));
    if (boxes.length === 0) {
      errors.push('La checklist ne contient aucune case.');
    }
    for (const line of unchecked) {
      errors.push(`Case non cochée : ${line.replace(/^\s*-\s*\[ \]\s*/, '')}`);
    }
  }
  return errors;
}

export function checkPullRequest({ title, body }) {
  return [...checkTitle(title), ...checkBody(body)];
}

// ---------------------------------------------------------------------------
// Exécution en CI
// ---------------------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  if (!pr) {
    console.log('Pas une pull request : vérification ignorée.');
    process.exit(0);
  }

  const errors = checkPullRequest({ title: pr.title, body: pr.body });
  const summary = errors.length
    ? `## ❌ Conventions de PR non respectées\n\n${errors.map((e) => `- ${e}`).join('\n')}\n\n` +
      'Modèle : `.github/pull_request_template.md`. Corrige le titre ou la description : la vérification se relance automatiquement.\n'
    : '## ✅ Titre et description de PR conformes\n';

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  for (const error of errors) {
    console.log(`::error title=Convention de PR::${error}`);
  }
  console.log(summary);
  process.exit(errors.length ? 1 : 0);
}
