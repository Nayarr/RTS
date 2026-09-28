-- =============================================================================
-- Pilotage : rentabilité par client / véhicule, performance des techniciens
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Données (hors règles métier)
select public.paris_date(now()) as today \gset

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, technician_id, created_at) values
  ('50000000-0000-0000-0000-000000000001', 'OR90001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Freins', '10000000-0000-0000-0000-0000000000a1', now() - interval '2 days'),
  ('50000000-0000-0000-0000-000000000002', 'OR90002', '30000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 'vul', 'Vidange', '10000000-0000-0000-0000-0000000000b1', now() - interval '410 days');
-- Estimation du technicien : 2 h ; badgé : 3 h hier
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000001', 'planned', 'labor', 'Disques', 2);
insert into public.time_entries (repair_order_id, technician_id, started_at, ended_at) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000a1',
   ((:'today'::date - 1) + time '09:00') at time zone 'Europe/Paris',
   ((:'today'::date - 1) + time '12:00') at time zone 'Europe/Paris');
-- Présence d'Alice hier : 8 h
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source) values
  ('10000000-0000-0000-0000-0000000000a1', 'in', ((:'today'::date - 1) + time '08:00') at time zone 'Europe/Paris', :'today'::date - 1, 'kiosk'),
  ('10000000-0000-0000-0000-0000000000a1', 'out', ((:'today'::date - 1) + time '16:00') at time zone 'Europe/Paris', :'today'::date - 1, 'kiosk');

insert into public.invoices (id, number, status, client_id, client_name, issued_at, due_date, total_ht, total_vat, total_ttc) values
  ('80000000-0000-0000-0000-00000000000a', 'F90001', 'issued', '20000000-0000-0000-0000-000000000001', 'Transports Dupont',
   now(), :'today'::date + 30, 500, 100, 600),
  ('80000000-0000-0000-0000-00000000000b', 'F90002', 'issued', '20000000-0000-0000-0000-000000000002', 'Logistique Martin',
   now() - interval '400 days', :'today'::date - 370, 100, 20, 120);
insert into public.invoice_repair_orders (invoice_id, repair_order_id) values
  ('80000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000002');
insert into public.invoice_lines (invoice_id, repair_order_id, line_type, description, unit_price, quantity, billed_hours, purchase_price) values
  ('80000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'labor', 'Disques', 300, 1, 3, null),
  -- Ligne ajoutée à la main (sans OR) : rattachée à l'unique OR de la facture
  ('80000000-0000-0000-0000-00000000000a', null, 'part', 'Disque', 200, 1, null, 120),
  ('80000000-0000-0000-0000-00000000000b', '50000000-0000-0000-0000-000000000002', 'labor', 'Vidange', 100, 1, 1, null);
insert into public.payments (invoice_id, amount_ttc, method, paid_on)
values ('80000000-0000-0000-0000-00000000000b', 120, 'cash', :'today'::date - 380);
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Rentabilité
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction

select results_eq(
  format($$ select client_name, plate, ro_count, labor_ht, parts_ht, parts_margin_ht, billed_hours, worked_hours, client_unpaid_ttc
            from public.profitability_report(%L, %L)
            where client_id in ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002') $$,
         :'today'::date - 7, :'today'::date + 1),
  $$ values ('Transports Dupont', 'AB-123-CD', 1::bigint, 300::numeric, 200::numeric, 80::numeric, 3::numeric, 3::numeric, 600::numeric) $$,
  'Période : CA, marge pièces (ligne sans OR rattachée), heures facturées / badgées, impayés du client');
select results_eq(
  $$ select client_name from public.profitability_report()
     where client_id in ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002') $$,
  $$ values ('Transports Dupont'), ('Logistique Martin') $$,
  'Sans période : tous les OR facturés, du plus gros CA au plus petit');

-- ---------------------------------------------------------------- Performance
select results_eq(
  format($$ select name, labor_ht, ro_count, billed_hours, worked_hours, presence_hours, estimate_deviation_percent, average_lead_days
            from public.technician_performance(%L, %L)
            where technician_id = '10000000-0000-0000-0000-0000000000a1' $$,
         :'today'::date - 7, :'today'::date + 1),
  $$ values ('Alice', 300::numeric, 1::bigint, 3::numeric, 3::numeric, 8::numeric, 33.3::numeric, 2.0::numeric) $$,
  'Alice : CA MO, heures facturées, badgées, présence, écart d''estimation, délai moyen');
select results_eq(
  format($$ select labor_ht, ro_count, worked_hours, presence_hours, estimate_deviation_percent, average_lead_days
            from public.technician_performance(%L, %L)
            where technician_id = '10000000-0000-0000-0000-0000000000b1' $$,
         :'today'::date - 7, :'today'::date + 1),
  $$ values (0::numeric, 0::bigint, 0::numeric, null::numeric, null::numeric, null::numeric) $$,
  'Bruno : rien sur la période (facture hors période, pas de pointage)');
select is((select ro_count from public.technician_performance() where technician_id = '10000000-0000-0000-0000-0000000000b1'),
          1::bigint, 'Sans période : l''OR de Bruno est compté');

update public.technicians set is_active = false where id = '10000000-0000-0000-0000-0000000000b1';
select is((select count(*) from public.technician_performance() where technician_id = '10000000-0000-0000-0000-0000000000b1'),
          0::bigint, 'Technicien désactivé : absent');

-- ---------------------------------------------------------------- Réservé à la direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select * from public.profitability_report() $$, '42501', null, 'La réception ne voit pas la rentabilité');
select throws_ok($$ select * from public.technician_performance() $$, '42501', null,
                 'La réception ne voit pas la performance');

select * from finish();
rollback;
