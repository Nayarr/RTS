-- =============================================================================
-- Transfert d'un véhicule à un autre client : historique gardé, contrat et liens de l'ancien
-- propriétaire retirés, portail de chacun limité à ce qui le concerne
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Données (hors règles métier)
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000000991', 'OR99101', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Freins', 'invoiced'),
  ('50000000-0000-0000-0000-000000000992', 'OR99102', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Vidange', 'in_progress');
insert into public.maintenance_contracts (id, client_id, service_description, frequency_months)
values ('70000000-0000-0000-0000-000000000991', '20000000-0000-0000-0000-000000000001', 'Entretien', 3);
insert into public.maintenance_contract_vehicles (contract_id, vehicle_id) values
  ('70000000-0000-0000-0000-000000000991', '30000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000991', '30000000-0000-0000-0000-000000000002');
insert into public.booking_links (kind, client_id, vehicle_id) values
  ('ct', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Refus
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice (technicienne)
select throws_ok($$ select public.transfer_vehicle('30000000-0000-0000-0000-000000000001',
                                                   '20000000-0000-0000-0000-000000000002') $$,
                 '42501', null, 'Technicien : transfert refusé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_like($$ select public.transfer_vehicle('30000000-0000-0000-0000-000000000001',
                                                     '20000000-0000-0000-0000-000000000001') $$,
                   '%déjà au client Transports Dupont%', 'Même client : refusé');
update public.clients set archived_at = now() where id = '20000000-0000-0000-0000-000000000002';
select throws_like($$ select public.transfer_vehicle('30000000-0000-0000-0000-000000000001',
                                                     '20000000-0000-0000-0000-000000000002') $$,
                   '%Logistique Martin est archivé%', 'Client archivé : refusé');
update public.clients set archived_at = null where id = '20000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------- Transfert par la réception
select lives_ok($$ select public.transfer_vehicle('30000000-0000-0000-0000-000000000001',
                                                  '20000000-0000-0000-0000-000000000002', 'Racheté par Martin') $$,
                'Réception : véhicule transféré');
select is((select client_id from public.vehicles where id = '30000000-0000-0000-0000-000000000001'),
          '20000000-0000-0000-0000-000000000002'::uuid, 'Le véhicule est chez le nouveau propriétaire');
select results_eq(
  $$ select from_client_name, to_client_name, note, changed_by from public.vehicle_owner_changes
     where vehicle_id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('Transports Dupont', 'Logistique Martin', 'Racheté par Martin',
             '00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'Transfert noté : ancien et nouveau propriétaire, motif, auteur');
select is((select count(*)::integer from public.repair_orders
            where vehicle_id = '30000000-0000-0000-0000-000000000001'
              and client_id = '20000000-0000-0000-0000-000000000001'), 2,
          'OR déjà faits : restent à l''ancien propriétaire, sur la fiche du véhicule');
select results_eq(
  $$ select vehicle_id from public.maintenance_contract_vehicles
     where contract_id = '70000000-0000-0000-0000-000000000991' $$,
  $$ values ('30000000-0000-0000-0000-000000000002'::uuid) $$,
  'Contrat d''entretien de l''ancien propriétaire : le véhicule cédé en sort, les autres restent');
select is((select count(*)::integer from public.booking_links
            where vehicle_id = '30000000-0000-0000-0000-000000000001'), 0,
          'Liens de rendez-vous de l''ancien propriétaire pour ce véhicule : retirés');

-- Fiche modifiée à la main : le changement est aussi noté
update public.vehicles set client_id = '20000000-0000-0000-0000-000000000001'
 where id = '30000000-0000-0000-0000-000000000003';
select is((select from_client_name || ' > ' || to_client_name from public.vehicle_owner_changes
            where vehicle_id = '30000000-0000-0000-0000-000000000003'),
          'Logistique Martin > Transports Dupont', 'Client changé sur la fiche : noté aussi');

-- ---------------------------------------------------------------- Portail de chacun
select public.share_client_portal('20000000-0000-0000-0000-000000000001') as old_owner \gset
select public.share_client_portal('20000000-0000-0000-0000-000000000002') as new_owner \gset
select pg_temp.act_as_anon();
select is(jsonb_path_query_array(public.public_get_document(:'old_owner'),
                                 '$.vehicles ? (@.plate == "AB-123-CD").status_label'),
          '["En cours"]'::jsonb, 'Ancien propriétaire : le véhicule tant que son OR est en cours');
select is(jsonb_path_query_array(public.public_get_document(:'new_owner'),
                                 '$.vehicles ? (@.plate == "AB-123-CD").status_label'),
          '["Pas à l''atelier"]'::jsonb, 'Nouveau propriétaire : l''OR de l''ancien n''apparaît pas');

reset role;
set local session_replication_role = replica;
update public.repair_orders set status = 'invoiced' where id = '50000000-0000-0000-0000-000000000992';
set local session_replication_role = origin;
select pg_temp.act_as_anon();
select is(jsonb_path_query_array(public.public_get_document(:'old_owner'), '$.vehicles[*].plate'),
          '["EF-456-GH", "IJ-789-KL"]'::jsonb, 'OR de l''ancien propriétaire facturé : le véhicule cédé quitte son portail');

-- ---------------------------------------------------------------- Lecture
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::integer from public.vehicle_owner_changes), 0,
          'Propriétaires successifs : lus par le bureau seulement');

select * from finish();
rollback;
