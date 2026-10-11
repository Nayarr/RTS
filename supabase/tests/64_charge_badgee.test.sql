-- =============================================================================
-- Charge de travail atelier : présence badgée (réception comprise), détail des heures
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

select public.paris_date(now()) - 1 as yesterday \gset
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, planned_date) values
  ('50000000-0000-0000-0000-000000000064', '30000000-0000-0000-0000-000000000001', 'Freins',
   '10000000-0000-0000-0000-0000000000a1', :'yesterday');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours, created_at) values
  ('50000000-0000-0000-0000-000000000064', 'done', 'labor', 'Remplacement plaquettes
détail', 6, (:'yesterday'::date + time '11:00') at time zone 'Europe/Paris');
-- Présence d'Alice hier : 8 h badgées pour 6 h déclarées
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source) values
  ('10000000-0000-0000-0000-0000000000a1', 'in', (:'yesterday'::date + time '08:00') at time zone 'Europe/Paris', :'yesterday', 'kiosk'),
  ('10000000-0000-0000-0000-0000000000a1', 'out', (:'yesterday'::date + time '16:00') at time zone 'Europe/Paris', :'yesterday', 'kiosk');

-- ---------------------------------------------------------------- Réception
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.workshop_workload(:'yesterday', :'yesterday') -> 'technicians' as techs \gset
select is((select (t ->> 'clocked_hours')::numeric from jsonb_array_elements(:'techs'::jsonb) t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
          8.00, 'Réception : présence badgée d''Alice visible (8 h)');
select is((select (t ->> 'declared_hours')::numeric from jsonb_array_elements(:'techs'::jsonb) t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
          6::numeric, 'Temps déclaré sur les OR : 6 h (écart de 2 h)');

select public.workshop_workload_detail('10000000-0000-0000-0000-0000000000a1', :'yesterday', :'yesterday') as detail \gset
select is(:'detail'::jsonb #>> '{declared,0,description}', 'Remplacement plaquettes', 'Détail : travaux déclarés (première ligne)');
select is((:'detail'::jsonb #>> '{declared,0,hours}')::numeric, 6::numeric, 'Détail : heures de la ligne');
select is(jsonb_array_length(:'detail'::jsonb -> 'planned'), 1, 'Détail : OR planifié sur la période');

-- ---------------------------------------------------------------- Technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.workshop_workload_detail('10000000-0000-0000-0000-0000000000a1', current_date, current_date) $$,
                 '42501', null, 'Technicien : détail des heures refusé');

select * from finish();
rollback;
