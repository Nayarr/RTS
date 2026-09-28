-- =============================================================================
-- Garanties et retours de pièces : bureau uniquement, rattachement à l'OR
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Retour déclaré depuis une pièce d'OR
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins');
insert into public.ro_lines (id, repair_order_id, kind, line_type, description, supplier_id, purchase_price)
values ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'done', 'part',
        E'Étrier de frein AV\nréf. 1234', '40000000-0000-0000-0000-000000000001', 180);

insert into public.warranty_claims (id, ro_line_id, part_name, supplier_id, amount_ht, reason)
values ('60000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001',
        'Étrier de frein AV', '40000000-0000-0000-0000-000000000001', 180, 'Fuite');

select results_eq(
  $$ select repair_order_id, vehicle_id, client_id, status::text, created_by from public.warranty_claims
     where id = '60000000-0000-0000-0000-000000000001' $$,
  $$ values ('50000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid,
             '20000000-0000-0000-0000-000000000001'::uuid, 'to_return', '00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'La pièce d''OR donne l''OR, le véhicule et le client ; statut « à retourner »');
select is((select count(*) from public.ro_events
           where repair_order_id = '50000000-0000-0000-0000-000000000001'
             and label = 'Retour / garantie déclaré : Étrier de frein AV'), 1::bigint,
          'Le retour s''inscrit dans l''historique de l''OR');
select results_eq(
  $$ select supplier_name, repair_order_number is not null, vehicle_plate, client_name from public.v_warranty_claims
     where id = '60000000-0000-0000-0000-000000000001' $$,
  $$ values ('Pièces Poids Lourds', true, 'AB-123-CD', 'Transports Dupont') $$,
  'La liste montre fournisseur, OR, véhicule et client');

-- La pièce est retirée de l'OR : le retour reste rattaché à l'OR
delete from public.ro_lines where id = '51000000-0000-0000-0000-000000000001';
select is((select repair_order_id from public.warranty_claims where id = '60000000-0000-0000-0000-000000000001'),
          '50000000-0000-0000-0000-000000000001'::uuid, 'Pièce retirée de l''OR : le retour garde l''OR');

-- ---------------------------------------------------------------- Retour libre, suivi du statut
insert into public.warranty_claims (id, part_name, brand) values ('60000000-0000-0000-0000-000000000002', 'Turbo', 'Garrett');
update public.warranty_claims set status = 'refunded' where id = '60000000-0000-0000-0000-000000000002';
select is((select status::text from public.warranty_claims where id = '60000000-0000-0000-0000-000000000002'),
          'refunded', 'Retour sans OR, statut mis à jour');

-- ---------------------------------------------------------------- Techniciens : aucun accès
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.v_warranty_claims), 0::bigint, 'Un technicien ne voit pas les retours');
select throws_ok($$ insert into public.warranty_claims (part_name) values ('Pirate') $$,
                 '42501', null, 'Un technicien ne déclare pas de retour');

select * from finish();
rollback;
