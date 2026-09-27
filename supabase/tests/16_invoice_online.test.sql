-- =============================================================================
-- Factures en ligne : lien de consultation, relances
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000001', 'done', 'labor', 'Plaquettes', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]) as invoice_id \gset

select throws_ok(format($$ select public.share_invoice(%L) $$, :'invoice_id'),
                 'P0001', 'Seule une facture émise peut être envoyée', 'Un brouillon ne s''envoie pas');
select throws_ok(format($$ select public.record_invoice_reminder(%L) $$, :'invoice_id'),
                 'P0001', 'Seule une facture émise peut être relancée', 'Un brouillon ne se relance pas');

select public.issue_invoice(:'invoice_id') as number \gset
select public.share_invoice(:'invoice_id') as token \gset

-- Le client consulte sa facture avec le lien (sans compte)
select pg_temp.act_as_anon();
select results_eq(
  format($$ select d ->> 'type', d ->> 'number', (d ->> 'balance_due')::numeric, jsonb_array_length(d -> 'legal_mentions') > 0
            from public.public_get_document(%L) d $$, :'token'),
  format($$ values ('invoice', %L, 216.00::numeric, true) $$, :'number'),
  'Facture en ligne : numéro, reste dû, mentions légales');
select throws_ok(format($$ select public.record_invoice_reminder(%L) $$, :'invoice_id'),
                 '42501', null, 'Un visiteur ne peut pas enregistrer de relance');

-- Relances
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok(format($$ select public.record_invoice_reminder(%L) $$, :'invoice_id'), 'Relance enregistrée');
select public.record_invoice_reminder(:'invoice_id');
select results_eq(
  format($$ select reminders_count, last_reminder_at is not null from public.v_invoices_overview where id = %L $$,
         :'invoice_id'),
  $$ values (2::bigint, true) $$,
  'Nombre et date de la dernière relance dans la liste des factures');
select is((select count(*) from public.ro_events
           where repair_order_id = '50000000-0000-0000-0000-000000000001' and label like 'Relance de la facture %'),
          2::bigint, 'Chaque relance est tracée dans l''historique de l''OR');

insert into public.payments (invoice_id, amount_ttc, method) values (:'invoice_id', 216, 'bank_transfer');
select throws_ok(format($$ select public.record_invoice_reminder(%L) $$, :'invoice_id'),
                 'P0001', 'Cette facture est soldée', 'Une facture soldée ne se relance plus');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok(format($$ select public.record_invoice_reminder(%L) $$, :'invoice_id'),
                 '42501', null, 'Un technicien ne relance pas');

select * from finish();
rollback;
