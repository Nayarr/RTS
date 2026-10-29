-- =============================================================================
-- Push de la direction : OR commencé, en pause, repris, terminé ; toutes ses alertes en push
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir helpers/fixtures.psql

insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key) values
  ('00000000-0000-0000-0000-0000000000a1', 'https://push.test/alice', 'p', 'a'),
  ('00000000-0000-0000-0000-0000000000d1', 'https://push.test/direction', 'p', 'a'),
  ('00000000-0000-0000-0000-0000000000e1', 'https://push.test/reception', 'p', 'a');

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, technician_id, status)
values ('50000000-0000-0000-0000-000000001001', 'OR91001', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'pl', E'Freins avant\nVidange',
        '10000000-0000-0000-0000-0000000000a1', 'assigned');
set local session_replication_role = origin;

create function pg_temp.direction_push() returns table (title text, body text, link text)
language sql as $$
  select title, body, link from public.push_outbox
  where profile_id = '00000000-0000-0000-0000-0000000000d1' and sent_at is null order by created_at
$$;
-- Messages en attente considérés comme partis (envoi par l'Edge Function)
create function pg_temp.sent() returns void language sql as $$ update public.push_outbox set sent_at = now() $$;

-- Gestes du technicien (Alice), écrits comme le font start_timer / stop_timer / complete_repair_order
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
reset role;

insert into public.time_entries (id, repair_order_id, technician_id, started_at)
values ('71000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000001001',
        '10000000-0000-0000-0000-0000000000a1', now() - interval '2 hours');
select results_eq($$ select * from pg_temp.direction_push() $$,
  $$ values ('OR commencé : AB-123-CD', 'Alice · OR91001 · Freins avant', '/or/50000000-0000-0000-0000-000000001001') $$,
  'Badgeage démarré : la direction est prévenue (technicien, OR, première tâche)');
select is((select count(*)::integer from public.push_outbox where profile_id <> '00000000-0000-0000-0000-0000000000d1'), 0,
          'Suivi de l''atelier : direction seulement');

update public.time_entries set ended_at = now() - interval '1 hour' where id = '71000000-0000-0000-0000-000000000001';
select results_eq($$ select title from pg_temp.direction_push() $$, $$ values ('OR en pause : AB-123-CD') $$,
  'Pause : le message en attente de l''OR est remplacé par son dernier état');

select pg_temp.sent();
insert into public.time_entries (id, repair_order_id, technician_id, started_at)
values ('71000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000001001',
        '10000000-0000-0000-0000-0000000000a1', now() - interval '30 minutes');
select results_eq($$ select title from pg_temp.direction_push() $$, $$ values ('OR repris : AB-123-CD') $$,
  'Nouveau badgeage après une pause : OR repris');

-- Travaux terminés : le badgeage s'arrête, puis l'OR change d'état (même transaction)
select pg_temp.sent();
update public.time_entries set ended_at = now() where id = '71000000-0000-0000-0000-000000000002';
update public.repair_orders set status = 'work_done' where id = '50000000-0000-0000-0000-000000001001';
select results_eq($$ select title from pg_temp.direction_push() $$, $$ values ('Travaux terminés : AB-123-CD') $$,
  'Travaux terminés : un seul push (la pause de la clôture est remplacée)');

select pg_temp.sent();
set local session_replication_role = replica;
update public.repair_orders set status = 'in_progress' where id = '50000000-0000-0000-0000-000000001001';
set local session_replication_role = origin;
update public.repair_orders set status = 'quote_pending' where id = '50000000-0000-0000-0000-000000001001';
select results_eq($$ select title from pg_temp.direction_push() $$,
  $$ values ('Travaux terminés, devis à faire : AB-123-CD') $$, 'Travaux terminés avec un devis à faire');

-- Chrono arrêté par la direction : pas de « pause »
select pg_temp.sent();
insert into public.time_entries (id, repair_order_id, technician_id, started_at)
values ('71000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000001001',
        '10000000-0000-0000-0000-0000000000a1', now());
select pg_temp.sent();
update public.time_entries set ended_at = now(), stopped_by = '00000000-0000-0000-0000-0000000000d1'
 where id = '71000000-0000-0000-0000-000000000003';
select is((select count(*)::integer from pg_temp.direction_push()), 0, 'Chrono arrêté par la direction : pas de pause');

-- Sa propre action : rien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
reset role;
insert into public.time_entries (repair_order_id, technician_id, started_at)
values ('50000000-0000-0000-0000-000000001001', '10000000-0000-0000-0000-0000000000a1', now());
select is((select count(*)::integer from pg_temp.direction_push()), 0, 'Jamais pour sa propre action');

-- ---------------------------------------------------------------- Alertes de la cloche
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
reset role;
insert into public.notifications (recipient_role, type, title, body, link, dedupe_key) values
  ('direction', 'signature_received', 'Signature reçue : AB-123-CD', 'OR OR91001', '/or/x', 't-sig-d'),
  ('reception', 'signature_received', 'Signature reçue : AB-123-CD', 'OR OR91001', '/or/x', 't-sig-r'),
  ('direction', 'late_subcontract', 'Sous-traitance en retard : Turbo', 'Garage', '/or/x', 't-sub'),
  ('direction', 'clock_during_leave', 'Badge pendant une absence : Bruno', 'Pointage', '/pointages', 't-clock'),
  ('direction', 'rental_renewed', 'Location LOC1 reconduite', 'Fin le', '/location', 't-rent');
select results_eq($$ select title from pg_temp.direction_push() order by title $$,
  $$ values ('Badge pendant une absence : Bruno'), ('Location LOC1 reconduite'),
            ('Signature reçue : AB-123-CD'), ('Sous-traitance en retard : Turbo') $$,
  'Toute alerte de la direction part en push');
select is((select count(*)::integer from public.push_outbox
            where profile_id = '00000000-0000-0000-0000-0000000000e1' and sent_at is null), 0,
          'Réception : signature reçue dans la cloche seulement, comme avant');

select pg_temp.sent();
insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
values ('direction', 'leave_request', 'Demande de congé : Bruno', 'Du', '/pointages/conges', 't-leave');
select is((select count(*)::integer from pg_temp.direction_push()), 0,
          'Demande de congé : pas de second push (déjà envoyé à la demande)');
insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
values ('reception', 'quote_response', 'Devis DV1 accepté', 'Client', '/devis/x', 't-quote');
select is((select count(*)::integer from public.push_outbox
            where profile_id = '00000000-0000-0000-0000-0000000000e1' and sent_at is null), 1,
          'Réception : ses alertes d''action toujours en push');

select * from finish();
rollback;
