-- =============================================================================
-- Kilométrage de la facture : suit l'OR tant que la facture est en brouillon, figé à l'émission
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000000156', 'OR90156', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Vidange', 'to_invoice');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours, unit_price, quantity) values
  ('50000000-0000-0000-0000-000000000156', 'done', 'labor', 'Vidange', 1, 90, 1);
set local session_replication_role = origin;

-- Brouillon créé avant que le kilométrage soit saisi
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000156']::uuid[]) as invoice_id \gset
select is((select mileage from public.invoices where id = :'invoice_id'), null, 'Brouillon sans kilométrage');

-- Kilométrage saisi ensuite sur l'OR : le brouillon le reprend
update public.repair_orders set mileage = 184320 where id = '50000000-0000-0000-0000-000000000156';
select is((select mileage from public.invoices where id = :'invoice_id'), 184320, 'Le brouillon suit le kilométrage de l''OR');

-- Correction juste avant l'émission : la facture émise porte le dernier kilométrage
update public.repair_orders set mileage = 184400 where id = '50000000-0000-0000-0000-000000000156';
select public.issue_invoice(:'invoice_id');
select is((select mileage from public.invoices where id = :'invoice_id'), 184400, 'Facture émise avec le kilométrage');
select public.share_invoice(:'invoice_id') as token \gset
reset role;
select ok(public.public_get_document(:'token')::text like '%"mileage": 184400%',
          'Le client voit le kilométrage sur sa facture en ligne');

select * from finish();
rollback;
