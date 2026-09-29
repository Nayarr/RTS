-- =============================================================================
-- Messages au client depuis l'OR : traçabilité et historique
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins');

insert into public.client_messages (repair_order_id, message_type, channel, recipient, subject, body)
values ('50000000-0000-0000-0000-000000000001', 'vehicle_ready', 'sms', '0612345678', null, 'Votre véhicule est prêt');

select results_eq(
  $$ select client_id, sent_by from public.client_messages where repair_order_id = '50000000-0000-0000-0000-000000000001' $$,
  $$ values ('20000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'Client repris de l''OR, expéditeur renseigné');
select is((select count(*) from public.ro_events
           where repair_order_id = '50000000-0000-0000-0000-000000000001'
             and label = 'Message au client (SMS) : Véhicule prêt'), 1::bigint,
          'L''envoi apparaît dans l''historique de l''OR');

insert into public.client_messages (repair_order_id, message_type, channel)
values ('50000000-0000-0000-0000-000000000001', 'vehicle_received', 'email');
select is((select count(*) from public.ro_events
           where repair_order_id = '50000000-0000-0000-0000-000000000001'
             and label = 'Message au client (e-mail) : Véhicule pris en charge'), 1::bigint,
          'Libellé e-mail');

-- ---------------------------------------------------------------- Techniciens : aucun accès
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.client_messages), 0::bigint, 'Un technicien ne voit pas les messages');
select throws_ok($$ insert into public.client_messages (message_type, channel) values ('vehicle_ready', 'sms') $$,
                 '42501', null, 'Un technicien n''envoie pas de message au client');

select * from finish();
rollback;
