-- =============================================================================
-- Catalogues : stock des consommables par le journal, pièces, fournisseurs
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Consommables
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
insert into public.consumables (id, name, unit, sale_price, purchase_price, stock_qty, alert_threshold)
values ('90000000-0000-0000-0000-000000000001', 'Huile 10W40', 'L', 6.5, 3.2, 500, 40);
select is((select stock_qty from public.consumables where id = '90000000-0000-0000-0000-000000000001'), 0::numeric,
          'Un consommable créé depuis l''appli part d''un stock nul');

insert into public.consumable_movements (consumable_id, quantity, reason)
values ('90000000-0000-0000-0000-000000000001', 200, 'restock');
select is((select stock_qty from public.consumables where id = '90000000-0000-0000-0000-000000000001'), 200::numeric,
          'Un réapprovisionnement augmente le stock');

select throws_ok($$ update public.consumables set stock_qty = 999 where id = '90000000-0000-0000-0000-000000000001' $$,
                 '42501', 'Le stock se corrige par un réapprovisionnement ou un inventaire',
                 'Le stock ne se modifie pas directement');
select lives_ok($$ update public.consumables set sale_price = 7 where id = '90000000-0000-0000-0000-000000000001' $$,
                'Les autres champs se modifient normalement');

select is(public.set_consumable_stock('90000000-0000-0000-0000-000000000001', 185, null), 185::numeric,
          'Inventaire : le stock compté devient le stock');
reset role;
select results_eq(
  $$ select quantity, reason::text, note from public.consumable_movements
     where consumable_id = '90000000-0000-0000-0000-000000000001' and reason = 'adjustment' $$,
  $$ values (-15::numeric, 'adjustment', 'Inventaire') $$,
  'L''inventaire laisse l''écart dans le journal');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.set_consumable_stock('90000000-0000-0000-0000-000000000001', 185, null);
reset role;
select is((select count(*) from public.consumable_movements
           where consumable_id = '90000000-0000-0000-0000-000000000001'), 2::bigint,
          'Un inventaire sans écart n''ajoute pas de mouvement');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$ select public.set_consumable_stock('90000000-0000-0000-0000-000000000001', -1, null) $$,
                 '22023', 'Stock invalide', 'Un stock négatif est refusé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select public.set_consumable_stock('90000000-0000-0000-0000-000000000001', 0, null) $$,
                 '42501', 'Réservé à la direction', 'La réception ne fait pas l''inventaire');
select throws_ok($$ insert into public.consumables (name) values ('AdBlue') $$,
                 '42501', null, 'La réception ne crée pas de consommable');

-- ---------------------------------------------------------------- Fournisseurs
select is(public.ensure_supplier('  pièces poids-lourds '), '40000000-0000-0000-0000-000000000001'::uuid,
          'Un fournisseur existant est retrouvé par son nom normalisé');
select ensure_supplier as new_supplier from public.ensure_supplier('Garage Géométrie') \gset
reset role;
select is((select name from public.suppliers where id = :'new_supplier'), 'Garage Géométrie',
          'Un nouveau fournisseur est créé à la volée');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok($$ select public.ensure_supplier('Pirate') $$, '42501', 'Réservé au bureau',
                 'Un technicien ne crée pas de fournisseur');

-- ---------------------------------------------------------------- Pièces
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ insert into public.parts (designation) values ('Filtre à huile') $$,
                 '42501', null, 'Le catalogue de pièces est modifié par la direction seulement');

select * from finish();
rollback;
