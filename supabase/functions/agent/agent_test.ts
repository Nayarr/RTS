import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  answerText,
  conversationTitle,
  dateLabel,
  EM_DASH,
  parisToday,
  questionText,
  SYSTEM_PROMPT,
} from './prompt.ts';
import { compact, runTool, TOOL_DEFINITIONS, TOOLS } from './tools.ts';

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

Deno.test('outils sans paramètre : n’appellent que des fonctions de lecture de la base', async () => {
  const READ_ONLY = ['office_dashboard', 'treasury_overview', 'workshop_board'];
  for (const tool of TOOLS.filter((item) => Object.keys(item.input_schema.properties ?? {}).length === 0)) {
    const { db, calls } = fakeDb([]);
    const fromDb = Object.assign(db, {
      from: () => {
        throw new Error('lecture de vue');
      },
    });
    await runTool(fromDb, tool.name, {});
    for (const call of calls) assert(READ_ONLY.includes(call.name), `${tool.name} appelle ${call.name}`);
  }
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
