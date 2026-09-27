-- =============================================================================
-- Planning et rendez-vous
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- Saisie libre : client et véhicule inconnus créés à la volée
select (public.save_appointment('Transports Nouveaux', 'zz-999-zz', 'vul', '2026-10-05', '09:00', '10:30',
                                ' Vidange ', '10000000-0000-0000-0000-0000000000a1')).id as appt_id \gset
select results_eq(
  format($$ select c.name, v.plate, v.vehicle_type::text, v.client_id = c.id, a.reason
            from public.appointments a join public.clients c on c.id = a.client_id
            join public.vehicles v on v.id = a.vehicle_id where a.id = %L $$, :'appt_id'),
  $$ values ('Transports Nouveaux', 'ZZ-999-ZZ', 'vul', true, 'Vidange') $$,
  'Client et véhicule créés, motif nettoyé');

-- Véhicule connu sans client saisi : le client du véhicule est repris
select is((public.save_appointment('', 'AB123CD', 'pl', '2026-10-06', '14:00')).client_id,
          '20000000-0000-0000-0000-000000000001'::uuid, 'Client du véhicule connu repris');

select throws_ok($$ select public.save_appointment(' ', '', 'pl', '2026-10-06', '14:00') $$,
                 '22023', 'Indique au moins le client ou l''immatriculation', 'Client ou immatriculation obligatoire');
select throws_ok($$ select public.save_appointment('X', '', 'pl', '2026-10-06', '14:00', '13:00') $$,
                 '22023', 'L''heure de fin doit être après l''heure de début', 'Fin après le début');

-- Modification
select public.save_appointment('Transports Nouveaux', 'ZZ-999-ZZ', 'vul', '2026-10-05', '10:00', '11:00',
                               'Vidange + freins', null, p_id => :'appt_id');
select results_eq(
  format($$ select start_time, technician_name, plate, client_name, reason
            from public.v_appointments_overview where id = %L $$, :'appt_id'),
  $$ values ('10:00'::time, null::text, 'ZZ-999-ZZ', 'Transports Nouveaux', 'Vidange + freins') $$,
  'Rendez-vous modifié, lisible dans la vue');

-- Le véhicule est arrivé : création de l'OR
select public.save_appointment('Transports Nouveaux', 'ZZ-999-ZZ', 'vul', '2026-10-05', '10:00', '11:00',
                               'Vidange + freins', '10000000-0000-0000-0000-0000000000b1', p_id => :'appt_id');
select public.create_repair_order_from_appointment(:'appt_id') as ro_id \gset
select results_eq(
  format($$ select requested_work, planned_date, planned_start, planned_end, technician_id, vehicle_type::text,
                   appointment_id, created_by
            from public.repair_orders where id = %L $$, :'ro_id'),
  format($$ values ('Vidange + freins', '2026-10-05'::date, '10:00'::time, '11:00'::time,
                    '10000000-0000-0000-0000-0000000000b1'::uuid, 'vul', %L::uuid,
                    '00000000-0000-0000-0000-0000000000e1'::uuid) $$, :'appt_id'),
  'OR repris du rendez-vous (date, heures, technicien, motif)');
select results_eq(
  format($$ select status::text, repair_order_number is not null from public.v_appointments_overview where id = %L $$,
         :'appt_id'),
  $$ values ('converted', true) $$,
  'Rendez-vous converti, numéro de l''OR visible');
select is((select count(*) from public.ro_events
           where repair_order_id = :'ro_id' and label = 'OR créé depuis le rendez-vous du 05/10/2026'),
          1::bigint, 'Origine tracée dans l''historique de l''OR');

select throws_ok(format($$ select public.save_appointment('X', '', 'pl', '2026-10-07', '09:00', p_id => %L) $$, :'appt_id'),
                 'P0001', 'Ce rendez-vous n''est plus modifiable', 'Un rendez-vous converti ne se modifie plus');
select throws_ok(format($$ select public.create_repair_order_from_appointment(%L) $$, :'appt_id'),
                 'P0001', 'Ce rendez-vous n''est plus à venir', 'Pas deux OR pour un rendez-vous');
select lives_ok(format($$ update public.appointments set reminder_sent_at = now() where id = %L $$, :'appt_id'),
                'Le rappel reste enregistrable');

-- Annulation
select (public.save_appointment('Logistique Martin', '', 'pl', '2026-10-08', '08:30')).id as cancel_id \gset
update public.appointments set status = 'cancelled' where id = :'cancel_id';
select throws_ok(format($$ select public.create_repair_order_from_appointment(%L) $$, :'cancel_id'),
                 'P0001', 'Ce rendez-vous n''est plus à venir', 'Un rendez-vous annulé ne devient pas un OR');
select throws_ok(format($$ update public.appointments set status = 'planned' where id = %L $$, :'cancel_id'),
                 'P0001', 'Ce rendez-vous n''est plus modifiable', 'Un rendez-vous annulé reste annulé');

-- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok($$ select public.save_appointment('X', '', 'pl', '2026-10-06', '14:00') $$,
                 '42501', null, 'Un technicien ne prend pas de rendez-vous');

select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.v_appointments_overview $$,
                 '42501', null, 'Un visiteur ne lit pas les rendez-vous');

select * from finish();
rollback;
