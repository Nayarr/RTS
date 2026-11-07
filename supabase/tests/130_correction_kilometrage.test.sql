-- =============================================================================
-- Correction du kilométrage saisi par le technicien : historique, facture en brouillon, OR facturé
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status, mileage) values
  ('50000000-0000-0000-0000-000000001301', 'OR91301', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Vidange', 'work_done', 1234567);
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, unit_price, quantity)
values ('50000000-0000-0000-0000-000000001301', 'done', 0, 'labor', 'Vidange', 1, 90, 1);
set local session_replication_role = origin;

-- Facture en brouillon : reprend le kilométrage corrigé
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000001301'::uuid]) as invoice \gset
select is((select mileage from public.invoices where id = :'invoice'), 1234567, 'Brouillon : kilométrage du technicien');
update public.repair_orders set mileage = 123456 where id = '50000000-0000-0000-0000-000000001301';
select is((select mileage from public.invoices where id = :'invoice'), 123456, 'Brouillon : kilométrage corrigé repris');
select is((select label from public.ro_events
           where repair_order_id = '50000000-0000-0000-0000-000000001301' and label like 'Kilométrage%'),
          'Kilométrage : 1 234 567 km → 123 456 km', 'Correction notée dans l''historique de l''OR');

-- Facture émise : OR facturé
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select public.issue_invoice(:'invoice');
select is((select status::text from public.repair_orders where id = '50000000-0000-0000-0000-000000001301'), 'invoiced',
          'OR facturé');

-- Réception : l'OR facturé reste verrouillé
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_like($$ update public.repair_orders set mileage = 123999 where id = '50000000-0000-0000-0000-000000001301' $$,
                   '%OR facturé%', 'Réception : kilométrage d''un OR facturé non modifiable');

-- Direction : corrige encore le kilométrage, rien d'autre
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ update public.repair_orders set mileage = 124000 where id = '50000000-0000-0000-0000-000000001301' $$,
                'Direction : kilométrage d''un OR facturé corrigé');
select is((select mileage from public.repair_orders where id = '50000000-0000-0000-0000-000000001301'), 124000,
          'Kilométrage corrigé enregistré');
select is((select mileage from public.invoices where id = :'invoice'), 123456,
          'Facture émise : son kilométrage ne change pas');
select throws_like($$ update public.repair_orders set requested_work = 'Autre' where id = '50000000-0000-0000-0000-000000001301' $$,
                   '%OR facturé%', 'Direction : le reste de l''OR facturé reste verrouillé');

select * from finish();
rollback;
