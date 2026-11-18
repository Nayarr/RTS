-- =============================================================================
-- Borne : retour de pause badgeable 5 minutes avant la fin de pause des Réglages (13 h 55 pour 14 h),
-- sinon 59 minutes après le départ en pause. Pas de retard compté pour un retour de pause.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Heure de retour possible
update public.app_settings set lunch_end = '14:00';
select results_eq(
  $$ select to_char(public.kiosk_pause_until(t::timestamptz, '2026-11-18') at time zone 'Europe/Paris', 'HH24:MI')
     from (values ('2026-11-18 13:00 Europe/Paris'), ('2026-11-18 13:30 Europe/Paris'),
                  ('2026-11-18 13:54 Europe/Paris')) v(t) $$,
  $$ values ('13:55'), ('13:55'), ('13:55') $$,
  'Pause commencée avant 13 h 55 : retour possible à 13 h 55');
select is(to_char(public.kiosk_pause_until('2026-11-18 12:00 Europe/Paris', '2026-11-18') at time zone 'Europe/Paris',
                  'HH24:MI'),
          '12:59', 'Pause prise tôt : retour possible après 59 minutes, avant 13 h 55');
select results_eq(
  $$ select to_char(public.kiosk_pause_until(t::timestamptz, '2026-11-18') at time zone 'Europe/Paris', 'HH24:MI')
     from (values ('2026-11-18 13:55 Europe/Paris'), ('2026-11-18 14:30 Europe/Paris')) v(t) $$,
  $$ values ('14:54'), ('15:29') $$,
  'Pause commencée à 13 h 55 ou après : 59 minutes');
select is(to_char(public.kiosk_pause_until('2026-07-15 13:00 Europe/Paris', '2026-07-15') at time zone 'Europe/Paris',
                  'HH24:MI'),
          '13:55', 'Heure d''été : 13 h 55 heure de Paris');
update public.app_settings set lunch_end = '13:30';
select is(to_char(public.kiosk_pause_until('2026-11-18 12:30 Europe/Paris', '2026-11-18') at time zone 'Europe/Paris',
                  'HH24:MI'),
          '13:25', 'Fin de pause réglée à 13 h 30 : retour possible à 13 h 25');

-- ---------------------------------------------------------------- Borne
-- Fiches qui badgent, arrivées ce matin, sans retard possible (tolérance à 23:59)
update public.app_settings set earliest_clock_in = '00:00', expected_arrival = '00:00', late_tolerance = '23:59';
insert into public.technicians (id, display_name) values
  ('10000000-0000-0000-0000-000000000160', 'Ines'),
  ('10000000-0000-0000-0000-000000000161', 'Jules'),
  ('10000000-0000-0000-0000-000000000162', 'Karim');
insert into public.technician_pins (technician_id, pin_hash, algorithm)
select id, extensions.crypt(pin, extensions.gen_salt('bf', 4)), 'bcrypt'
from (values ('10000000-0000-0000-0000-000000000160'::uuid, '1601'), ('10000000-0000-0000-0000-000000000161', '1611'),
             ('10000000-0000-0000-0000-000000000162', '1621')) as p(id, pin);
set local session_replication_role = replica;
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source) values
  -- Ines et Jules : partis en pause il y a 10 minutes
  ('10000000-0000-0000-0000-000000000160', 'in',  now() - interval '4 hours',    public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-000000000160', 'out', now() - interval '10 minutes', public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-000000000161', 'in',  now() - interval '4 hours',    public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-000000000161', 'out', now() - interval '10 minutes', public.paris_date(now()), 'kiosk'),
  -- Karim : arrivé ce matin
  ('10000000-0000-0000-0000-000000000162', 'in',  now() - interval '3 hours',    public.paris_date(now()), 'kiosk');
set local session_replication_role = origin;

-- Fin de pause dans 30 minutes : retour possible dans 25 minutes (et non 49)
update public.app_settings set lunch_end = ((now() + interval '30 minutes') at time zone 'Europe/Paris')::time;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.kiosk_clock('1601', pg_temp.fake_file('clock_photo')) ->> 'message',
          'Pause en cours (Ines) : re-badge possible dans 25 min.',
          'Avant la fin de pause - 5 min : refus avec le temps restant jusqu''à cette heure');
select results_eq(
  $$ select r ->> 'event_type',
            (r ->> 'pause_until')::timestamptz between now() + interval '24 minutes' and now() + interval '26 minutes'
     from (select public.kiosk_clock('1621', pg_temp.fake_file('clock_photo')) as r) x $$,
  $$ values ('out', true) $$,
  'Départ en pause : heure de retour affichée = fin de pause - 5 min');
reset role;

-- Fin de pause dans 3 minutes : 5 minutes avant, le retour est badgé après 10 minutes de pause
update public.app_settings set lunch_end = ((now() + interval '3 minutes') at time zone 'Europe/Paris')::time;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.kiosk_clock('1601', pg_temp.fake_file('clock_photo')) ->> 'event_type', 'in',
          'Dans les 5 minutes avant la fin de pause : retour de pause badgé');
reset role;
select is((select count(*)::int from public.clock_events where technician_id = '10000000-0000-0000-0000-000000000160'),
          3, 'Retour de pause enregistré');
select ok(exists (select 1 from public.notifications where type = 'clock_in'
                  and title like 'Retour de pause : Ines __:__'),
          'Direction notifiée du retour de pause');

-- Retour de pause avant l'heure de reprise : pas de retard (seule la 1re arrivée du jour compte)
select is((select late_minutes from public.v_daily_attendance
           where technician_id = '10000000-0000-0000-0000-000000000160' and work_date = public.paris_date(now())),
          0, 'Retour de pause avant la reprise : pas de retard');
select is((select count(*)::int from public.notifications where type = 'late_arrival' and title like '%Ines%'), 0,
          'Retour de pause : pas de notification de retard');

-- Pause dépassée : alerte inchangée, toujours 1 h 05 après le départ (pas 1 h 05 après 13 h 55)
select public.attendance_alerts();
select is((select count(*)::int from public.notifications where type = 'pause_overrun' and title like '%Jules%'), 0,
          'Pause de 10 minutes : pas d''alerte de pause dépassée');

select * from finish();
rollback;
