-- =============================================================================
-- Notifications push : événements mis en file, envoi par lots, abonnements, droits
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

\ir helpers/fixtures.psql

-- Appareils abonnés : Alice et la direction (Bruno et la réception n'ont rien activé).
insert into public.push_subscriptions (id, profile_id, endpoint, p256dh, auth_key) values
  ('70000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'https://push.test/alice', 'p', 'a'),
  ('70000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1', 'https://push.test/direction', 'p', 'a');

-- ---------------------------------------------------------------- Technicien : OR nouveau / modifié
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, status, planned_date, planned_start) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins avant',
   '10000000-0000-0000-0000-0000000000a1', 'assigned', '2026-10-05', '14:00');
select results_eq(
  $$select title, body, link from public.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values ('Nouvel OR : AB-123-CD', 'Freins avant · Prévu le 05/10 à 14h00', '/atelier/or/50000000-0000-0000-0000-000000000001')$$,
  'OR assigné : notification au technicien');

update public.repair_orders set requested_work = 'Freins avant et arrière'
where id = '50000000-0000-0000-0000-000000000001';
select results_eq(
  $$select count(*)::integer, min(title) from public.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values (1, 'OR modifié : AB-123-CD')$$,
  'Modification avant l''envoi : le message en attente est remplacé');

update public.repair_orders set mileage = 120000 where id = '50000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.push_outbox), 1, 'Kilométrage modifié : pas de notification');

insert into public.repair_orders (vehicle_id, requested_work, technician_id, status) values
  ('30000000-0000-0000-0000-000000000002', 'Pneus', '10000000-0000-0000-0000-0000000000b1', 'assigned');
select is((select count(*)::integer from public.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000b1'), 0,
          'Technicien sans appareil abonné : rien en file');

-- ---------------------------------------------------------------- Direction : demande de congé
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, status) values
  ('10000000-0000-0000-0000-0000000000b1', 'paid_leave', '2026-11-02', '2026-11-06', 'requested');
select results_eq(
  $$select title, body from public.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000d1'$$,
  $$values ('Demande de congé : Bruno', 'Du 02/11/2026 au 06/11/2026')$$,
  'Demande de congé : notification à la direction');

-- Action de la direction elle-même : pas de notification sur ses propres appareils
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, status) values
  ('10000000-0000-0000-0000-0000000000a1', 'sick', '2026-11-09', '2026-11-09', 'requested');
reset role;
select set_config('request.jwt.claims', '', true);  -- plus d'utilisateur connecté
select is((select count(*)::integer from public.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000d1'), 1,
          'Sa propre action : pas de notification');

-- ---------------------------------------------------------------- Bureau : réponse à un devis en ligne
insert into public.notifications (recipient_role, type, title, body, link, dedupe_key) values
  ('direction', 'quote_response', 'Devis DV00001 accepté en ligne', 'Transports Dupont · AB-123-CD', '/devis/x', 'qr-1'),
  ('direction', 'rental_renewed', 'Location LC-2026-0001 reconduite', null, '/location', 'renew-1');
select results_eq(
  $$select title from public.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000d1' order by created_at, title$$,
  $$values ('Demande de congé : Bruno'), ('Devis DV00001 accepté en ligne')$$,
  'Devis accepté en ligne envoyé en push ; une simple information reste dans la cloche');

-- ---------------------------------------------------------------- Lecture et envoi
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::integer from public.push_outbox), 0, 'File jamais lisible depuis l''appli');
select throws_ok('select public.claim_push_batch(10)', '42501', null, 'Envoi réservé à l''Edge Function');
reset role;
select set_config('request.jwt.claims', '', true);  -- plus d'utilisateur connecté

set local role service_role;
select public.claim_push_batch(10) as batch \gset
select is(jsonb_array_length(:'batch'::jsonb), 3, 'Lot : les trois messages en attente');
select is((select jsonb_path_query_first(:'batch'::jsonb, '$[*] ? (@.tag starts with "ro-").subscriptions[0].endpoint') #>> '{}'),
          'https://push.test/alice', 'Chaque message avec les appareils de son destinataire');
select is(public.claim_push_batch(10), '[]'::jsonb, 'Messages pris en charge : plus dans la file');

select jsonb_path_query_first(:'batch'::jsonb, '$[*] ? (@.tag starts with "leave-").id') #>> '{}' as leave_push \gset
select public.record_push_results(
  array['70000000-0000-0000-0000-0000000000d1']::uuid[],
  array['70000000-0000-0000-0000-0000000000a1']::uuid[],
  array[:'leave_push']::uuid[]);
reset role;
select set_config('request.jwt.claims', '', true);  -- plus d'utilisateur connecté
select ok((select last_used_at is not null from public.push_subscriptions where id = '70000000-0000-0000-0000-0000000000d1'),
          'Appareil joint : date d''utilisation notée');
select is((select count(*)::integer from public.push_subscriptions where id = '70000000-0000-0000-0000-0000000000a1'), 0,
          'Appareil désabonné (410) supprimé');
select ok((select sent_at is null and attempts = 1 from public.push_outbox where id = :'leave_push'),
          'Échec temporaire : message remis en file');

-- ---------------------------------------------------------------- Abonnement depuis l'appli
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.register_push_subscription('https://push.test/direction', 'p2', 'a2', 'Chrome')$$,
                'Bruno abonne un appareil');
reset role;
select set_config('request.jwt.claims', '', true);  -- plus d'utilisateur connecté
select is((select profile_id from public.push_subscriptions where endpoint = 'https://push.test/direction'),
          '00000000-0000-0000-0000-0000000000b1'::uuid, 'Appareil déjà utilisé par un autre compte : abonnement remplacé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.register_push_subscription('http://push.test/x', 'p', 'a')$$, '22023', null,
                 'Adresse d''abonnement non sécurisée refusée');
select lives_ok('select public.send_test_push()', 'Notification d''essai sur ses appareils');
reset role;
select set_config('request.jwt.claims', '', true);  -- plus d'utilisateur connecté

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok('select public.send_test_push()', 'P0002', null, 'Essai sans appareil abonné : message clair');
reset role;
select set_config('request.jwt.claims', '', true);  -- plus d'utilisateur connecté

select * from finish();
rollback;
