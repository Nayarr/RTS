-- =============================================================================
-- Absence de quelques heures : badgeage après le créneau, retard compté depuis la fin de l'absence
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

update public.app_settings set expected_arrival = '09:00', late_tolerance = '09:05';
select (public.paris_date(now()) - 1) as day \gset

-- Alice : congés payés de 09:00 à 14:00 ; Bruno : congés toute la journée
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, start_time, end_time, status) values
  ('10000000-0000-0000-0000-0000000000a1', 'paid_leave', :'day', :'day', '09:00', '14:00', 'approved'),
  ('10000000-0000-0000-0000-0000000000b1', 'paid_leave', :'day', :'day', null, null, 'approved');

insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source) values
  ('10000000-0000-0000-0000-0000000000a1', 'in', (:'day'::date + time '14:25') at time zone 'Europe/Paris', :'day', 'kiosk'),
  ('10000000-0000-0000-0000-0000000000b1', 'in', (:'day'::date + time '14:25') at time zone 'Europe/Paris', :'day', 'kiosk');

select is((select during_leave_type from public.clock_events where technician_id = '10000000-0000-0000-0000-0000000000a1'),
          null, 'Badgeage à 14:25 après une absence jusqu''à 14:00 : pas « pendant l''absence »');
select is((select during_leave_type::text from public.clock_events where technician_id = '10000000-0000-0000-0000-0000000000b1'),
          'paid_leave', 'Absence de la journée entière : badgeage toujours signalé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select late_minutes from public.v_daily_attendance
           where technician_id = '10000000-0000-0000-0000-0000000000a1' and work_date = :'day'), 25,
          'Retard compté depuis la fin de l''absence : 25 min, pas 5 h 25');

-- Dans la tolérance (14:04) : pas de retard
reset role;
update public.clock_events set occurred_at = (:'day'::date + time '14:04') at time zone 'Europe/Paris'
where technician_id = '10000000-0000-0000-0000-0000000000a1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select late_minutes from public.v_daily_attendance
           where technician_id = '10000000-0000-0000-0000-0000000000a1' and work_date = :'day'), 0,
          'Arrivée à 14:04 : dans la tolérance de 5 minutes');

-- Badgeage pendant le créneau : toujours signalé
reset role;
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source) values
  ('10000000-0000-0000-0000-0000000000a1', 'out', (:'day'::date + time '11:00') at time zone 'Europe/Paris', :'day', 'manual');
select is((select during_leave_type::text from public.clock_events where technician_id = '10000000-0000-0000-0000-0000000000a1'
           and event_type = 'out'), 'paid_leave', 'Badgeage à 11:00 dans le créneau : signalé');

-- Sans absence : retard depuis l'heure attendue des Réglages
delete from public.leave_requests where technician_id = '10000000-0000-0000-0000-0000000000a1';
select is(public.attendance_expected_arrival('10000000-0000-0000-0000-0000000000a1', :'day'), '09:00'::time,
          'Sans absence : arrivée attendue des Réglages');

select * from finish();
rollback;
