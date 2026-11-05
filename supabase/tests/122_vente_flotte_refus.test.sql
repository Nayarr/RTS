-- =============================================================================
-- Vente d'un véhicule sous contrat : le refus nomme le contrat, son état et ce qu'il faut faire
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

insert into public.fleet_vehicles (id, plate, brand, model, category, daily_rate) values
  ('f0000000-0000-0000-0000-000000000122', 'VR-122-AA', 'Renault', 'Master', 'van', 80);

create temporary table essai (status public.rental_status, kind public.rental_kind, attendu text) on commit drop;
insert into essai values
  ('reserved', 'rental', 'Vente impossible : location réservée (T-0122). Annule-la d''abord.'),
  ('active', 'rental', 'Vente impossible : location en cours (T-0122). Enregistre le retour puis clôture-la.'),
  ('returned', 'rental', 'Vente impossible : location à facturer (T-0122). Clôture-la d''abord.'),
  ('reserved', 'loan', 'Vente impossible : prêt prévu (T-0122). Annule-le d''abord.'),
  ('active', 'loan', 'Vente impossible : prêt en cours (T-0122). Enregistre le retour puis clôture-le.'),
  ('returned', 'loan', 'Vente impossible : prêt à facturer (T-0122). Clôture-le d''abord.');

-- Contrat dans l'état voulu (triggers coupés : numéro imposé, pas de règle de transition), puis vente à la réception
create function pg_temp.refus(p_status public.rental_status, p_kind public.rental_kind) returns text
language plpgsql as $$
begin
  set local session_replication_role = replica;
  delete from public.rentals where fleet_vehicle_id = 'f0000000-0000-0000-0000-000000000122';
  insert into public.rentals (fleet_vehicle_id, client_id, kind, status, number, departure_at, planned_return_at,
                              rate_period, unit_price, periods)
  values ('f0000000-0000-0000-0000-000000000122', '20000000-0000-0000-0000-000000000001', p_kind, p_status, 'T-0122',
          now(), now() + interval '2 days', 'day', 100, 2);
  set local session_replication_role = origin;
  perform pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
  begin
    perform public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000122',
      '20000000-0000-0000-0000-000000000001', now(), null, 'normal', 10000);
  exception when sqlstate 'P0001' then
    reset role;
    return sqlerrm;
  end;
  reset role;
  return 'vendu';
end;
$$;

select is(pg_temp.refus(status, kind), attendu, kind || ' ' || status || ' : refus explicite') from essai;

-- Contrat terminé : la vente passe
set local session_replication_role = replica;
update public.rentals set status = 'closed' where fleet_vehicle_id = 'f0000000-0000-0000-0000-000000000122';
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000122',
                   '20000000-0000-0000-0000-000000000001', now(), null, 'normal', 10000) $$,
                'Contrat clôturé : vente acceptée');
select is((select is_active from public.fleet_vehicles where id = 'f0000000-0000-0000-0000-000000000122'), false,
          'Le véhicule sort de la flotte');

select * from finish();
rollback;
