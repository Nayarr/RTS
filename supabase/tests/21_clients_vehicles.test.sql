-- =============================================================================
-- Fiches clients et véhicules
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Données
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work, mileage, created_at) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins', 180000, '2026-06-01 08:00+02'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Vidange', null, '2026-09-01 08:00+02'),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'Pneus', 50000, '2026-08-01 08:00+02');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000001', 'done', 'labor', 'Plaquettes', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]) as invoice_id \gset
select public.issue_invoice(:'invoice_id');
insert into public.payments (invoice_id, amount_ttc, method) values (:'invoice_id', 100, 'card');

-- ---------------------------------------------------------------- Vues
select results_eq(
  $$ select vehicles_count, orders_count, last_visit, revenue_ht, balance_due, overdue_invoices_count
     from public.v_clients_overview where id = '20000000-0000-0000-0000-000000000001' $$,
  $$ values (2::bigint, 3::bigint, '2026-09-01 08:00+02'::timestamptz, 180.00::numeric, 116.00::numeric, 0::bigint) $$,
  'Client : véhicules, OR, dernière visite, CA HT et reste dû des factures émises');
select results_eq(
  $$ select vehicles_count, orders_count, revenue_ht, balance_due
     from public.v_clients_overview where id = '20000000-0000-0000-0000-000000000002' $$,
  $$ values (1::bigint, 0::bigint, 0::numeric, 0::numeric) $$,
  'Client sans OR ni facture');
select results_eq(
  $$ select client_name, orders_count, last_mileage from public.v_vehicles_overview
     where id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('Transports Dupont', 2::bigint, 180000) $$,
  'Véhicule : client, passages, dernier kilométrage relevé');

-- ---------------------------------------------------------------- Conditions commerciales
select lives_ok($$ update public.clients set email = 'atelier@dupont.fr', phone = '0102030405'
                   where id = '20000000-0000-0000-0000-000000000001' $$,
                'La réception met à jour les coordonnées');
select throws_ok($$ update public.clients set discount_percent = 10 where id = '20000000-0000-0000-0000-000000000001' $$,
                 '42501', 'Remise et taux horaire du client : réservés à la direction', 'La réception ne fixe pas la remise');
select throws_ok($$ insert into public.clients (name, hourly_rate) values ('Nouveau', 70) $$,
                 '42501', null, 'Ni le taux horaire d''un nouveau client');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select lives_ok($$ update public.clients set discount_percent = 10, hourly_rate = 85
                   where id = '20000000-0000-0000-0000-000000000001' $$,
                'La direction fixe remise et taux horaire');
select is(public.labor_rate_for('20000000-0000-0000-0000-000000000001', 'pl'), 85.00::numeric,
          'Le taux horaire du client s''applique à la main d''œuvre');

-- ---------------------------------------------------------------- Carte grise
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok(format($$ update public.vehicles set registration_doc_file_id = %L
                           where id = '30000000-0000-0000-0000-000000000001' $$, pg_temp.fake_file('ro_photo')),
                 '22023', null, 'La carte grise doit être un document de la bonne catégorie');
select lives_ok(format($$ update public.vehicles set registration_doc_file_id = %L, brand = 'Renault', vin = 'VF1ABC'
                          where id = '30000000-0000-0000-0000-000000000001' $$, pg_temp.fake_file('registration_doc')),
                'Carte grise et identification enregistrées');

select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.v_clients_overview $$, '42501', null, 'Un visiteur ne lit pas les clients');

select * from finish();
rollback;
