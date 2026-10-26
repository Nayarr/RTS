import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTION_DEFINITIONS, ACTION_TOOLS, runAction } from './actions.ts';
import { DISPLAY_DEFINITIONS, runDisplay } from './display.ts';

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
              if (table !== 'agent_actions') throw new Error(`écriture interdite : ${table}`);
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
  const db = { from: (table: string) => query(table) } as unknown as SupabaseClient;
  return { db, inserts, writes };
}

const TECHS = [
  { id: 't1', display_name: 'Alice' },
  { id: 't2', display_name: 'Bruno' },
];
const ORDER = { id: 'ro1', number: 'OR00488', plate: 'AB-123-CD', status: 'in_progress' };

Deno.test('outils d’action : noms « preparer_… », schémas fermés', () => {
  for (const tool of ACTION_DEFINITIONS) {
    assert(tool.name.startsWith('preparer_'), tool.name);
    assertEquals(tool.input_schema.additionalProperties, false, tool.name);
  }
  assertEquals(ACTION_TOOLS.length, 10);
});

Deno.test('rendez-vous préparé, pas créé : résumé lisible, technicien reconnu', async () => {
  const { db, inserts, writes } = fakeDb({
    technicians: TECHS,
    v_vehicles_overview: [{ vehicle_type: 'vul', client_name: 'Transports Martin' }],
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
  const known = fakeDb({ technicians: TECHS, clients: [{ name: 'Transports Moreau' }] });
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
  const { db, inserts } = fakeDb({ technicians: TECHS, v_repair_orders_overview: [ORDER] });
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
  assertStringIncludes(String(inserts[0]!.row.summary), 'aux travaux de l’OR OR00488 (AB-123-CD)');

  const assign = await runAction(db, 'preparer_assignation', {
    immatriculation: 'AB-123-CD',
    technicien: 'Bruno',
  }, null);
  assertEquals(assign.is_error, false, assign.content);
  assertEquals(inserts[1]!.row.payload, { repair_order_id: 'ro1', technician_id: 't2' });
});

Deno.test('OR terminé ou technicien inconnu : action non préparée', async () => {
  const done = fakeDb({ technicians: TECHS, v_repair_orders_overview: [{ ...ORDER, status: 'invoiced' }] });
  assert(
    (await runAction(done.db, 'preparer_travail_or', { numero_or: '488', travail: 'X' }, null)).is_error,
  );
  const unknown = fakeDb({ technicians: TECHS, v_repair_orders_overview: [ORDER] });
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

Deno.test('relance préparée, pas envoyée : e-mail du client, factures dues vérifiées, adresse de facturation', async () => {
  const { db, inserts, writes } = fakeDb({
    clients: [{
      id: 'c1',
      name: 'Transports Martin',
      email: 'Compta@Martin.fr',
      name_key: 'TRANSPORTSMARTIN',
    }],
    v_invoices_overview: [
      { id: 'i1', number: 'F11887', client_id: 'c1', balance_due: 320, status: 'issued' },
      { id: 'i2', number: 'F11890', client_id: 'c1', balance_due: 0, status: 'issued' },
    ],
  });
  const result = await runAction(
    db,
    'preparer_mail',
    {
      client: 'Transports Martin',
      objet: 'Facture F11887 en attente de règlement',
      texte: 'Madame, Monsieur,\nSauf erreur de notre part, la facture F11887…',
      factures: ['11887'],
    },
    'conv1',
  );
  assertEquals(result.is_error, false);
  assertEquals(writes, []);
  assertEquals(inserts[0]?.row.kind, 'send_mail');
  assertEquals(inserts[0]?.row.payload, {
    to: 'compta@martin.fr',
    client_id: 'c1',
    client_name: 'Transports Martin',
    subject: 'Facture F11887 en attente de règlement',
    text: 'Madame, Monsieur,\nSauf erreur de notre part, la facture F11887…',
    category: 'billing',
    invoice_ids: ['i1'],
    invoice_numbers: ['F11887'],
  });
  assertStringIncludes(
    String(inserts[0]?.row.summary),
    'Relance à Transports Martin (compta@martin.fr) : « Facture F11887 en attente de règlement », factures F11887',
  );

  const paid = await runAction(
    db,
    'preparer_mail',
    { client: 'Transports Martin', objet: 'Relance', texte: 'Bonjour', factures: ['F11890'] },
    null,
  );
  assertEquals(paid.is_error, true);
  assertStringIncludes(paid.content, 'déjà réglée');
});

Deno.test('mail libre : adresse dite, sinon client sans e-mail signalé', async () => {
  const { db, inserts } = fakeDb({
    clients: [{ id: 'c2', name: 'Dupont', email: null, name_key: 'DUPONT' }],
  });
  const free = await runAction(
    db,
    'preparer_mail',
    { email: 'contact@pl-pieces.fr', objet: 'Commande', texte: 'Bonjour' },
    null,
  );
  assertEquals(free.is_error, false);
  assertEquals((inserts[0]?.row.payload as Record<string, unknown>).category, 'workshop');
  const noEmail = await runAction(
    db,
    'preparer_mail',
    { client: 'Dupont', objet: 'Info', texte: 'Bonjour' },
    null,
  );
  assertEquals(noEmail.is_error, true);
  assertStringIncludes(noEmail.content, 'demande l’adresse');
});

Deno.test('mails groupés : un par client à partir du modèle, client sans e-mail signalé, rien envoyé', async () => {
  const { db, inserts, writes } = fakeDb({
    clients: [
      { id: 'c1', name: 'Transports Martin', email: 'Compta@Martin.fr', name_key: 'TRANSPORTSMARTIN' },
      { id: 'c3', name: 'Frigo Leroy', email: 'atelier@leroy.fr', name_key: 'FRIGOLEROY' },
      { id: 'c2', name: 'Dupont', email: null, name_key: 'DUPONT' },
    ],
  });
  const result = await runAction(
    db,
    'preparer_mails',
    {
      objet: 'Contrôle technique à prévoir, {client}',
      texte: 'Bonjour,\nVos véhicules : {details}.\nL’équipe de RAPID TRUCK SERVICE',
      destinataires: [
        { client: 'Transports Martin', details: 'AB-123-CD le 12 novembre' },
        { client: 'Frigo Leroy', details: 'EF-456-GH le 3 décembre' },
        { client: 'Transports Martin', details: 'en double' },
        { client: 'Dupont', details: 'IJ-789-KL le 20 novembre' },
      ],
    },
    'conv1',
  );
  assertEquals(result.is_error, false, result.content);
  assertEquals(writes, []);
  assertEquals(result.actions.length, 2);
  assertEquals(inserts.map((insert) => insert.row.kind), ['send_mail', 'send_mail']);
  assertEquals(inserts[0]?.row.payload, {
    to: 'compta@martin.fr',
    client_id: 'c1',
    client_name: 'Transports Martin',
    subject: 'Contrôle technique à prévoir, Transports Martin',
    text: 'Bonjour,\nVos véhicules : AB-123-CD le 12 novembre.\nL’équipe de RAPID TRUCK SERVICE',
    category: 'workshop',
    invoice_ids: [],
    invoice_numbers: [],
  });
  assertStringIncludes(String(inserts[1]?.row.summary), 'Mail à Frigo Leroy (atelier@leroy.fr)');
  assertStringIncludes(result.content, 'Dupont : pas d’e-mail valable sur la fiche de Dupont');

  const none = await runAction(
    db,
    'preparer_mails',
    { objet: 'Info', texte: 'Bonjour', destinataires: [{ client: 'Dupont' }] },
    null,
  );
  assertEquals(none.is_error, true);
  assertStringIncludes(none.content, 'aucun mail préparé');
});

Deno.test('échéance, date d’OR, OR à facturer et brouillon de facture : préparés, pas faits', async () => {
  const { db, inserts, writes } = fakeDb({
    v_vehicles_overview: [{ id: 'v1', plate: 'AB-123-CD', client_name: 'Transports Martin' }],
    v_repair_orders_overview: [
      { ...ORDER, status: 'work_done', client_id: 'c1', client_name: 'Transports Martin' },
      { id: 'ro2', number: 'OR00490', plate: 'EF-456-GH', status: 'to_invoice', client_id: 'c1' },
    ],
  });
  const hayon = await runAction(
    db,
    'preparer_echeance',
    { immatriculation: 'ab123cd', echeance: 'hayon', date: '2027-03-14' },
    null,
  );
  assertEquals(hayon.is_error, false, hayon.content);
  assertEquals(inserts[0]?.row.payload, {
    vehicle_id: 'v1',
    plate: 'AB-123-CD',
    field: 'tailgate_due_date',
    date: '2027-03-14',
  });
  assertEquals(inserts[0]?.row.summary, 'Contrôle hayon de AB-123-CD (Transports Martin) : mars 2027');

  const planned = await runAction(
    db,
    'preparer_planification_or',
    { numero_or: '488', date: '2099-03-14', heure_debut: '08:00', heure_fin: '10:30' },
    null,
  );
  assertEquals(planned.is_error, false, planned.content);
  assertEquals(inserts[1]?.row.kind, 'schedule_order');
  assertStringIncludes(
    String(inserts[1]?.row.summary),
    'OR OR00488 (AB-123-CD) prévu le samedi 14 mars à 8h00',
  );
  const late = await runAction(
    db,
    'preparer_planification_or',
    { numero_or: '488', date: '2099-03-14', heure_debut: '10:00', heure_fin: '09:00' },
    null,
  );
  assertEquals(late.is_error, true);

  const validated = await runAction(db, 'preparer_or_facture_a_faire', { numero_or: '488' }, null);
  assertEquals(validated.is_error, false, validated.content);
  assertEquals(inserts[2]?.row.payload, { repair_order_id: 'ro1' });

  const draft = await runAction(db, 'preparer_brouillon_facture', { numeros_or: ['488', 'or 490'] }, null);
  assertEquals(draft.is_error, false, draft.content);
  assertEquals(inserts[3]?.row.payload, { repair_order_ids: ['ro1', 'ro2'] });
  assertStringIncludes(
    String(inserts[3]?.row.summary),
    'Brouillon de facture groupée pour OR00488 (AB-123-CD)',
  );
  assertEquals(writes, []);
});

Deno.test('brouillon de facture : OR inconnu, pas terminé ou de deux clients refusés', async () => {
  const { db, inserts } = fakeDb({
    v_repair_orders_overview: [
      { id: 'ro1', number: 'OR00488', status: 'in_progress', client_id: 'c1' },
      { id: 'ro2', number: 'OR00490', status: 'to_invoice', client_id: 'c1' },
      { id: 'ro3', number: 'OR00491', status: 'work_done', client_id: 'c2' },
    ],
  });
  const missing = await runAction(db, 'preparer_brouillon_facture', { numeros_or: ['999'] }, null);
  assertStringIncludes(missing.content, 'OR OR00999 introuvable');
  const open = await runAction(db, 'preparer_brouillon_facture', { numeros_or: ['488'] }, null);
  assertStringIncludes(open.content, 'n’est pas terminé');
  const mixed = await runAction(db, 'preparer_brouillon_facture', { numeros_or: ['490', '491'] }, null);
  assertStringIncludes(mixed.content, 'même client');
  assertEquals(inserts, []);
});

Deno.test('rendez-vous déplacé ou annulé : le bon rendez-vous, sinon la date demandée', async () => {
  const two = fakeDb({
    v_vehicles_overview: [{ id: 'v1', plate: 'AB-123-CD', client_name: 'Transports Martin' }],
    v_appointments_overview: [
      {
        id: 'ap1',
        scheduled_date: '2099-03-10',
        start_time: '09:00:00',
        plate: 'AB-123-CD',
        client_name: 'Martin',
      },
      {
        id: 'ap2',
        scheduled_date: '2099-03-17',
        start_time: '14:00:00',
        plate: 'AB-123-CD',
        client_name: 'Martin',
      },
    ],
  });
  const ambiguous = await runAction(
    two.db,
    'preparer_changement_rendez_vous',
    { immatriculation: 'AB-123-CD', nouvelle_date: '2099-03-20' },
    null,
  );
  assertEquals(ambiguous.is_error, true);
  assertStringIncludes(ambiguous.content, 'précise la date');

  const one = fakeDb({
    v_vehicles_overview: [{ id: 'v1', plate: 'AB-123-CD', client_name: 'Transports Martin' }],
    v_appointments_overview: [
      {
        id: 'ap1',
        scheduled_date: '2099-03-10',
        start_time: '09:00:00',
        plate: 'AB-123-CD',
        client_name: 'Martin',
      },
    ],
  });
  const moved = await runAction(
    one.db,
    'preparer_changement_rendez_vous',
    { immatriculation: 'AB-123-CD', nouvelle_date: '2099-03-20', nouvelle_heure: '10:00' },
    null,
  );
  assertEquals(moved.is_error, false, moved.content);
  assertEquals(one.inserts[0]?.row.payload, {
    appointment_id: 'ap1',
    date: '2099-03-20',
    start_time: '10:00',
    end_time: null,
  });
  assertStringIncludes(String(one.inserts[0]?.row.summary), 'au vendredi 20 mars à 10h00');
  const cancelled = await runAction(
    one.db,
    'preparer_changement_rendez_vous',
    { immatriculation: 'AB-123-CD', annuler: true },
    null,
  );
  assertEquals(one.inserts[1]?.row.payload, { appointment_id: 'ap1', cancel: true });
  assertStringIncludes(cancelled.content, 'Je le fais ?');
  assertEquals(one.writes, []);
});

Deno.test('tableau : affiché tel quel, lignes de la bonne largeur seulement', () => {
  const shown = runDisplay({
    titre: 'Contrôles techniques',
    colonnes: ['Plaque', 'Client', 'Date'],
    lignes: [['AB-123-CD', 'Martin', '2026-11-12'], ['EF-456-GH', null, 3]],
  });
  assertEquals(shown.is_error, false);
  assertEquals(shown.table?.lignes, [['AB-123-CD', 'Martin', '2026-11-12'], ['EF-456-GH', '', '3']]);
  assertStringIncludes(shown.content, 'ne le recopie pas');
  const broken = runDisplay({ titre: 'X', colonnes: ['A', 'B'], lignes: [['seul']] });
  assertEquals(broken.is_error, true);
  assertEquals(DISPLAY_DEFINITIONS[0]?.input_schema.additionalProperties, false);
});
