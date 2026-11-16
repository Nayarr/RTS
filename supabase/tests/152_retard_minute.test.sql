-- =============================================================================
-- Retard en minutes entières écoulées : 14:25:40 pour 14:00 donne 25 min, pas 26
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

\ir helpers/fixtures.psql

update public.app_settings set expected_arrival = '09:00', late_tolerance = '09:05';
select (public.paris_date(now()) - 1) as day \gset

-- Alice : absence jusqu'à 14:00, arrivée à 14:25:40 ; Bruno : arrivée à 09:10:50 sans absence
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, start_time, end_time, status) values
  ('10000000-0000-0000-0000-0000000000a1', 'paid_leave', :'day', :'day', '09:00', '14:00', 'approved');
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source) values
  ('10000000-0000-0000-0000-0000000000a1', 'in', (:'day'::date + time '14:25:40') at time zone 'Europe/Paris', :'day', 'kiosk'),
  ('10000000-0000-0000-0000-0000000000b1', 'in', (:'day'::date + time '09:10:50') at time zone 'Europe/Paris', :'day', 'kiosk');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select late_minutes from public.v_daily_attendance
           where technician_id = '10000000-0000-0000-0000-0000000000a1' and work_date = :'day'), 25,
          '14:25:40 pour 14:00 : 25 min de retard');
select is((select late_minutes from public.v_daily_attendance
           where technician_id = '10000000-0000-0000-0000-0000000000b1' and work_date = :'day'), 10,
          '09:10:50 pour 09:00 : 10 min de retard');

reset role;
update public.clock_events set occurred_at = (:'day'::date + time '09:04:59') at time zone 'Europe/Paris'
 where technician_id = '10000000-0000-0000-0000-0000000000b1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select late_minutes from public.v_daily_attendance
           where technician_id = '10000000-0000-0000-0000-0000000000b1' and work_date = :'day'), 0,
          'Dans la tolérance : pas de retard');

select * from finish();
rollback;
