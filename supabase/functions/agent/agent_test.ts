import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert';
import { ACTION_TOOLS } from './actions.ts';
import { DISPLAY_DEFINITIONS } from './display.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  answerText,
  conversationTitle,
  dateLabel,
  EM_DASH,
  parisToday,
  questionText,
  SYSTEM_PROMPT,
  workshopContext,
} from './prompt.ts';
import {
  briefingReads,
  briefingRequest,
  briefingText,
  gatherBriefing,
  nextDay,
  parseBriefing,
} from './briefing.ts';
import { compact, docNumber, like, plateKey, runTool, TOOL_DEFINITIONS, TOOLS } from './tools.ts';

/** Faux client : enregistre les appels de fonctions de la base et renvoie une réponse fixe. */
function fakeDb(data: unknown = { ok: true }, error: { message: string } | null = null) {
  const calls: { name: string; args: unknown }[] = [];
  const db = {
    rpc: (name: string, args?: unknown) => {
      calls.push({ name, args });
      return Promise.resolve({ data, error });
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

Deno.test('consignes : stables (pas de date), sans tiret cadratin, lecture seule annoncée', () => {
  assert(!/\d{4}-\d{2}-\d{2}/.test(SYSTEM_PROMPT));
  assert(!SYSTEM_PROMPT.includes(EM_DASH));
  assertStringIncludes(SYSTEM_PROMPT, 'Tu ne modifies rien');
});

Deno.test('outils : noms uniques, schémas fermés, aucun outil d’écriture', () => {
  const names = TOOL_DEFINITIONS.map((tool) => tool.name);
  assertEquals(new Set(names).size, names.length);
  for (const tool of TOOL_DEFINITIONS) {
    assertEquals(tool.input_schema.additionalProperties, false, tool.name);
    assertMatch(tool.name, /^[a-z_]+$/);
    assert(tool.description.length > 20, tool.name);
  }
  assert(!names.some((name) => /envoy|cree|modif|suppr|valid/.test(name)));
});

Deno.test('compact : retire identifiants, couleurs et jetons, garde le reste', () => {
  assertEquals(
    compact({
      id: 'x',
      client_id: 'y',
      color: '#fff',
      public_token: 't',
      name: 'Alice',
      orders: [{ technician_id: 'z', hours: 6.5 }],
    }),
    { name: 'Alice', orders: [{ hours: 6.5 }] },
  );
});

Deno.test('runTool : appelle la bonne fonction de la base avec les bons paramètres', async () => {
  const { db, calls } = fakeDb({ revenue_ht: 1200, client_id: 'a' });
  const result = await runTool(db, 'chiffres_du_mois', { mois: '2026-09' });
  assertEquals(result, { content: '{"revenue_ht":1200}', is_error: false });
  assertEquals(calls, [{ name: 'monthly_report', args: { p_month: '2026-09-01' } }]);
});

Deno.test('runTool : paramètres invalides ou outil inconnu renvoyés à l’assistant comme erreur', async () => {
  const { db, calls } = fakeDb();
  assert((await runTool(db, 'chiffres_du_mois', { mois: 'septembre' })).is_error);
  assert((await runTool(db, 'charge_atelier', { du: '2026-10-01', au: '2026-09-01' })).is_error);
  assert((await runTool(db, 'charge_atelier', { du: '2026-01-01', au: '2026-12-31' })).is_error);
  assert((await runTool(db, 'supprimer_facture', {})).is_error);
  assertEquals(calls.length, 0);
});

Deno.test('runTool : refus de la base transmis sans planter', async () => {
  const { db } = fakeDb(null, { message: 'Accès refusé' });
  assertEquals(await runTool(db, 'tableau_de_bord', {}), {
    content: 'Lecture impossible : Accès refusé',
    is_error: true,
  });
});

Deno.test('rentabilité : les 25 plus gros clients, du plus gros au plus petit', async () => {
  const list = Array.from(
    { length: 30 },
    (_, index) => ({ client_id: `c${index}`, labor_ht: index, parts_ht: 0 }),
  );
  const { db } = fakeDb(list);
  const result = JSON.parse(
    (await runTool(db, 'rentabilite', { du: '2026-01-01', au: '2026-09-30' })).content,
  );
  assertEquals(result.length, 25);
  assertEquals(result[0], { labor_ht: 29, parts_ht: 0 });
});

/**
 * Fausse base qui enregistre chaque lecture (table ou fonction, colonnes, filtres) et refuse
 * toute écriture. Chaque requête renvoie une liste vide.
 */
function recordingDb() {
  const tables: string[] = [];
  const functions: string[] = [];
  const selects: string[] = [];
  const writes: string[] = [];
  const query = (): unknown =>
    new Proxy(
      {},
      {
        get(_, key: string) {
          if (key === 'then') {
            return (resolve: (value: unknown) => void) => resolve({ data: [], error: null, count: 0 });
          }
          if (['insert', 'update', 'upsert', 'delete'].includes(key)) {
            return () => {
              writes.push(key);
              throw new Error(`écriture interdite : ${key}`);
            };
          }
          return (...args: unknown[]) => {
            if (key === 'select') selects.push(String(args[0]));
            return query();
          };
        },
      },
    );
  const db = {
    from: (table: string) => {
      tables.push(table);
      return query();
    },
    rpc: (name: string) => {
      functions.push(name);
      return query();
    },
  } as unknown as SupabaseClient;
  return { db, tables, functions, selects, writes };
}

/** Paramètres valides pour faire tourner chaque outil. */
const SAMPLE_INPUTS: Record<string, unknown> = {
  chiffres_du_mois: { mois: '2026-09' },
  evolution_mensuelle: { nombre_de_mois: 6 },
  factures_impayees: { en_retard_seulement: true },
  factures: { du: '2026-09-01', au: '2026-09-30', client: 'Leroy', etat: 'impayees' },
  facture: { numero: 'F12361' },
  encaissements: { du: '2026-09-01', au: '2026-09-30' },
  avoirs: { du: '2026-01-01', au: '2026-09-30' },
  rentabilite: { du: '2026-01-01', au: '2026-09-30' },
  devis: { statut: 'sent', client: 'Leroy' },
  devis_detail: { numero: '6' },
  ordres_reparation: {
    statut: 'assigned',
    technicien: 'Karim',
    client: 'Leroy',
    plaque: 'EZ-093-WV',
    du: '2026-10-01',
    au: '2026-10-31',
    date_sur: 'planification',
  },
  ordre_reparation: { numero: '488' },
  charge_atelier: { du: '2026-10-05', au: '2026-10-09' },
  rendez_vous: { du: '2026-10-05', au: '2026-10-09' },
  pieces_a_commander: { etat: 'a_commander' },
  sous_traitance: { statut: 'sent' },
  garanties: { statut: 'en_cours' },
  vehicule: { plaque: 'EZ-093-WV' },
  client: { nom: 'Leroy' },
  echeances_vehicules: { dans_les_jours: 60, type: 'ct', depassees: false },
  clients_inactifs: { depuis_mois: 12 },
  recherche: { texte: 'Leroy' },
  pointages: { du: '2026-10-01', au: '2026-10-07', technicien: 'Bruno' },
  conges: { du: '2026-10-05', au: '2026-10-11' },
  performance_techniciens: { du: '2026-09-01', au: '2026-09-30' },
  stock_consommables: { seulement_bas: true },
  catalogue: { texte: 'plaquettes' },
  fournisseurs: { nom: 'Bosch' },
  locations: { etat: 'en_cours' },
  mails: { a_traiter: true, categorie: 'devis', urgence: 'urgente', texte: 'Moreau', depuis: '2026-10-01' },
  mail: { texte: 'Moreau' },
};

/** Tables, vues et fonctions que l'agent a le droit de lire. */
const ALLOWED_TABLES = new Set([
  'v_invoices_overview',
  'invoice_lines',
  'payments',
  'credit_notes',
  'v_quotes_overview',
  'quote_lines',
  'v_repair_orders_overview',
  'ro_lines',
  'ro_consumables',
  'subcontracts',
  'ro_events',
  'v_appointments_overview',
  'v_warranty_claims',
  'v_vehicles_overview',
  'v_contract_vehicle_status',
  'v_clients_overview',
  'vehicles',
  'v_vehicle_deadlines',
  'v_contracts_overview',
  'technicians',
  'v_daily_attendance',
  'leave_requests',
  'consumables',
  'parts',
  'service_packages',
  'suppliers',
  'v_rentals_overview',
  'fleet_vehicles',
  'company_settings',
  'labor_rates',
  'app_settings',
  'v_my_notifications',
  'inbox_emails',
]);
const ALLOWED_FUNCTIONS = new Set([
  'office_dashboard',
  'monthly_report',
  'monthly_statistics',
  'treasury_overview',
  'profitability_report',
  'workshop_board',
  'workshop_workload',
  'global_search',
  'technician_performance',
]);
/** Jamais lu par l'agent : secrets, liens publics, signatures, données d'identité. */
const FORBIDDEN = /token|pin|secret|password|signature|birth|license|kiosk|push_|portal|legacy|\*/i;

Deno.test('sécurité : chaque outil ne fait que lire, sur des tables autorisées, sans colonne sensible', async () => {
  for (const tool of TOOLS) {
    const { db, tables, functions, selects, writes } = recordingDb();
    const result = await runTool(db, tool.name, SAMPLE_INPUTS[tool.name] ?? {});
    assert(!result.is_error || !result.content.startsWith('Paramètres'), `${tool.name} : ${result.content}`);
    assertEquals(writes, [], `${tool.name} écrit`);
    for (const table of tables) assert(ALLOWED_TABLES.has(table), `${tool.name} lit ${table}`);
    for (const name of functions) assert(ALLOWED_FUNCTIONS.has(name), `${tool.name} appelle ${name}`);
    for (const columns of selects) assert(!FORBIDDEN.test(columns), `${tool.name} lit « ${columns} »`);
    assert(tables.length + functions.length > 0, `${tool.name} ne lit rien`);
  }
});

Deno.test('outils : tous testés et en nombre suffisant pour parcourir l’appli', () => {
  assert(TOOLS.length >= 35, `${TOOLS.length} outils`);
  const withoutInput = TOOLS.filter((tool) => Object.keys(tool.input_schema.properties ?? {}).length === 0);
  for (const tool of TOOLS) {
    assert(
      tool.name in SAMPLE_INPUTS || withoutInput.includes(tool),
      `pas de paramètres d’exemple pour ${tool.name}`,
    );
  }
});

Deno.test('numéros et plaques compris quelle que soit la forme dictée', () => {
  assertEquals(docNumber('OR', '488'), 'OR00488');
  assertEquals(docNumber('OR', 'or 488'), 'OR00488');
  assertEquals(docNumber('DV', 'DV00006'), 'DV00006');
  assertEquals(plateKey('ez-093 wv'), 'EZ093WV');
  assertEquals(like('Leroy, (frigo) 100%'), '%Leroy   frigo  100%');
});

Deno.test('fiche atelier : statuts des OR, confusions de dictée et noms d’outils connus', () => {
  assertStringIncludes(SYSTEM_PROMPT, 'Assigné (assigned');
  assertStringIncludes(SYSTEM_PROMPT, '« horaires »');
  assertStringIncludes(SYSTEM_PROMPT, 'hayon');
  const names = new Set([...TOOLS, ...ACTION_TOOLS, ...DISPLAY_DEFINITIONS].map((tool) => tool.name));
  for (const [, name] of SYSTEM_PROMPT.matchAll(/\b([a-z]+(?:_[a-z]+)+)\b/g)) {
    if (
      /_(?:id|at|ht|ttc)$|^(?:in_progress|work_done|quote_pending|to_invoice|to_order|paid_leave)$/.test(name)
    ) continue;
    assert(names.has(name), `outil cité dans la fiche mais absent : ${name}`);
  }
});

Deno.test('contexte : techniciens et mémo de la direction', () => {
  const context = workshopContext({ technicians: ['Alice', 'Karim'], memo: '  Karim est chef d’atelier.  ' });
  assertStringIncludes(context, 'Techniciens actifs : Alice, Karim.');
  assertStringIncludes(context, 'Karim est chef d’atelier.');
  assertStringIncludes(workshopContext({ technicians: [], memo: '' }), 'Pas de mémo');
});

Deno.test('question dictée : autres versions entendues ajoutées, sans doublon', () => {
  const text = questionText('Montre-moi les horaires qui sont signés', true, '2026-10-07', [
    'montre-moi les horaires qui sont signés',
    'montre-moi les OR qui sont assignés',
    ' ',
  ]);
  assertStringIncludes(
    text,
    'Autres versions entendues par la dictée : « montre-moi les OR qui sont assignés »',
  );
  assertEquals(text.match(/«/g)?.length, 1);
  assert(!questionText('CA ?', false, '2026-10-07').includes('Autres versions'));
});

Deno.test('date du jour à Paris et libellé en toutes lettres', () => {
  assertEquals(parisToday(new Date('2026-10-05T22:30:00Z')), '2026-10-06');
  assertEquals(dateLabel('2026-10-06'), 'mardi 6 octobre 2026 (2026-10-06)');
});

Deno.test('question : date et mode (voix ou écrit) ajoutés', () => {
  const text = questionText('  CA du mois ?  ', true, '2026-10-06');
  assertStringIncludes(text, 'mardi 6 octobre 2026');
  assertStringIncludes(text, 'à la voix');
  assert(text.endsWith('CA du mois ?'));
});

Deno.test('titre : début de la première question', () => {
  assertEquals(conversationTitle('  CA   du mois ? '), 'CA du mois ?');
  assertEquals(conversationTitle('a'.repeat(120)).length, 80);
});

Deno.test('réponse : texte assemblé, sans tiret cadratin', () => {
  assertEquals(
    answerText([
      { type: 'thinking' },
      { type: 'text', text: `Ce mois-ci ${EM_DASH} 12 450 euros.` },
      { type: 'tool_use' },
    ]),
    'Ce mois-ci, 12 450 euros.',
  );
});

Deno.test('point du jour : lectures valides, en lecture seule, sur des tables autorisées', async () => {
  const reads = briefingReads('2026-10-31');
  assertEquals(reads.find((item) => item.tool === 'rendez_vous')?.input, {
    du: '2026-10-31',
    au: '2026-11-01',
  });
  assertEquals(reads.find((item) => item.tool === 'chiffres_du_mois')?.input, { mois: '2026-10' });
  for (const item of reads) {
    const { db, tables, functions, writes } = recordingDb();
    const result = await runTool(db, item.tool, item.input);
    assert(!result.content.startsWith('Paramètres'), `${item.tool} : ${result.content}`);
    assertEquals(writes, [], `${item.tool} écrit`);
    for (const table of tables) assert(ALLOWED_TABLES.has(table), `${item.tool} lit ${table}`);
    for (const name of functions) assert(ALLOWED_FUNCTIONS.has(name), `${item.tool} appelle ${name}`);
  }
});

Deno.test('point du jour : lecture en échec laissée de côté, longue lecture coupée', async () => {
  const db = {
    rpc: (name: string) =>
      Promise.resolve(
        name === 'workshop_board'
          ? { data: null, error: { message: 'refusé' } }
          : { data: [{ texte: 'x'.repeat(name === 'office_dashboard' ? 9_000 : 10) }], error: null },
      ),
    from: () => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'neq', 'in', 'lt', 'lte', 'gt', 'gte', 'order', 'limit', 'is']) {
        query[method] = () => query;
      }
      query.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
      return query;
    },
  } as unknown as SupabaseClient;
  const sections = await gatherBriefing(db, '2026-10-09');
  assert(!sections.some((section) => section.tool === 'atelier_aujourdhui'));
  const dashboard = sections.find((section) => section.tool === 'tableau_de_bord');
  assert(dashboard?.content.endsWith('(liste coupée)'));
  assert((dashboard?.content.length ?? 0) < 8_100);
});

Deno.test('point du jour : demande datée, lectures nommées, sans tiret cadratin', () => {
  const request = briefingRequest('2026-10-09', [
    { tool: 'factures_impayees', label: 'Factures en retard de paiement', content: '[]' },
  ]);
  assertStringIncludes(request, 'vendredi 9 octobre 2026');
  assertStringIncludes(request, '## Factures en retard de paiement (factures_impayees)');
  assert(!request.includes(EM_DASH));
  assertStringIncludes(briefingRequest('2026-10-09', []), 'Aucune lecture');
  assertEquals(nextDay('2026-12-31'), '2027-01-01');
});

Deno.test('point du jour : phrases vérifiées (étiquette, texte, urgent), texte une phrase par ligne', () => {
  const dash = String.fromCharCode(0x2014);
  const phrases = parseBriefing(JSON.stringify({
    phrases: [
      {
        etiquette: 'Urgent',
        texte: `Tracteur GH-512-RT en panne ${dash} Fontaine Livraisons.`,
        urgent: true,
      },
      { etiquette: 'Atelier', texte: 'Sept OR en cours.', urgent: false },
    ],
  }));
  assertEquals(phrases?.[0], {
    etiquette: 'Urgent',
    texte: 'Tracteur GH-512-RT en panne, Fontaine Livraisons.',
    urgent: true,
  });
  assertEquals(
    briefingText(phrases ?? []),
    'Tracteur GH-512-RT en panne, Fontaine Livraisons.\nSept OR en cours.',
  );
  assertEquals(parseBriefing(JSON.stringify({ phrases: [] })), null);
  assertEquals(parseBriefing('Rien d’urgent.'), null);
});
