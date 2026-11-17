-- =============================================================================
-- Conformité anti-fraude TVA : journal fiscal chaîné, vérification de l'intégrité et archives figées
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

\ir helpers/fixtures.psql

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'comptable@test.fr');
insert into public.profiles (id, email, full_name, role)
values ('00000000-0000-0000-0000-0000000000f1', 'comptable@test.fr', 'Comptable', 'accountant');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction

insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000158', '30000000-0000-0000-0000-000000000001', 'Freinage');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000158', 'done', 'labor', 'Remplacement plaquettes', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000158'::uuid]) as invoice \gset

select is((select count(*) from public.fiscal_journal), 0::bigint, 'Un brouillon n''entre pas au journal');

select public.issue_invoice(:'invoice') as number \gset
select total_ttc as total from public.invoices where id = :'invoice' \gset

-- ---------------------------------------------------------------------------
-- Journal : facture, paiement, annulation, avoir
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select seq, event_type, document_number, prev_hash from public.fiscal_journal $$,
  format($$ values (1::bigint, 'invoice'::text, %L::text, repeat('0', 64)) $$, :'number'),
  'Facture émise journalisée en premier, après 64 zéros');
reset role;  -- fonctions internes (contenu figé, empreinte) : hors de l'API
select is((select payload from public.fiscal_journal where seq = 1), public.fiscal_invoice_snapshot(:'invoice'),
          'Contenu journalisé = facture émise');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select jsonb_array_length(payload -> 'lignes') from public.fiscal_journal where seq = 1), 1,
          'Les lignes de la facture sont dans le contenu');
select is((select payload ->> 'total_ttc' from public.fiscal_journal where seq = 1)::numeric, :'total'::numeric,
          'Total TTC dans le contenu');
select is((select actor_id from public.fiscal_journal where seq = 1), '00000000-0000-0000-0000-0000000000d1'::uuid,
          'Auteur de l''émission');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.payments (id, invoice_id, amount_ttc, method) values
  ('70000000-0000-0000-0000-000000000158', :'invoice', 100, 'cash');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select event_type, amount_ttc, payload ->> 'mode', actor_id::text from public.fiscal_journal where seq = 2 $$,
  $$ values ('payment'::text, 100.00::numeric, 'cash'::text, '00000000-0000-0000-0000-0000000000e1'::text) $$,
  'Paiement journalisé avec son mode et la personne');

select public.cancel_payment('70000000-0000-0000-0000-000000000158', 'Erreur') as reversal \gset
select results_eq(
  $$ select event_type, amount_ttc, payload ->> 'annule_paiement_id', payload ->> 'motif_annulation'
     from public.fiscal_journal where seq = 3 $$,
  $$ values ('payment'::text, -100.00::numeric, '70000000-0000-0000-0000-000000000158'::text, 'Erreur'::text) $$,
  'Annulation journalisée : montant négatif, paiement d''origine et motif');

insert into public.credit_notes (invoice_id, amount_ht, reason) values (:'invoice', 10, 'Geste commercial');
select results_eq(
  $$ select event_type, amount_ttc, payload ->> 'motif' from public.fiscal_journal where seq = 4 $$,
  $$ values ('credit_note'::text, 12.00::numeric, 'Geste commercial'::text) $$,
  'Avoir journalisé');

reset role;
select ok(
  (select bool_and(j.prev_hash = coalesce(p.hash, repeat('0', 64)) and j.hash = public.fiscal_hash(j))
   from public.fiscal_journal j left join public.fiscal_journal p on p.seq = j.seq - 1),
  'Chaque empreinte inclut la précédente et toute l''écriture');
select is((select count(distinct hash) from public.fiscal_journal), 4::bigint, 'Empreintes toutes différentes');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');

-- ---------------------------------------------------------------------------
-- Inaltérabilité du journal
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.fiscal_journal (event_type, document_id, occurred_at, payload, prev_hash, hash)
                    values ('payment', gen_random_uuid(), now(), '{}', '', '') $$,
                 '42501', null, 'Pas d''écriture directe dans le journal');
select throws_ok($$ update public.fiscal_journal set amount_ttc = 0 $$, '42501', null,
                 'Pas de modification par l''API');

reset role;
select throws_ok($$ update public.fiscal_journal set amount_ttc = 0 where seq = 2 $$, '42501', null,
                 'Journal non modifiable, même hors de l''API');
select throws_ok($$ delete from public.fiscal_journal where seq = 2 $$, '42501', null,
                 'Journal non supprimable, même hors de l''API');
select throws_ok($$ truncate public.fiscal_journal $$, '42501', null, 'Journal non vidable');
select throws_ok($$ delete from public.payments where id = '70000000-0000-0000-0000-000000000158' $$, '42501', null,
                 'Paiement non supprimable, même hors de l''API');

-- ---------------------------------------------------------------------------
-- Vérification
-- ---------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((public.verify_fiscal_journal() ->> 'ok')::boolean, true, 'Journal intègre');
select is((public.verify_fiscal_journal() ->> 'ecritures')::integer, 4, 'Quatre écritures vérifiées');
select is(public.verify_fiscal_journal() ->> 'derniere_empreinte',
          (select hash from public.fiscal_journal where seq = 4), 'Dernière empreinte donnée');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select is((public.verify_fiscal_journal() ->> 'ok')::boolean, true, 'Le comptable vérifie aussi');
select is((select count(*) from public.fiscal_journal), 4::bigint, 'Le comptable lit le journal');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.verify_fiscal_journal() $$, '42501', null, 'La réception ne vérifie pas');
select is((select count(*) from public.fiscal_journal), 0::bigint, 'Ni ne lit le journal');

-- Contournements (accès direct à la base, déclencheurs coupés) : tous détectés
reset role;
set local session_replication_role = replica;
update public.invoice_lines set description = 'Ligne retouchée' where invoice_id = :'invoice';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select e ->> 'probleme', e ->> 'document' from jsonb_array_elements(public.verify_fiscal_journal() -> 'erreurs') e $$,
  format($$ values ('Document modifié'::text, %L::text) $$, :'number'),
  'Ligne de facture retouchée : document modifié');

reset role;
update public.invoice_lines set description = 'Remplacement plaquettes' where invoice_id = :'invoice';
update public.fiscal_journal set amount_ttc = 999 where seq = 2;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select (e ->> 'seq')::bigint, e ->> 'probleme' from jsonb_array_elements(public.verify_fiscal_journal() -> 'erreurs') e $$,
  $$ values (2::bigint, 'Écriture modifiée'::text) $$,
  'Montant d''une écriture retouché : détecté');

reset role;
update public.fiscal_journal set amount_ttc = 100 where seq = 2;
update public.fiscal_journal set payload = payload || '{"mode": "card"}' where seq = 2;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select (e ->> 'seq')::bigint, e ->> 'probleme' from jsonb_array_elements(public.verify_fiscal_journal() -> 'erreurs') e $$,
  $$ values (2::bigint, 'Écriture modifiée'::text), (2::bigint, 'Document modifié'::text) $$,
  'Contenu d''une écriture retouché : détecté');

reset role;
update public.fiscal_journal set payload = payload || '{"mode": "cash"}' where seq = 2;
insert into public.payments (id, invoice_id, amount_ttc, method) values
  ('70000000-0000-0000-0000-000000000159', :'invoice', 5, 'cash');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select e ->> 'probleme' from jsonb_array_elements(public.verify_fiscal_journal() -> 'erreurs') e $$,
  $$ values ('Document absent du journal'::text) $$,
  'Paiement glissé sans passer par le journal : détecté');

reset role;
delete from public.payments where id = '70000000-0000-0000-0000-000000000159';
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((public.verify_fiscal_journal() ->> 'ok')::boolean, true, 'Retour à l''état journalisé : intègre');

-- ---------------------------------------------------------------------------
-- Archives
-- ---------------------------------------------------------------------------
-- Paiement enregistré le mois dernier
insert into public.payments (invoice_id, amount_ttc, method, paid_on, created_at)
values (:'invoice', 20, 'card', (date_trunc('month', public.paris_date(now())) - interval '10 days')::date,
        date_trunc('month', now()) - interval '10 days');
select (date_trunc('month', public.paris_date(now())) - interval '1 month')::date as month_from,
       (date_trunc('month', public.paris_date(now())) - interval '1 day')::date as month_to \gset

select throws_ok($$ select public.create_fiscal_archive(public.paris_date(now()) - 3, public.paris_date(now())) $$,
                 'P0001', null, 'Pas d''archive d''une période qui n''est pas close');
select public.create_fiscal_archive(:'month_from', :'month_to') as archive \gset
select results_eq(
  format($$ select entries_count, automatic, created_by::text from public.fiscal_archives where id = %L $$, :'archive'),
  $$ values (1, false, '00000000-0000-0000-0000-0000000000d1'::text) $$,
  'Archive du mois dernier : son écriture, à la demande, par la direction');
select is(encode(extensions.digest(public.fiscal_archive_content(:'archive'), 'sha256'), 'hex'),
          (select sha256 from public.fiscal_archives where id = :'archive'),
          'Le texte téléchargé a l''empreinte enregistrée');
select results_eq(
  format($$ select c -> 'totaux_periode' ->> 'encaissements_ttc', c -> 'periode' ->> 'du',
                   jsonb_array_length(c -> 'ecritures'), c ->> 'format'
            from (select public.fiscal_archive_content(%L)::jsonb c) x $$, :'archive'),
  format($$ values ('20.00'::text, %L::text, 1, 'rts-archive-fiscale/1'::text) $$, :'month_from'),
  'Contenu : totaux, période, écritures et format');
select results_eq(
  format($$ select event_type, payload ->> 'sha256' from public.fiscal_journal where document_id = %L $$, :'archive'),
  format($$ values ('archive'::text, (select sha256 from public.fiscal_archives where id = %L)) $$, :'archive'),
  'L''archive entre au journal avec son empreinte');
select throws_ok(format($$ select public.create_fiscal_archive(%L, %L) $$, :'month_from', :'month_to'),
                 '23505', null, 'Une période ne s''archive qu''une fois');
select is((public.verify_fiscal_journal() ->> 'ok')::boolean, true, 'Journal intègre avec l''archive');

select throws_ok(format($$ select content from public.fiscal_archives where id = %L $$, :'archive'),
                 '42501', null, 'Le contenu ne se lit que par fiscal_archive_content');
select throws_ok($$ update public.fiscal_archives set sha256 = 'x' $$, '42501', null,
                 'Archive non modifiable par l''API');
reset role;
select throws_ok(format($$ delete from public.fiscal_archives where id = %L $$, :'archive'), '42501', null,
                 'Archive non supprimable, même hors de l''API');

-- Tâche du 1er du mois : le mois précédent, une seule fois
select is(public.archive_previous_month(), null, 'Mois précédent déjà archivé : rien de plus');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select lives_ok($$ select public.create_fiscal_archive(public.paris_date(now()) - 400, public.paris_date(now()) - 1) $$,
                'Le comptable archive une période longue');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.create_fiscal_archive('2025-01-01', '2025-12-31') $$, '42501', null,
                 'La réception n''archive pas');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.fiscal_archives), 0::bigint, 'Un technicien ne voit pas les archives');

select * from finish();
rollback;
