-- =============================================================================
-- Dates du jour de Paris : paiement sans date, date de prestation à l'émission (comme l'échéance)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

select col_default_is('public', 'payments', 'paid_on', 'paris_date(now())',
                      'Date du paiement par défaut : jour de Paris');

-- Facture d'un client comptant émise sans date de prestation
update public.clients set account_type = 'comptant' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000001121', '30000000-0000-0000-0000-000000000001', 'Freinage');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000001121', 'done', 'labor', 'Contrôle freinage', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000001121'::uuid]) as draft \gset
select lives_ok(format('select public.issue_invoice(%L)', :'draft'), 'Facture émise');
reset role;
select is((select service_date from public.invoices where id = :'draft'), public.paris_date(now()),
          'Date de prestation : jour de Paris');
select is((select due_date from public.invoices where id = :'draft'), public.paris_date(now()),
          'Client comptant : échéance le jour de Paris, comme un paiement du jour');

select * from finish();
rollback;
