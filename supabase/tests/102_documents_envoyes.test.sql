-- =============================================================================
-- Devis envoyés, factures envoyées : date d'envoi de la facture, catégories des OR
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

-- ---------------------------------------------------------------- Devis envoyé
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id)
values ('50000000-0000-0000-0000-000000002001', '30000000-0000-0000-0000-000000000001', 'Diagnostic',
        '10000000-0000-0000-0000-0000000000a1');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000002001', 'planned', 'labor', 'Embrayage à remplacer', 4);
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000002001') as quote_id \gset
reset role;
set local session_replication_role = replica;
update public.repair_orders set status = 'quote_pending' where id = '50000000-0000-0000-0000-000000002001';
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

select is((select quote_sent from public.v_repair_orders_overview where id = '50000000-0000-0000-0000-000000002001'),
          false, 'Devis à faire, pas encore parti : « Devis à faire »');
select public.share_quote(:'quote_id');
select is((select quote_sent from public.v_repair_orders_overview where id = '50000000-0000-0000-0000-000000002001'),
          true, 'Devis parti au client : l''OR passe « Devis envoyé »');
select is((public.office_dashboard() -> 'repair_orders' ->> 'quote_sent')::integer, 1,
          'Tableau de bord : compté dans « Devis envoyé »');
select is(public.office_dashboard() -> 'repair_orders' -> 'quote_pending', null,
          'et plus dans « Devis à faire »');

-- ---------------------------------------------------------------- Facture envoyée
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id)
values ('50000000-0000-0000-0000-000000002002', '30000000-0000-0000-0000-000000000001', 'Freinage',
        '10000000-0000-0000-0000-0000000000a1');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000002002', 'done', 'labor', 'Contrôle freinage', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000002002'::uuid]) as invoice_id \gset
select public.issue_invoice(:'invoice_id');

select is((select sent_at from public.v_invoices_overview where id = :'invoice_id'), null,
          'Facture émise : pas encore envoyée');
select is((select invoice_sent from public.v_repair_orders_overview where id = '50000000-0000-0000-0000-000000002002'),
          false, 'OR « Facturé » tant que la facture n''est pas partie');

select public.share_invoice(:'invoice_id');
select isnt((select sent_at from public.invoices where id = :'invoice_id'), null,
            'Lien de la facture préparé pour le client : facture envoyée');
select is((select invoice_sent from public.v_repair_orders_overview where id = '50000000-0000-0000-0000-000000002002'),
          true, 'L''OR passe « Facture envoyée »');

reset role;
update public.invoices set sent_at = '2026-10-01 10:00+02' where id = :'invoice_id';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.share_invoice(:'invoice_id');
select is((select sent_at from public.invoices where id = :'invoice_id'), '2026-10-01 10:00+02'::timestamptz,
          'Nouvel envoi : la date du premier envoi est gardée');
select throws_like(format($$ update public.invoices set total_ttc = 1 where id = %L $$, :'invoice_id'),
                   '%ne peut plus être modifiée%', 'Le reste de la facture émise reste verrouillé');

-- Relance d'une facture jamais notée envoyée (Agent Direction) : envoyée
reset role;
update public.invoices set sent_at = null where id = :'invoice_id';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.invoice_reminders (invoice_id) values (:'invoice_id');
select isnt((select sent_at from public.invoices where id = :'invoice_id'), null, 'Relance : facture envoyée');
select is((select count(*)::integer from public.v_invoices_overview where sent_at is not null and id = :'invoice_id'), 1,
          'Liste des factures : dans « Factures envoyées »');

select * from finish();
rollback;
