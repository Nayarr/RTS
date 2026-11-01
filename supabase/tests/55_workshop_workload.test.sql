-- =============================================================================
-- Charge de travail atelier : déclaré, disponible (repos, congés), planifié, à planifier
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

\ir helpers/fixtures.psql

-- Semaine du lundi 28/09 au dimanche 04/10/2026 : 4 × 8 h + 7,5 h + samedi 4 h = 43,5 h
update public.app_settings set daily_hours = 8, friday_hours = 7.5, saturday_hours = 4,
  rest_reference_monday = '2026-09-28';
update public.technicians set rest_group = 'A' where display_name = 'Alice';   -- repos le lundi 28/09
update public.technicians set rest_group = 'B' where display_name = 'Bruno';
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, status)
values ('10000000-0000-0000-0000-0000000000b1', 'paid_leave', '2026-09-30', '2026-10-01', 'approved'),
       ('10000000-0000-0000-0000-0000000000b1', 'paid_leave', '2026-10-02', '2026-10-02', 'requested');

insert into public.repair_orders (id, vehicle_id, client_id, requested_work, technician_id, planned_date, planned_start, planned_end)
values
  ('50000000-0000-0000-0000-000000000551', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'Freins', '10000000-0000-0000-0000-0000000000a1', '2026-10-01', '08:00', '12:00'),
  ('50000000-0000-0000-0000-000000000552', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   'Vidange', '10000000-0000-0000-0000-0000000000a1', '2026-10-02', null, null);
select set_config('rts.system', 'on', true);  -- lignes posées directement (heures du devis)
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours, billed_hours, created_at) values
  ('50000000-0000-0000-0000-000000000551', 'done', 'labor', 'Disques avant', 2.5, null, '2026-09-30 10:00+02'),
  ('50000000-0000-0000-0000-000000000551', 'done', 'labor', 'Purge', 1.5, null, '2026-10-05 09:00+02'),
  ('50000000-0000-0000-0000-000000000552', 'done', 'labor', 'Vidange', 1, 3, '2026-10-02 15:00+02');
select set_config('rts.system', '', true);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok($$ select public.workshop_workload('2026-09-28', '2026-10-04') $$, '42501', null,
  'Réservé au bureau');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.workshop_workload('2026-09-28', '2026-10-04') as w \gset
select results_eq(
  format($$ select (t ->> 'available_hours')::numeric, (t ->> 'declared_hours')::numeric, (t ->> 'worked_orders')::int,
                   (t ->> 'planned_hours')::numeric, (t ->> 'planned_orders')::int
            from jsonb_array_elements(%L::jsonb -> 'technicians') t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1' $$, :'w'),
  $$ values (35.5, 3.5, 2, 7.0, 2) $$,
  'Alice : 43,5 h moins le lundi de repos ; 3,5 h déclarées sur 2 OR ; créneau de 4 h + 3 h prévues au devis');
select is(
  (select (t ->> 'available_hours')::numeric from jsonb_array_elements(:'w'::jsonb -> 'technicians') t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000b1'),
  27.5, 'Bruno : congés acceptés retirés, demande en attente non retirée');
select is(
  (select t ->> 'absence' from jsonb_array_elements(:'w'::jsonb -> 'technicians') t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000b1'),
  null, 'Présent une partie de la semaine : pas absent');

select public.workshop_workload('2026-09-30', '2026-09-30') as day \gset
select results_eq(
  format($$ select (t ->> 'available_hours')::numeric, t ->> 'absence', (t ->> 'declared_hours')::numeric
            from jsonb_array_elements(%L::jsonb -> 'technicians') t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000b1' $$, :'day'),
  $$ values (0::numeric, 'leave', 0::numeric) $$, 'Jour de congé : rien de disponible, absence « congés »');
select is(
  (select (t ->> 'declared_hours')::numeric from jsonb_array_elements(:'day'::jsonb -> 'technicians') t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
  2.5, 'Le temps compte le jour de sa saisie');

select public.workshop_workload('2026-09-28', '2026-09-28') as monday \gset
select is(
  (select t ->> 'absence' from jsonb_array_elements(:'monday'::jsonb -> 'technicians') t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
  'rest', 'Lundi de repos : absence « repos »');
select is(
  (select (t ->> 'available_hours')::numeric from jsonb_array_elements(:'monday'::jsonb -> 'technicians') t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000b1'),
  8::numeric, 'Groupe B : travaille ce lundi-là');

select is(
  (select t ->> 'absence' from jsonb_array_elements(public.workshop_workload('2026-10-04', '2026-10-04') -> 'technicians') t
   where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000b1'),
  'closed', 'Dimanche : atelier fermé');

-- Samedi : atelier ouvert, heures du samedi
select results_eq(
  format($$ select (t ->> 'available_hours')::numeric, t ->> 'absence'
            from jsonb_array_elements(%L::jsonb -> 'technicians') t where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1' $$,
         public.workshop_workload('2026-10-03', '2026-10-03')),
  $$ values (4::numeric, null::text) $$, 'Samedi : atelier ouvert, heures du samedi disponibles');
reset role;
update public.app_settings set saturday_hours = 0;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is(
  (select t ->> 'absence' from jsonb_array_elements(public.workshop_workload('2026-10-03', '2026-10-03') -> 'technicians') t
   where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
  'closed', 'Samedi réglé à 0 h : atelier fermé ce jour-là');
select is(
  (select t ->> 'absence' from jsonb_array_elements(public.workshop_workload('2026-10-03', '2026-10-04') -> 'technicians') t
   where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
  'closed', 'Samedi à 0 h et dimanche : week-end fermé');

-- À planifier ou en retard
select (public.workshop_workload('2026-09-28', '2026-10-04') -> 'to_plan' ->> 'orders')::int as before \gset
reset role;
insert into public.repair_orders (vehicle_id, client_id, requested_work)
values ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Sans date');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((public.workshop_workload('2026-09-28', '2026-10-04') -> 'to_plan' ->> 'orders')::int, :before + 1,
  'Un OR sans date ni technicien est à planifier');

select throws_ok($$ select public.workshop_workload('2026-10-04', '2026-09-28') $$, '22023', 'Période invalide',
  'Fin avant le début : refusé');
select throws_ok($$ select public.workshop_workload('2026-01-01', '2026-12-31') $$, '22023', 'Période invalide',
  'Plus de deux mois : refusé');

select * from finish();
rollback;
