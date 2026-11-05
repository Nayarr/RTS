-- =============================================================================
-- Planning sur plusieurs jours : véhicule qui commence le soir et finit le lendemain matin
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- Rendez-vous de nuit
select (public.save_appointment('Transports Nuit', 'NU-123-IT', 'pl', '2026-11-04', '20:00', '08:00',
                                'Boîte', null, null, null, '2026-11-05')).id as appt_id \gset
select results_eq(
  format($$ select scheduled_date, start_time, end_date, end_time from public.appointments where id = %L $$, :'appt_id'),
  $$ values ('2026-11-04'::date, '20:00'::time, '2026-11-05'::date, '08:00'::time) $$,
  'Rendez-vous de 20 h au lendemain 8 h');

select is((select end_date from public.v_appointments_overview where id = :'appt_id'), '2026-11-05'::date,
          'Date de fin lue dans la vue des rendez-vous');

select throws_ok($$ select public.save_appointment('X', '', 'pl', '2026-11-04', '20:00', '08:00') $$,
                 '22023', 'L''heure de fin doit être après l''heure de début', 'Même jour : la fin reste après le début');
select throws_ok($$ select public.save_appointment('X', '', 'pl', '2026-11-04', '20:00', '08:00', null, null, null, null, '2026-11-03') $$,
                 '22023', 'La date de fin doit être après la date de début', 'Date de fin avant la date de début refusée');
select throws_ok($$ select public.save_appointment('X', '', 'pl', '2026-11-04', '20:00', null, null, null, null, null, '2026-11-05') $$,
                 '22023', 'Indique l''heure de fin', 'Date de fin sans heure refusée');
select is((public.save_appointment('X', '', 'pl', '2026-11-04', '09:00', '10:00', null, null, null, null, '2026-11-04')).end_date,
          null::date, 'Date de fin égale au début : créneau d''une journée');

-- L'OR créé à l'arrivée garde le créneau
select public.create_repair_order_from_appointment(:'appt_id') as ro_id \gset
select results_eq(
  format($$ select planned_date, planned_start, planned_end_date, planned_end from public.v_repair_orders_overview where id = %L $$, :'ro_id'),
  $$ values ('2026-11-04'::date, '20:00'::time, '2026-11-05'::date, '08:00'::time) $$,
  'OR créé depuis le rendez-vous : même créneau');

-- Nouvel OR
select (public.create_repair_order('NU-123-IT', 'pl', '', 'Freins', null, null, '2026-11-06', '19:00', '07:30',
                                   null, false, '2026-11-07')).id as ro2_id \gset
select is((select planned_end_date from public.repair_orders where id = :'ro2_id'), '2026-11-07'::date,
          'Nouvel OR sur deux jours');
select throws_ok($$ select public.create_repair_order('NU-123-IT', 'pl', '', 'Freins', null, null, '2026-11-06', '19:00', '07:30') $$,
                 '22023', 'L''heure de fin doit être après l''heure de début', 'Nouvel OR : sans date de fin, 19 h - 7 h refusé');
select throws_ok($$ select public.create_repair_order('NU-123-IT', 'pl', '', 'Freins', null, null, '2026-11-06', null, null, null, false, '2026-11-07') $$,
                 '22023', 'Indique les heures de début et de fin', 'Nouvel OR : date de fin sans heures refusée');

-- OR déplacé : la date de fin n'a plus de sens, elle est retirée avec l'heure devenue incohérente
update public.repair_orders set planned_date = '2026-11-07' where id = :'ro2_id';
select results_eq(
  format($$ select planned_end_date, planned_end from public.repair_orders where id = %L $$, :'ro2_id'),
  $$ values (null::date, null::time) $$,
  'OR déplacé au jour de fin : créneau remis sur une journée');

-- Contrôle direct de la table
select throws_ok(
  format($$ update public.repair_orders set planned_start = '19:00', planned_end = '07:30' where id = %L $$, :'ro2_id'),
  '23514', null, 'Table : 19 h - 7 h refusé sans date de fin');

-- Planning : un OR de la veille est retrouvé par sa date de fin
select is(
  (select count(*) from public.v_repair_orders_overview
   where id = :'ro_id' and planned_date <= '2026-11-05' and (planned_date >= '2026-11-05' or planned_end_date >= '2026-11-05')),
  1::bigint, 'OR de la veille retrouvé le jour de sa fin');

-- Rendez-vous converti : date de fin figée
select throws_ok(
  format($$ update public.appointments set end_date = '2026-11-08' where id = %L $$, :'appt_id'),
  'P0001', 'Ce rendez-vous n''est plus modifiable', 'Date de fin figée après la conversion en OR');

-- Agent Direction : la date changée remet le créneau sur une journée
select ok(
  (select prosrc like '%planned_end_date = null%' from pg_proc where proname = 'execute_agent_action'),
  'Agent : date de l''OR changée, date de fin retirée');
select ok(
  (select prosrc like '%end_date = case when v_payload ? ''date'' then null else end_date end%'
   from pg_proc where proname = 'execute_agent_action'),
  'Agent : date du rendez-vous changée, date de fin retirée');

select * from finish();
rollback;
