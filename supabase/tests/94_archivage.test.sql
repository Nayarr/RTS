-- =============================================================================
-- Archives : client archivé avec ses véhicules, hors recherche, restauré ; nouvel OR qui ressort
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select public.set_client_archived('20000000-0000-0000-0000-000000000001', true) $$, '42501', null,
                 'Archivage réservé à la direction');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select public.set_client_archived('20000000-0000-0000-0000-000000000001', true);
select ok((select archived_at is not null from public.clients where id = '20000000-0000-0000-0000-000000000001'),
          'Client archivé');
select is((select count(*)::int from public.vehicles
           where client_id = '20000000-0000-0000-0000-000000000001' and archived_at is not null), 2,
          'Ses véhicules archivés avec lui');
select is(jsonb_array_length(public.global_search('Dupont') -> 'clients'), 0, 'Client archivé hors de la recherche');
select is(jsonb_array_length(public.global_search('AB123') -> 'vehicles'), 0, 'Véhicule archivé hors de la recherche');
select is((select archived_at is not null from public.v_clients_overview where id = '20000000-0000-0000-0000-000000000001'),
          true, 'Liste des clients : archivé repérable');

-- Restauré : ses véhicules reviennent ; un véhicule archivé à part reste archivé
select public.set_client_archived('20000000-0000-0000-0000-000000000001', false);
select is((select count(*)::int from public.vehicles
           where client_id = '20000000-0000-0000-0000-000000000001' and archived_at is null), 2,
          'Client restauré avec ses véhicules');
select public.set_vehicle_archived('30000000-0000-0000-0000-000000000002', true);
select public.set_client_archived('20000000-0000-0000-0000-000000000001', true);
select public.set_client_archived('20000000-0000-0000-0000-000000000001', false);
select ok((select archived_at is not null from public.vehicles where id = '30000000-0000-0000-0000-000000000002'),
          'Véhicule archivé à part : reste archivé');

-- Nouvel OR sur une fiche archivée : elle revient
select public.set_vehicle_archived('30000000-0000-0000-0000-000000000001', true);
insert into public.repair_orders (vehicle_id, requested_work)
values ('30000000-0000-0000-0000-000000000001', 'Vidange');
select ok((select archived_at is null from public.vehicles where id = '30000000-0000-0000-0000-000000000001'),
          'Nouvel OR : véhicule sorti des archives');

-- Véhicule sans historique : supprimé ; avec un OR : refusé
select throws_ok($$ delete from public.vehicles where id = '30000000-0000-0000-0000-000000000001' $$, '23503', null,
                 'Véhicule avec un OR : pas de suppression');

select * from finish();
rollback;
