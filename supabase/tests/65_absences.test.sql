-- =============================================================================
-- Absences de quelques heures : un seul jour, sans chevauchement, retirées du disponible
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

-- Un mardi
select '2026-10-13'::date as day \gset

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice
select is((public.save_leave_request('other', :'day', :'day', 'Médecin', null, '13:30', '18:00')).start_time,
          '13:30'::time, 'Demande d''absence d''un après-midi');
select throws_ok(format($$ select public.save_leave_request('other', %L, %L, null, null, '15:00', '16:00') $$, :'day', :'day'),
                 '23P01', null, 'Deux absences qui se chevauchent le même jour : refusé');
select lives_ok(format($$ select public.save_leave_request('training', %L, %L, null, null, '08:00', '10:00') $$, :'day', :'day'),
                'Une autre plage le même jour : acceptée');
select throws_ok(format($$ select public.save_leave_request('other', %L, %L, null, null, '10:00', '09:00') $$, :'day', :'day'),
                 '22023', null, 'Fin avant le début : refusé');
select throws_ok(format($$ select public.save_leave_request('other', %L, %L::date + 1, null, null, '10:00', '12:00') $$, :'day', :'day'),
                 '22023', null, 'Quelques heures sur plusieurs jours : refusé');

-- ---------------------------------------------------------------- Direction : validation et charge
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.decide_leave_request(id, true) from public.leave_requests
 where technician_id = '10000000-0000-0000-0000-0000000000a1' and starts_on = :'day';
select is((select (t ->> 'available_hours')::numeric
           from jsonb_array_elements(public.workshop_workload(:'day', :'day') -> 'technicians') t
           where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
          (select daily_hours - 6.5 from public.app_settings),
          'Disponible du jour : 6,5 h d''absence retirées');
select is((select (t ->> 'absence') from jsonb_array_elements(public.workshop_workload(:'day', :'day') -> 'technicians') t
           where t ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1'),
          null, 'Absence de quelques heures : le technicien n''est pas compté absent');

select * from finish();
rollback;
