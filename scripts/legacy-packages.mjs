// Forfaits de l'ancienne appli (sauvegarde JSON, config.forfaits.list) -> table service_packages.
// Fonctions pures, testées par scripts/legacy-packages.test.mjs ; utilisées par import-forfaits.mjs.

/** Cases d'usure de la fiche de contrôle (même liste que public.inspection_wear_fields()). */
export const WEAR_FIELDS = [
  'plaquettes_avant',
  'plaquettes_arriere',
  'disques_avant',
  'disques_arriere',
  'barre_accouplement',
  'barre_direction',
  'kit_accessoires',
];

const CATEGORIES = ['pl', 'vul', 'remorque', 'tolerie'];

/** Temps barème « 3h », « 1h30 », « 1.5 », « 2,5 h », « 45min » -> heures (null si illisible). */
export function parseHours(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(',', '.')
    .replace(/\s+/g, '');
  if (!text) return null;
  const minutes = /^(\d+)min$/.exec(text);
  if (minutes) return Math.round((Number(minutes[1]) / 60) * 100) / 100;
  const match = /^(\d+(?:\.\d+)?)(?:h(\d{1,2})?)?\+?$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]) + (match[2] ? Number(match[2]) / 60 : 0);
  return Math.round(hours * 100) / 100;
}

/** Prix « 340 », « 340,50 € », « 1 200 » -> nombre (null si vide ou illisible). */
export function parsePrice(value) {
  const text = String(value ?? '')
    .replace(/[\s €]/g, '')
    .replace(',', '.');
  if (!text) return null;
  const price = Number(text);
  return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null;
}

/**
 * Un forfait de l'ancienne appli -> ligne de service_packages, ou un motif de rejet.
 * @returns {{ row?: object, warnings: string[], error?: string }}
 */
export function convertPackage(legacy) {
  const warnings = [];
  const name = String(legacy?.nom ?? '').trim();
  if (!legacy?.id || !name) return { warnings, error: 'forfait sans identifiant ou sans nom' };
  const hours = parseHours(legacy.temps);
  if (hours === null)
    return { warnings, error: `« ${name} » : temps barème illisible (${legacy.temps || 'vide'})` };

  const category = String(legacy.categorie ?? '').trim();
  if (category && category !== 'toutes' && !CATEGORIES.includes(category)) {
    warnings.push(`« ${name} » : catégorie inconnue (${category}), mis en « toutes catégories »`);
  }
  const price = parsePrice(legacy.prix);
  if (String(legacy.prix ?? '').trim() && price === null) {
    warnings.push(`« ${name} » : prix illisible (${legacy.prix}), laissé vide`);
  }
  const fields = Array.isArray(legacy.champs) ? legacy.champs : [];
  const unknown = fields.filter((field) => !WEAR_FIELDS.includes(field));
  if (unknown.length) warnings.push(`« ${name} » : cases inconnues ignorées (${unknown.join(', ')})`);

  return {
    warnings,
    row: {
      legacy_id: `forfait:${legacy.id}`,
      name,
      category: CATEGORIES.includes(category) ? category : null,
      standard_hours: hours,
      price,
      details: String(legacy.detail ?? '').trim() || null,
      keywords: String(legacy.motscles ?? '')
        .split(',')
        .map((group) => group.trim())
        .filter(Boolean),
      trigger_fields: [...new Set(fields.filter((field) => WEAR_FIELDS.includes(field)))],
    },
  };
}

/** Forfaits trouvés dans la sauvegarde de l'ancienne appli (config.forfaits.list). */
export function legacyPackages(backup) {
  const list = backup?.config?.forfaits?.list;
  if (!Array.isArray(list)) throw new Error('Sauvegarde sans forfaits (config.forfaits.list introuvable)');
  return list;
}

/** Chaîne SQL sûre (apostrophes doublées, retours à la ligne conservés). */
export function sqlText(value) {
  if (value === null || value === undefined) return 'null';
  const text = String(value).replace(/'/g, "''");
  return /[\n\r\\]/.test(text)
    ? `E'${text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '')}'`
    : `'${text}'`;
}

const sqlArray = (values) =>
  values.length ? `array[${values.map(sqlText).join(', ')}]::text[]` : `'{}'::text[]`;
const sqlNumber = (value) => (value === null ? 'null' : String(value));

/**
 * Script SQL rejouable : chaque forfait est repris par son identifiant de l'ancienne appli
 * (legacy_id). Un forfait déjà saisi à la main sous le même nom est rattaché au lieu d'être doublé ;
 * un forfait désactivé depuis par la direction le reste.
 */
export function packagesSql(rows, { source, exportedAt } = {}) {
  const lines = [
    '-- Forfaits repris de l’ancienne appli RTS Atelier.',
    `-- Source : ${source ?? 'sauvegarde JSON'}${exportedAt ? ` (exportée le ${exportedAt})` : ''} — ${rows.length} forfait(s).`,
    '-- Rejouable sans doublon : mise à jour par identifiant de l’ancienne appli (legacy_id).',
    'begin;',
    '',
  ];
  for (const row of rows) {
    lines.push(
      `-- ${row.name}`,
      `update public.service_packages set legacy_id = ${sqlText(row.legacy_id)}`,
      `where legacy_id is null and lower(btrim(name)) = lower(${sqlText(row.name)})`,
      `  and not exists (select 1 from public.service_packages where legacy_id = ${sqlText(row.legacy_id)});`,
      'insert into public.service_packages (legacy_id, name, category, standard_hours, price, details, keywords, trigger_fields)',
      `values (${sqlText(row.legacy_id)}, ${sqlText(row.name)}, ${row.category ? `${sqlText(row.category)}::public.labor_category` : 'null'}, ` +
        `${sqlNumber(row.standard_hours)}, ${sqlNumber(row.price)}, ${sqlText(row.details)}, ${sqlArray(row.keywords)}, ` +
        `${sqlArray(row.trigger_fields)})`,
      'on conflict (legacy_id) do update set name = excluded.name, category = excluded.category,',
      '  standard_hours = excluded.standard_hours, price = excluded.price, details = excluded.details,',
      '  keywords = excluded.keywords, trigger_fields = excluded.trigger_fields;',
      '',
    );
  }
  lines.push('commit;', '');
  return lines.join('\n');
}
