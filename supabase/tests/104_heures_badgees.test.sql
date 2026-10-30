-- =============================================================================
-- Charge de travail atelier : chrono des OR compté dans « Badgé », coupé à la période
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

\ir helpers/fixtures.psql

select public.paris_date(now()) - 2 as before \gset
select public.paris_date(now()) - 1 as yesterday \gset
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id) values
  ('50000000-0000-0000-0000-000000000104', '30000000-0000-0000-0000-000000000001', 'Freins',
   '10000000-0000-0000-0000-0000000000a1');
set local session_replication_role = replica;
-- Chrono d'Alice : 2 h 30 hier, et une nuit à cheval (22 h avant-hier à 1 h hier : 1 h hier)
insert into public.time_entries (repair_order_id, technician_id, started_at, ended_at) values
  ('50000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-0000000000a1',
   (:'yesterday'::date + time '09:00') at time zone 'Europe/Paris', (:'yesterday'::date + time '11:30') at time zone 'Europe/Paris'),
  ('50000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-0000000000a1',
   (:'before'::date + time '22:00') at time zone 'Europe/Paris', (:'yesterday'::date + time '01:00') at time zone 'Europe/Paris');
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.workshop_workload(:'yesterday', :'yesterday') -> 'technicians' as techs \gset
select is((select (t ->> 'badged_hours')::numeric from jsonb_array_elements(:'techs'::jsonb) t
           where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
          3.50, 'Chrono des OR d''hier : 2 h 30 plus l''heure après minuit');
select is((select (t ->> 'clocked_hours')::numeric from jsonb_array_elements(:'techs'::jsonb) t
           where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
          0.00, 'Sans pointage à la borne : présence à 0 h');

select public.workshop_workload(:'before', :'yesterday') -> 'technicians' as techs \gset
select is((select (t ->> 'badged_hours')::numeric from jsonb_array_elements(:'techs'::jsonb) t
           where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
          5.50, 'Sur deux jours : tout le chrono');

select * from finish();
rollback;
