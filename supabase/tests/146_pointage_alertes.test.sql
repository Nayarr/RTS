-- =============================================================================
-- Pointage : 59 minutes de pause après le 2e badgeage, notifications à la direction (badgeage,
-- retard, pas encore arrivé, pause de plus de 1 h 05)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

\ir helpers/fixtures.psql

-- Jours ouvrés de test : samedi travaillé, tolérance à minuit passé (tout badgeage est en retard)
update public.app_settings set saturday_hours = 4, expected_arrival = '00:00', late_tolerance = '00:00:01',
                               rest_reference_monday = '2026-11-09',
                               -- Fin de pause à 00:05 : le retour possible à 5 minutes de la reprise
                               -- (160_retour_pause) ne raccourcit pas les 59 minutes testées ici
                               lunch_end = '00:05';
-- Les vérifications « jour travaillé » dépendent du jour où le test tourne : le dimanche est fermé
select extract(isodow from public.paris_date(now())) <> 7 as open_today \gset

-- ---------------------------------------------------------------- Jours non travaillés
update public.technicians set rest_group = 'A' where id = '10000000-0000-0000-0000-0000000000a1';
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, status)
values ('10000000-0000-0000-0000-0000000000b1', 'paid_leave', '2026-11-17', '2026-11-17', 'approved');
select results_eq(
  $$ values (public.attendance_day_off('10000000-0000-0000-0000-0000000000a1', '2026-11-15'),
             public.attendance_day_off('10000000-0000-0000-0000-0000000000a1', '2026-11-09'),
             public.attendance_day_off('10000000-0000-0000-0000-0000000000a1', '2026-11-16'),
             public.attendance_day_off('10000000-0000-0000-0000-0000000000a1', '2026-11-14'),
             public.attendance_day_off('10000000-0000-0000-0000-0000000000b1', '2026-11-17')) $$,
  $$ values (true, true, false, false, true) $$,
  'Dimanche, lundi de repos, lundi travaillé, samedi ouvert, congé validé');
update public.technicians set rest_group = null where id = '10000000-0000-0000-0000-0000000000a1';
delete from public.leave_requests where technician_id = '10000000-0000-0000-0000-0000000000b1';

-- Fiches qui badgent (avec un code PIN)
insert into public.technicians (id, display_name) values
  ('10000000-0000-0000-0000-000000000c46', 'Carl'),
  ('10000000-0000-0000-0000-000000000d46', 'Dan'),
  ('10000000-0000-0000-0000-000000000e46', 'Eve'),
  ('10000000-0000-0000-0000-000000000f46', 'Frank'),
  ('10000000-0000-0000-0000-000000000146', 'Gina'),
  ('10000000-0000-0000-0000-000000000246', 'Hugo');
insert into public.technician_pins (technician_id, pin_hash, algorithm)
select id, extensions.crypt(pin, extensions.gen_salt('bf', 4)), 'bcrypt'
from (values ('10000000-0000-0000-0000-0000000000a1'::uuid, '1111'), ('10000000-0000-0000-0000-0000000000b1', '2222'),
             ('10000000-0000-0000-0000-000000000c46', '3333'), ('10000000-0000-0000-0000-000000000d46', '4444'),
             ('10000000-0000-0000-0000-000000000e46', '5555'), ('10000000-0000-0000-0000-000000000f46', '6666'),
             ('10000000-0000-0000-0000-000000000146', '7777')) as p(id, pin);
-- (Hugo n'a pas de code : surveillé quand même, voir 164_alertes_pointage)

-- Journées déjà commencées (heures forcées, sans déclencheur)
set local session_replication_role = replica;
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source) values
  -- Alice : partie en pause il y a 10 minutes
  ('10000000-0000-0000-0000-0000000000a1', 'in',  now() - interval '4 hours',    public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-0000000000a1', 'out', now() - interval '10 minutes', public.paris_date(now()), 'kiosk'),
  -- Bruno : en pause depuis 1 heure
  ('10000000-0000-0000-0000-0000000000b1', 'in',  now() - interval '4 hours',    public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-0000000000b1', 'out', now() - interval '60 minutes', public.paris_date(now()), 'kiosk'),
  -- Carl : arrivé ce matin
  ('10000000-0000-0000-0000-000000000c46', 'in',  now() - interval '3 hours',    public.paris_date(now()), 'kiosk'),
  -- Dan et Eve : en pause depuis 1 h 10
  ('10000000-0000-0000-0000-000000000d46', 'in',  now() - interval '5 hours',    public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-000000000d46', 'out', now() - interval '70 minutes', public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-000000000e46', 'in',  now() - interval '5 hours',    public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-000000000e46', 'out', now() - interval '70 minutes', public.paris_date(now()), 'kiosk');
set local session_replication_role = origin;
-- Eve a une absence validée jusqu'à la fin de la journée
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, start_time, end_time, status)
values ('10000000-0000-0000-0000-000000000e46', 'other', public.paris_date(now()), public.paris_date(now()),
        '00:00', '23:59', 'approved');

-- ---------------------------------------------------------------- Borne : pas avant l'heure réglée (08:55)
update public.app_settings set earliest_clock_in = '23:59:59';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.kiosk_clock('6666', pg_temp.fake_file('clock_photo')) ->> 'message',
          'Badgeage possible à partir de 23h59.', 'Trop tôt : badgeage refusé avec l''heure d''ouverture');
reset role;
select is((select count(*)::int from public.clock_events where technician_id = (
             select technician_id from public.technician_pins p
             where extensions.crypt('6666', p.pin_hash) = p.pin_hash)), 0,
          'Rien n''est enregistré avant l''heure');
update public.app_settings set earliest_clock_in = '00:00';

-- ---------------------------------------------------------------- Borne : pause
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select ok(public.kiosk_clock('1111', pg_temp.fake_file('clock_photo')) ->> 'message'
            ~ '^Pause en cours \(Alice\) : re-badge possible dans (49|50) min\.$',
          'Pause de 10 minutes : badgeage refusé avec le temps restant');
reset role;
select is((select count(*)::int from public.clock_events where technician_id = '10000000-0000-0000-0000-0000000000a1'), 2,
          'Rien n''est enregistré pendant la pause');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');

select is(public.kiosk_clock('2222', pg_temp.fake_file('clock_photo')) ->> 'event_type', 'in',
          'Après 59 minutes : retour de pause badgé');

select results_eq(
  $$ select r ->> 'event_type', (r ->> 'pause_until')::timestamptz between now() + interval '58 minutes' and now() + interval '60 minutes'
     from (select public.kiosk_clock('3333', pg_temp.fake_file('clock_photo')) as r) x $$,
  $$ values ('out', true) $$,
  '2e badgeage du jour : départ en pause, re-badge possible dans 59 minutes');

select is(public.kiosk_clock('6666', pg_temp.fake_file('clock_photo')) ->> 'event_type', 'in', 'Frank arrive');

-- ---------------------------------------------------------------- Notifications de badgeage
reset role;
select ok(exists (select 1 from public.notifications where type = 'clock_in' and recipient_role = 'direction'
                  and title like 'Retour de pause : Bruno __:__'),
          'Direction notifiée du retour de pause');
select ok(exists (select 1 from public.notifications where type = 'clock_out' and title like 'Départ en pause : Carl __:__'),
          'Direction notifiée du départ en pause');
select ok(exists (select 1 from public.notifications where type = 'clock_in' and title like 'Arrivée : Frank __:__'),
          'Direction notifiée de l''arrivée');
select is((select count(*)::int from public.notifications where type in ('clock_in', 'clock_out')
           and title like '%Alice%'), 0, 'Badgeage refusé : pas de notification');
select is(exists (select 1 from public.notifications where type = 'late_arrival' and title = 'Retard : Frank'
                  and body like 'Arrivé à __:__, attendu à 00:00 (% min)'),
          :'open_today'::boolean, 'Arrivée après l''heure de tolérance : retard signalé');
select is((select count(*)::int from public.notifications where type = 'late_arrival' and title like '%Bruno%'), 0,
          'Retour de pause : pas un retard d''arrivée');

-- Correction saisie après coup : pas de notification
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source, reason)
values ('10000000-0000-0000-0000-000000000246', 'in', now() - interval '2 hours', public.paris_date(now()), 'manual', 'Oubli');
select is((select count(*)::int from public.notifications where title like '%Hugo%'), 0,
          'Pointage corrigé après coup : pas de notification');

-- ---------------------------------------------------------------- Tâche planifiée
select public.attendance_alerts();
select is(exists (select 1 from public.notifications where type = 'pause_overrun' and title = 'Pause dépassée : Dan'),
          :'open_today'::boolean, 'Pause de 1 h 10 sans retour : direction notifiée');
select is((select count(*)::int from public.notifications where type = 'pause_overrun' and title like '%Eve%'), 0,
          'Absence validée jusqu''au soir : pas d''alerte de pause');
select is(exists (select 1 from public.notifications where type = 'not_arrived' and title = 'Pas encore arrivé : Gina'),
          :'open_today'::boolean, 'Pas de badgeage à l''heure de tolérance : direction notifiée');
select is((select count(*)::int from public.notifications where type = 'not_arrived'
           and (title like '%Frank%' or title like '%Carl%' or title like '%Hugo%')), 0,
          'Déjà arrivés (badge ou saisie) : pas d''alerte');
select lives_ok($$ select public.attendance_alerts() $$, 'Tâche relancée : pas de doublon (dedupe)');

-- ---------------------------------------------------------------- Absence le matin puis arrivée
-- Absence validée jusqu'à il y a 25 minutes, arrivée maintenant : retard de 25 min depuis la fin de l'absence
-- (heure d'arrivée attendue placée juste après minuit pour que le test tourne à toute heure de la journée)
reset role;
select (now() at time zone 'Europe/Paris')::time - interval '25 minutes' as leave_end \gset
update public.app_settings set expected_arrival = '00:01', late_tolerance = '00:06';
insert into public.technicians (id, display_name) values ('10000000-0000-0000-0000-000000000346', 'Ines');
-- Jouable de jour, un jour travaillé (pas de retard un dimanche ou un samedi fermé)
select (now() at time zone 'Europe/Paris')::time > time '01:00'
       and not public.attendance_day_off('10000000-0000-0000-0000-000000000346', public.paris_date(now())) as daytime \gset
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, start_time, end_time, status)
values ('10000000-0000-0000-0000-000000000346', 'paid_leave', public.paris_date(now()), public.paris_date(now()),
        '00:00', :'leave_end', 'approved');
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source)
values ('10000000-0000-0000-0000-000000000346', 'in', now(), public.paris_date(now()), 'kiosk');
select case when :'daytime'::boolean
  then ok((select body from public.notifications
           where dedupe_key = 'late-10000000-0000-0000-0000-000000000346-' || public.paris_date(now())) ~ '\(25 min\)$',
          'Arrivée 25 min après la fin de l''absence : retard de 25 min notifié')
  else skip('Juste après minuit ou jour non travaillé : cas non jouable', 1) end;

select * from finish();
rollback;
