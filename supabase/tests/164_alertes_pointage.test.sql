-- =============================================================================
-- Alertes de pointage : pas de départ badgé après la fermeture, fiches sans code PIN surveillées
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir helpers/fixtures.psql

-- Ouverture à minuit, fermeture à 23:59 (samedi compris), arrivée attendue à minuit (tolérance 1 s)
update public.app_settings set workday_start = '00:00', workday_end = '23:59:59', saturday_hours = 23.99,
                               expected_arrival = '00:00', late_tolerance = '00:00:01', lunch_end = '00:05';
-- Les alertes de fin de journée tombent à 00:16 au plus tard : le test n'est fiable qu'après 00:20
select (now() at time zone 'Europe/Paris')::time > time '00:20' as late_enough \gset
-- Le dimanche est fermé : pas d'alerte « pas encore arrivé »
select extract(isodow from public.paris_date(now())) <> 7 as open_today \gset

insert into public.technicians (id, display_name, is_active) values
  ('10000000-0000-0000-0000-000000000c64', 'Carl', true),
  ('10000000-0000-0000-0000-000000000d64', 'Dan', true),
  ('10000000-0000-0000-0000-000000000e64', 'Eric', false);
insert into public.technician_pins (technician_id, pin_hash, algorithm)
select id, extensions.crypt('1111', extensions.gen_salt('bf', 4)), 'bcrypt'
from public.technicians where id in ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b1',
                                     '10000000-0000-0000-0000-000000000c64');
-- (Dan et Eric n'ont pas de code PIN ; Eric n'est plus actif)

-- Téléphone de la direction abonné aux notifications
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key)
values ('00000000-0000-0000-0000-0000000000d1', 'https://push.test/direction', 'p', 'a');

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, technician_id, status)
values ('50000000-0000-0000-0000-000000001641', 'OR91641', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'pl', 'Freins avant', '10000000-0000-0000-0000-0000000000a1', 'in_progress');
set local session_replication_role = origin;

-- Alice : arrivée, chrono en cours ; Bruno : arrivé puis parti ; Carl : revenu de pause, pas de chrono
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source, reason) values
  ('10000000-0000-0000-0000-0000000000a1', 'in',  now() - interval '3 hours', public.paris_date(now()), 'manual', 'Test'),
  ('10000000-0000-0000-0000-0000000000b1', 'in',  now() - interval '3 hours', public.paris_date(now()), 'manual', 'Test'),
  ('10000000-0000-0000-0000-0000000000b1', 'out', now() - interval '1 hour',  public.paris_date(now()), 'manual', 'Test'),
  ('10000000-0000-0000-0000-000000000c64', 'in',  now() - interval '3 hours', public.paris_date(now()), 'manual', 'Test'),
  ('10000000-0000-0000-0000-000000000c64', 'out', now() - interval '2 hours', public.paris_date(now()), 'manual', 'Test'),
  ('10000000-0000-0000-0000-000000000c64', 'in',  now() - interval '1 hour',  public.paris_date(now()), 'manual', 'Test');
insert into public.time_entries (repair_order_id, technician_id, started_at)
values ('50000000-0000-0000-0000-000000001641', '10000000-0000-0000-0000-0000000000a1', now() - interval '2 hours');

-- ---------------------------------------------------------------- Avant la fermeture : rien
select public.attendance_alerts();
select is((select count(*)::int from public.notifications where type = 'no_departure'), 0,
          'Fermeture à 23:59 : pas d''alerte de départ (fermeture + 15 minutes sans repasser par minuit)');

-- ---------------------------------------------------------------- Fiche sans code PIN
select is(exists (select 1 from public.notifications where type = 'not_arrived' and title = 'Pas encore arrivé : Dan'),
          :'open_today'::boolean, 'Fiche sans code PIN : « Pas encore arrivé » envoyé');
select is((select count(*)::int from public.notifications where title like '%Eric%'), 0,
          'Fiche inactive : pas d''alerte');

-- ---------------------------------------------------------------- Après la fermeture
update public.app_settings set workday_end = '00:01', saturday_hours = 0.01;
select public.attendance_alerts();
select is(exists (select 1 from public.notifications where type = 'no_departure' and title = 'Pas de départ badgé : Alice'
                    and body like 'Dernier badgeage : arrivée à __:__, aucun départ à 00:1_ · chrono en cours sur AB-123-CD'),
          :'late_enough'::boolean, 'Arrivée sans départ : direction notifiée, avec le chrono resté en cours');
select is(exists (select 1 from public.notifications where type = 'no_departure' and title = 'Pas de départ badgé : Carl'
                    and body like 'Dernier badgeage : arrivée à __:__, aucun départ à 00:1_'),
          :'late_enough'::boolean, 'Retour de pause sans départ : direction notifiée');
select is((select count(*)::int from public.notifications where type = 'no_departure' and title like '%Bruno%'), 0,
          'Départ badgé : pas d''alerte');
select is((select count(*)::int from public.notifications where type = 'no_departure' and title like '%Dan%'), 0,
          'Jamais arrivé : pas d''alerte de départ (déjà « pas encore arrivé »)');
select is((select recipient_role::text from public.notifications where type = 'no_departure' limit 1),
          case when :'late_enough'::boolean then 'direction' end, 'Alerte pour la direction');
select is(exists (select 1 from public.push_outbox where title = 'Pas de départ badgé : Alice'),
          :'late_enough'::boolean, 'Alerte aussi envoyée en push');

select public.attendance_alerts();
select is((select count(*)::int from public.notifications where type = 'no_departure'),
          case when :'late_enough'::boolean then 2 else 0 end, 'Tâche relancée : pas de doublon');

select * from finish();
rollback;
