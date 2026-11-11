-- =============================================================================
-- Profitez de l'immobilisation : mail des échéances tracé dans l'historique de l'OR
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work, status) values
  ('50000000-0000-0000-0000-000000001331', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Embrayage', 'in_progress');

select is(public.client_message_label('upcoming_work'), 'Échéances proposées', 'Libellé du mail des échéances');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.client_messages (repair_order_id, message_type, channel, recipient, subject, body)
values ('50000000-0000-0000-0000-000000001331', 'upcoming_work', 'email', 'contact@client.fr',
        'Profitez de l''immobilisation', 'Bonjour');
select ok(exists (select 1 from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000001331'
                  and label = 'Message au client (e-mail) : Échéances proposées'),
          'Historique de l''OR : échéances proposées au client par e-mail');

-- Vidange dite par le client : notée par le bureau, lue par le bureau seulement
insert into public.vehicle_oil_changes (vehicle_id, done_on, mileage)
values ('30000000-0000-0000-0000-000000000001', current_date - 30, 412000);
select results_eq(
  $$ select done_on, mileage, created_by::text from public.vehicle_oil_changes
     where vehicle_id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values (current_date - 30, 412000, '00000000-0000-0000-0000-0000000000e1') $$,
  'Vidange déclarée notée sur le véhicule, par la personne connectée');
select throws_ok(
  $$ insert into public.vehicle_oil_changes (vehicle_id, done_on) values ('30000000-0000-0000-0000-000000000001', current_date + 10) $$,
  '23514', null, 'Vidange dans le futur : refusée');
select throws_ok(
  $$ insert into public.vehicle_oil_changes (vehicle_id, done_on, mileage) values ('30000000-0000-0000-0000-000000000001', current_date, -5) $$,
  '23514', null, 'Kilométrage négatif : refusé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select is((select count(*) from public.vehicle_oil_changes), 0::bigint, 'Technicien : vidanges déclarées non lues');

select * from finish();
rollback;
