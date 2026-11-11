import { assertEquals, assertStringIncludes } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAction } from './actions.ts';

/** Fausse base en lecture : seule l'action proposée est notée (agent_actions). */
function fakeDb(data: Record<string, unknown[]>) {
  const inserts: Record<string, unknown>[] = [];
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
              if (table !== 'agent_actions') throw new Error(`écriture interdite : ${table}`);
              inserts.push(row);
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
          if (['update', 'upsert', 'delete'].includes(key)) throw new Error('écriture interdite');
          return () => query(table);
        },
      },
    );
  return { db: { from: query } as unknown as SupabaseClient, inserts };
}

const ORDER = { id: 'ro1', number: 'OR00488', plate: 'AB-123-CD', status: 'in_progress' };
const PARTS = [
  {
    id: 'l1',
    description: 'Disque de frein avant',
    manufacturer_ref: null,
    oem_ref: null,
    order_status: 'to_order',
  },
  { id: 'l2', description: 'Filtre à air', manufacturer_ref: null, oem_ref: null, order_status: 'ordered' },
];

Deno.test('« j’ai commandé le disque de frein de l’OR 488 » : passage en « Commandée » préparé', async () => {
  const { db, inserts } = fakeDb({ v_repair_orders_overview: [ORDER], ro_lines: PARTS });
  const result = await runAction(
    db,
    'preparer_statut_piece',
    { numero_or: '488', piece: 'disque de frein', statut: 'commandee' },
    null,
  );
  assertEquals(result.is_error, false, result.content);
  assertEquals(inserts[0]?.payload, {
    repair_order_id: 'ro1',
    line_id: 'l1',
    description: 'Disque de frein avant',
    status: 'ordered',
  });
  assertEquals(
    inserts[0]?.summary,
    'Pièce « Disque de frein avant » de l’OR OR00488 (AB-123-CD) : passer en « Commandée »',
  );
});

Deno.test('pièce repassée « À commander » ; statut déjà en place : rien de préparé', async () => {
  const { db, inserts } = fakeDb({ v_repair_orders_overview: [ORDER], ro_lines: PARTS });
  const back = await runAction(
    db,
    'preparer_statut_piece',
    { numero_or: '488', piece: 'filtre', statut: 'a_commander' },
    null,
  );
  assertEquals(back.is_error, false, back.content);
  assertEquals((inserts[0]?.payload as { status: string }).status, 'to_order');

  const same = await runAction(
    db,
    'preparer_statut_piece',
    { numero_or: '488', piece: 'filtre', statut: 'commandee' },
    null,
  );
  assertStringIncludes(same.content, 'déjà en « Commandée »');
  assertEquals(inserts.length, 1);
});

Deno.test('statut inconnu : refusé', async () => {
  const { db, inserts } = fakeDb({ v_repair_orders_overview: [ORDER], ro_lines: PARTS });
  const result = await runAction(
    db,
    'preparer_statut_piece',
    { numero_or: '488', piece: 'filtre', statut: 'perdue' },
    null,
  );
  assertEquals(result.is_error, true);
  assertEquals(inserts, []);
});
