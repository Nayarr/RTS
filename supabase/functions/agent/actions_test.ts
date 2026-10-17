import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTION_DEFINITIONS, ACTION_TOOLS, runAction } from './actions.ts';

/**
 * Fausse base : lectures servies par table, une seule écriture permise (insertion dans
 * agent_actions), gardée pour vérification.
 */
function fakeDb(data: Record<string, unknown[]>) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const writes: string[] = [];
  const query = (table: string): unknown =>
    new Proxy(
      {},
      {
        get(_, key: string) {
          if (key === 'then') {
            return (resolve: (value: unknown) => void) => resolve({ data: data[table] ?? [], error: null });
          }
          if (key === 'insert') {
            return (row: Record<string, unknown>) => {
              if (table !== 'agent_actions') {
                throw new Error(
                  `écriture interdite : ${table}`,
                );
              }
              inserts.push({ table, row });
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { id: 'a1', kind: row.kind, summary: row.summary },
                      error: null,
                    }),
                }),
              };
            };
          }
          if (['update', 'upsert', 'delete'].includes(key)) {
            return () => {
              writes.push(`${key} ${table}`);
              throw new Error('écriture interdite');
            };
          }
          return () => query(table);
        },
      },
    );
  const db = {
    from: (table: string) => query(table),
  } as unknown as SupabaseClient;
  return { db, inserts, writes };
}

const TECHS = [
  { id: 't1', display_name: 'Alice' },
  { id: 't2', display_name: 'Bruno' },
];
const ORDER = {
  id: 'ro1',
  number: 'OR00488',
  plate: 'AB-123-CD',
  status: 'in_progress',
};

Deno.test('outils d’action : noms « preparer_… », schémas fermés', () => {
  for (const tool of ACTION_DEFINITIONS) {
    assert(tool.name.startsWith('preparer_'), tool.name);
    assertEquals(tool.input_schema.additionalProperties, false, tool.name);
  }
  assertEquals(ACTION_TOOLS.length, 3);
});

Deno.test('rendez-vous préparé, pas créé : résumé lisible, technicien reconnu', async () => {
  const { db, inserts, writes } = fakeDb({
    technicians: TECHS,
    v_vehicles_overview: [{
      vehicle_type: 'vul',
      client_name: 'Transports Martin',
    }],
  });
  const result = await runAction(
    db,
    'preparer_rendez_vous',
    {
      date: '2099-03-14',
      heure: '09:00',
      duree_minutes: 90,
      immatriculation: 'ab-123-cd',
      motif: 'Vidange',
      technicien: 'alice',
    },
    'c1',
  );
  assertEquals(result.is_error, false, result.content);
  assertEquals(writes, []);
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0]!.row.kind, 'appointment');
  assertEquals(inserts[0]!.row.payload, {
    client_name: 'Transports Martin',
    plate: 'ab-123-cd',
    vehicle_type: 'vul',
    date: '2099-03-14',
    start_time: '09:00',
    end_time: '10:30',
    reason: 'Vidange',
    technician_id: 't1',
  });
  assertStringIncludes(
    String(inserts[0]!.row.summary),
    'à 9h00 pour AB-123-CD, Transports Martin : Vidange, avec Alice',
  );
  assertStringIncludes(result.content, 'pas encore faite');
});

Deno.test('rendez-vous : date passée ou ni véhicule ni client refusés', async () => {
  const { db, inserts } = fakeDb({ technicians: TECHS });
  const past = await runAction(db, 'preparer_rendez_vous', {
    date: '2000-01-01',
    heure: '09:00',
    client: 'X',
    motif: 'Vidange',
  }, null);
  assert(past.is_error);
  const nobody = await runAction(db, 'preparer_rendez_vous', {
    date: '2099-01-01',
    heure: '09:00',
    motif: 'Vidange',
  }, null);
  assert(nobody.is_error);
  assertEquals(inserts, []);
});

Deno.test('rendez-vous : seulement un client déjà en base, sous son nom exact', async () => {
  const known = fakeDb({
    technicians: TECHS,
    clients: [{ name: 'Transports Moreau' }],
  });
  const ok = await runAction(known.db, 'preparer_rendez_vous', {
    date: '2099-01-01',
    heure: '09:00',
    client: 'transports moreau',
    motif: 'Vidange',
  }, null);
  assertEquals(ok.is_error, false, ok.content);
  assertEquals(known.inserts[0]!.row.payload, {
    client_name: 'Transports Moreau',
    plate: '',
    vehicle_type: 'pl',
    date: '2099-01-01',
    start_time: '09:00',
    end_time: null,
    reason: 'Vidange',
    technician_id: null,
  });

  const unknown = fakeDb({ technicians: TECHS, clients: [] });
  const refused = await runAction(unknown.db, 'preparer_rendez_vous', {
    date: '2099-01-01',
    heure: '09:00',
    client: 'Garage Inconnu',
    motif: 'Vidange',
  }, null);
  assert(refused.is_error);
  assertStringIncludes(refused.content, 'introuvable');
  assertEquals(unknown.inserts, []);
});

Deno.test('travail ajouté à un OR et technicien assigné : préparés sur l’OR trouvé', async () => {
  const { db, inserts } = fakeDb({
    technicians: TECHS,
    v_repair_orders_overview: [ORDER],
  });
  const work = await runAction(db, 'preparer_travail_or', {
    numero_or: '488',
    travail: 'Changer les balais',
    heures: 0.5,
  }, null);
  assertEquals(work.is_error, false, work.content);
  assertEquals(inserts[0]!.row.payload, {
    repair_order_id: 'ro1',
    description: 'Changer les balais',
    estimated_hours: 0.5,
  });
  assertStringIncludes(
    String(inserts[0]!.row.summary),
    'aux travaux de l’OR OR00488 (AB-123-CD)',
  );

  const assign = await runAction(db, 'preparer_assignation', {
    immatriculation: 'AB-123-CD',
    technicien: 'Bruno',
  }, null);
  assertEquals(assign.is_error, false, assign.content);
  assertEquals(inserts[1]!.row.payload, {
    repair_order_id: 'ro1',
    technician_id: 't2',
  });
});

Deno.test('OR terminé ou technicien inconnu : action non préparée', async () => {
  const done = fakeDb({
    technicians: TECHS,
    v_repair_orders_overview: [{ ...ORDER, status: 'invoiced' }],
  });
  assert(
    (await runAction(done.db, 'preparer_travail_or', {
      numero_or: '488',
      travail: 'X',
    }, null)).is_error,
  );
  const unknown = fakeDb({
    technicians: TECHS,
    v_repair_orders_overview: [ORDER],
  });
  const result = await runAction(
    unknown.db,
    'preparer_assignation',
    { numero_or: '488', technicien: 'Zoé' },
    null,
  );
  assert(result.is_error);
  assertStringIncludes(result.content, 'Alice, Bruno');
  assertEquals([...done.inserts, ...unknown.inserts], []);
});
