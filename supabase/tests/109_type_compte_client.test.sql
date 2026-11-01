-- =============================================================================
-- Type de compte du client : échéance de la facture (comptant, prélèvement le 5 ou le 15, quinzaine)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- Échéance calculée
select is(public.invoice_due_date('comptant', null, '2027-03-08', 30), '2027-03-08'::date,
          'Comptant : échéance le jour de la facture');
select is(public.invoice_due_date('prelevement', 5::smallint, '2027-03-03', 30), '2027-03-05'::date,
          'Prélèvement le 5 : facture du 3, prélevée le 5');
select is(public.invoice_due_date('prelevement', 5::smallint, '2027-03-08', 30), '2027-04-05'::date,
          'Prélèvement le 5 : facture du 8, prélevée le 5 du mois suivant');
select is(public.invoice_due_date('prelevement', 15::smallint, '2027-12-20', 30), '2028-01-15'::date,
          'Prélèvement le 15 : facture du 20 décembre, prélevée le 15 janvier');
select is(public.invoice_due_date('quinzaine', null, '2027-03-15', 30), '2027-03-15'::date,
          'Quinzaine : facture du 1er au 15, réglée le 15');
select is(public.invoice_due_date('quinzaine', null, '2027-03-16', 30), '2027-04-01'::date,
          'Quinzaine : facture du 16 à la fin du mois, réglée le 1er du mois suivant');
select is(public.invoice_due_date('prelevement', null, '2027-03-08', 30), '2027-04-07'::date,
          'Prélèvement sans jour précisé : délai de paiement des réglages');

-- Fiche client
select throws_ok($$ update public.clients set direct_debit_day = 10
                    where id = '20000000-0000-0000-0000-000000000001' $$, '23514', null,
                 'Prélèvement le 5 ou le 15 seulement');
select throws_ok($$ update public.clients set account_type = 'comptant', direct_debit_day = 5
                    where id = '20000000-0000-0000-0000-000000000001' $$, '23514', null,
                 'Jour de prélèvement réservé aux clients en prélèvement');

-- Émission : échéance du type de compte
update public.clients set account_type = 'quinzaine' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000001091', '30000000-0000-0000-0000-000000000001', 'Freinage');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000001091', 'done', 'labor', 'Contrôle freinage', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000001091'::uuid]) as draft \gset
select lives_ok(format('select public.issue_invoice(%L)', :'draft'), 'Facture émise');
reset role;
select is((select due_date from public.invoices where id = :'draft'),
          public.invoice_due_date('quinzaine', null, public.paris_date(now()), 30),
          'Client à quinzaine : échéance le 15 ou le 1er');

select * from finish();
rollback;
