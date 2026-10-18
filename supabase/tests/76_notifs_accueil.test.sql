-- =============================================================================
-- Alertes à action en push (gardées la nuit), réponse au devis saisie au bureau,
-- congé décidé et OR rouvert envoyés au technicien
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\ir helpers/fixtures.psql

-- Appareils abonnés : Alice, Bruno, la direction et la réception
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key) values
  ('00000000-0000-0000-0000-0000000000a1', 'https://push.test/alice', 'p', 'a'),
  ('00000000-0000-0000-0000-0000000000b1', 'https://push.test/bruno', 'p', 'a'),
  ('00000000-0000-0000-0000-0000000000d1', 'https://push.test/direction', 'p', 'a'),
  ('00000000-0000-0000-0000-0000000000e1', 'https://push.test/reception', 'p', 'a');

-- ---------------------------------------------------------------- Nuit : envoi au matin
select is(public.push_quiet_until('2026-10-17 12:00+02'), null, 'Journée : envoi tout de suite');
select is(public.push_quiet_until('2026-10-17 22:30+02'), '2026-10-18 07:00+02'::timestamptz,
          'Soirée : envoi le lendemain à 7 h');
select is(public.push_quiet_until('2026-10-18 05:10+02'), '2026-10-18 07:00+02'::timestamptz,
          'Avant 7 h : envoi à 7 h');

-- ---------------------------------------------------------------- Alertes de la cloche
insert into public.notifications (recipient_role, type, title, link, dedupe_key) values
  ('direction', 'low_stock', 'Stock bas : AdBlue', '/stock/consommables', 'stock-1'),
  ('direction', 'rental_renewed', 'Location LC-2026-0001 reconduite', '/location', 'renew-1');
select results_eq(
  $$select title, not_before is not distinct from public.push_quiet_until() from public.push_outbox
    where profile_id = '00000000-0000-0000-0000-0000000000d1'$$,
  $$values ('Stock bas : AdBlue', true)$$,
  'Alerte à action en push (gardée jusqu''au matin la nuit) ; une information reste dans la cloche');

update public.push_outbox set not_before = now() + interval '3 hours';
set local role service_role;
select is(public.claim_push_batch(10), '[]'::jsonb, 'Message de la nuit : pas envoyé avant l''heure');
reset role;
select is(public.dispatch_push(), 0, 'Rien à envoyer maintenant : l''envoi n''est pas relancé');
delete from public.push_outbox;

-- ---------------------------------------------------------------- Devis : réponse saisie au bureau
insert into public.quotes (id, client_id, vehicle_id, status)
values ('60000000-0000-0000-0000-000000000076', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 'sent');
insert into public.quote_lines (quote_id, position, line_type, description, quantity, unit_price)
values ('60000000-0000-0000-0000-000000000076', 0, 'labor', 'Freins', 1, 85);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.set_quote_response('60000000-0000-0000-0000-000000000076', 'accepted');
reset role;
select set_config('request.jwt.claims', '', true);
select results_eq(
  $$select recipient_role::text, title, body from public.notifications where type = 'quote_response' order by 1$$,
  $$values ('direction', 'Devis ' || (select number from public.quotes where id = '60000000-0000-0000-0000-000000000076')
                         || ' accepté (saisi par Réception)', 'Transports Dupont · AB-123-CD'),
           ('reception', 'Devis ' || (select number from public.quotes where id = '60000000-0000-0000-0000-000000000076')
                         || ' accepté (saisi par Réception)', 'Transports Dupont · AB-123-CD')$$,
  'Devis accepté au bureau : direction et réception prévenues');
select results_eq(
  $$select profile_id, not_before from public.push_outbox$$,
  $$values ('00000000-0000-0000-0000-0000000000d1'::uuid, null::timestamptz)$$,
  'Push tout de suite à la direction (pas à la réception qui l''a saisi)');
delete from public.push_outbox;

-- ---------------------------------------------------------------- Technicien : congé décidé
insert into public.leave_requests (id, technician_id, leave_type, starts_on, ends_on, status) values
  ('90000000-0000-0000-0000-000000000076', '10000000-0000-0000-0000-0000000000b1', 'paid_leave',
   '2026-11-02', '2026-11-06', 'requested');
delete from public.push_outbox;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select public.decide_leave_request('90000000-0000-0000-0000-000000000076', false);
reset role;
select set_config('request.jwt.claims', '', true);
select results_eq(
  $$select profile_id, title, body, link from public.push_outbox$$,
  $$values ('00000000-0000-0000-0000-0000000000b1'::uuid, 'Congé refusé', 'Du 02/11/2026 au 06/11/2026', '/conges')$$,
  'Congé refusé : push au technicien');
delete from public.push_outbox;

-- ---------------------------------------------------------------- Technicien : OR rouvert
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000076', '30000000-0000-0000-0000-000000000001', 'Freins avant',
   '10000000-0000-0000-0000-0000000000a1', 'assigned');
delete from public.push_outbox;
update public.repair_orders set status = 'work_done' where id = '50000000-0000-0000-0000-000000000076';
select is((select count(*)::integer from public.push_outbox), 0, 'OR terminé : rien au technicien');
update public.repair_orders set status = 'assigned' where id = '50000000-0000-0000-0000-000000000076';
select results_eq(
  $$select profile_id, title from public.push_outbox$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'OR rouvert : AB-123-CD')$$,
  'OR rouvert par le bureau : push au technicien');
delete from public.push_outbox;
update public.repair_orders set mileage = 100000 where id = '50000000-0000-0000-0000-000000000076';
select is((select count(*)::integer from public.push_outbox), 0, 'Simple kilométrage : rien');

select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename in ('invoices', 'leave_requests')
                  having count(*) = 2), 'Accueil : factures et congés suivis en direct');

select * from finish();
rollback;
