// Reprise des forfaits de l'ancienne appli : sauvegarde JSON -> script SQL à passer en recette.
//
//   node scripts/import-forfaits.mjs sauvegarde_rts_atelier_AAAA-MM-JJ.json [forfaits-legacy.sql]
//
// La sauvegarde est celle de l'ancienne appli (bouton « Sauvegarde », faite par la direction).
// Le script SQL produit se passe dans l'éditeur SQL du projet Supabase (ou psql) ; il est rejouable
// sans doublon. Rien n'est envoyé nulle part : ce script lit un fichier et en écrit un autre.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { convertPackage, legacyPackages, packagesSql } from './legacy-packages.mjs';

const [input, output = 'forfaits-legacy.sql'] = process.argv.slice(2);
if (!input) {
  console.error('Usage : node scripts/import-forfaits.mjs <sauvegarde.json> [sortie.sql]');
  process.exit(1);
}

const backup = JSON.parse(readFileSync(input, 'utf8'));
const rows = [];
const problems = [];
for (const legacy of legacyPackages(backup)) {
  const { row, warnings, error } = convertPackage(legacy);
  problems.push(...warnings);
  if (error) problems.push(`Ignoré : ${error}`);
  if (row) rows.push(row);
}

writeFileSync(output, packagesSql(rows, { source: basename(input), exportedAt: backup.exported_at }));
console.log(`${rows.length} forfait(s) prêt(s) dans ${output}`);
for (const problem of problems) console.log(`  ⚠ ${problem}`);
