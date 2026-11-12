import { assertEquals, assertStringIncludes } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { matchingParts, type PartLine, runAction } from './actions.ts';

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
const part = (id: string, description: string, patch: Partial<PartLine> = {}): PartLine => ({
  id,
  description,
  manufacturer_ref: null,
  oem_ref: null,
  order_status: 'ordered',
  ...patch,
});
const PARTS = [
  part('l1', 'Disque de frein avant', { manufacturer_ref: 'BREMBO 09.C401' }),
  part('l2', 'Plaquettes de frein avant'),
  part('l3', 'Filtre à air', { order_status: 'received' }),
];

Deno.test('pièce dite : désignation sans accent ni article, ou référence', () => {
  assertEquals(matchingParts(PARTS, 'le disque de frein').map((p) => p.id), ['l1']);
  assertEquals(matchingParts(PARTS, 'plaquettes').map((p) => p.id), ['l2']);
  assertEquals(matchingParts(PARTS, 'brembo 09 C401').map((p) => p.id), ['l1']);
  assertEquals(matchingParts(PARTS, 'frein').map((p) => p.id), ['l1', 'l2']);
  assertEquals(matchingParts(PARTS, 'la pièce'), []);
});

Deno.test('« la pièce disque de frein de l’OR 488 est arrivée » : passage en reçue préparé, pas fait', async () => {
  const { db, inserts } = fakeDb({ v_repair_orders_overview: [ORDER], ro_lines: PARTS });
  const result = await runAction(
    db,
    'preparer_statut_piece',
    { numero_or: '488', piece: 'disque de frein' },
    null,
  );
  assertEquals(result.is_error, false, result.content);
  assertEquals(inserts[0]?.kind, 'part_received');
  assertEquals(inserts[0]?.payload, {
    repair_order_id: 'ro1',
    line_id: 'l1',
    description: 'Disque de frein avant',
    status: 'received',
  });
  assertEquals(
    inserts[0]?.summary,
    'Pièce « Disque de frein avant » de l’OR OR00488 (AB-123-CD) : passer en « Reçue »',
  );
});

Deno.test('pièce introuvable, ambiguë ou déjà reçue : rien de préparé, l’agent sait pourquoi', async () => {
  const { db, inserts } = fakeDb({ v_repair_orders_overview: [ORDER], ro_lines: PARTS });
  const missing = await runAction(db, 'preparer_statut_piece', { numero_or: '488', piece: 'turbo' }, null);
  assertStringIncludes(missing.content, 'pas de pièce « turbo »');
  assertStringIncludes(missing.content, '« Plaquettes de frein avant »');
  const both = await runAction(db, 'preparer_statut_piece', { numero_or: '488', piece: 'frein' }, null);
  assertStringIncludes(both.content, 'plusieurs pièces correspondent');
  const received = await runAction(
    db,
    'preparer_statut_piece',
    { numero_or: '488', piece: 'filtre à air' },
    null,
  );
  assertStringIncludes(received.content, 'déjà en « Reçue »');
  assertEquals(inserts, []);
});
