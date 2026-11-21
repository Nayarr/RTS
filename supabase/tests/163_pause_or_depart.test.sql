-- =============================================================================
-- Départ badgé : les chronos d'OR du technicien se mettent en pause d'eux-mêmes
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

insert into public.technician_pins (technician_id, pin_hash, algorithm)
values ('10000000-0000-0000-0000-0000000000a1', extensions.crypt('1111', extensions.gen_salt('bf', 4)), 'bcrypt');

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, technician_id, status)
values ('50000000-0000-0000-0000-000000001631', 'OR91631', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'pl', 'Freins avant', '10000000-0000-0000-0000-0000000000a1', 'in_progress'),
       ('50000000-0000-0000-0000-000000001632', 'OR91632', '30000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000002', 'vul', 'Vidange', '10000000-0000-0000-0000-0000000000b1', 'in_progress');
-- Alice et Bruno sont arrivés ce matin
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source) values
  ('10000000-0000-0000-0000-0000000000a1', 'in', now() - interval '4 hours', public.paris_date(now()), 'kiosk'),
  ('10000000-0000-0000-0000-0000000000b1', 'in', now() - interval '4 hours', public.paris_date(now()), 'kiosk');
set local session_replication_role = origin;

-- Chrono d'Alice lancé il y a 2 heures, chrono de Bruno lancé il y a 30 minutes
insert into public.time_entries (id, repair_order_id, technician_id, started_at) values
  ('71000000-0000-0000-0000-000000001631', '50000000-0000-0000-0000-000000001631',
   '10000000-0000-0000-0000-0000000000a1', now() - interval '2 hours'),
  ('71000000-0000-0000-0000-000000001632', '50000000-0000-0000-0000-000000001632',
   '10000000-0000-0000-0000-0000000000b1', now() - interval '30 minutes');

-- ---------------------------------------------------------------- Départ d'Alice à la borne
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.kiosk_clock('1111', pg_temp.fake_file('clock_photo')) ->> 'event_type', 'out',
          'Départ à la borne accepté avec un chrono en cours');
reset role;

select results_eq(
  $$ select ended_at = (select max(occurred_at) from public.clock_events
                        where technician_id = '10000000-0000-0000-0000-0000000000a1'),
            stopped_by is null
     from public.time_entries where id = '71000000-0000-0000-0000-000000001631' $$,
  $$ values (true, true) $$,
  'Chrono d''Alice en pause à l''heure du départ, comme une pause du technicien');
select is((select actor_id from public.ro_events
           where repair_order_id = '50000000-0000-0000-0000-000000001631'
             and label = 'Badgeage mis en pause au départ du technicien'),
          '00000000-0000-0000-0000-0000000000c1'::uuid, 'Historique de l''OR : pause au départ, par la borne');
select ok((select ended_at is null from public.time_entries where id = '71000000-0000-0000-0000-000000001632'),
          'Chrono d''un autre technicien pas touché');

-- ---------------------------------------------------------------- Retour : rien ne se relance tout seul
set local session_replication_role = replica;
update public.clock_events set occurred_at = occurred_at - interval '2 hours'
where technician_id = '10000000-0000-0000-0000-0000000000a1' and event_type = 'out';
update public.time_entries set ended_at = ended_at - interval '2 hours', started_at = started_at - interval '2 hours'
where id = '71000000-0000-0000-0000-000000001631';
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.kiosk_clock('1111', pg_temp.fake_file('clock_photo')) ->> 'event_type', 'in', 'Retour badgé');
reset role;
select is((select count(*)::int from public.time_entries
           where technician_id = '10000000-0000-0000-0000-0000000000a1' and ended_at is null), 0,
          'Arrivée : aucun chrono relancé à la place du technicien');

-- ---------------------------------------------------------------- Départ oublié saisi par la direction
-- Heure saisie avant le lancement du chrono de Bruno : chrono pas touché
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source, reason, entered_by)
values ('10000000-0000-0000-0000-0000000000b1', 'out', now() - interval '1 hour', public.paris_date(now()),
        'manual', 'Oubli', '00000000-0000-0000-0000-0000000000d1');
select ok((select ended_at is null from public.time_entries where id = '71000000-0000-0000-0000-000000001632'),
          'Départ saisi avant le lancement du chrono : chrono gardé');

-- Heure saisie après le lancement : chrono arrêté à cette heure
insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source, reason, entered_by)
values ('10000000-0000-0000-0000-0000000000b1', 'out', now() - interval '10 minutes', public.paris_date(now()),
        'manual', 'Oubli', '00000000-0000-0000-0000-0000000000d1');
select ok((select ended_at = now() - interval '10 minutes' from public.time_entries
           where id = '71000000-0000-0000-0000-000000001632'),
          'Départ saisi après le lancement du chrono : chrono arrêté à l''heure saisie');
select is((select actor_id from public.ro_events
           where repair_order_id = '50000000-0000-0000-0000-000000001632'
             and label = 'Badgeage mis en pause au départ du technicien'),
          '00000000-0000-0000-0000-0000000000d1'::uuid, 'Historique de l''OR : pause au départ saisi par la direction');

select * from finish();
rollback;
