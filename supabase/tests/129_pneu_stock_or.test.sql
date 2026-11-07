-- =============================================================================
-- Pneu du stock sur un OR : réservé tout de suite, pas en « pièce en attente », sorti à la facture
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

-- Stock vide (le jeu de démo local a des pneus)
delete from public.tire_movements;
delete from public.tires;
delete from public.tire_lines;
delete from public.tire_brands;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- 8 pneus en stock
select public.add_tires('pl', '31580225', 'avant', 'Michelin', 'X Multi Z', 'neuf', 8, 312, 415) as tire \gset
select part_id as tire_part from public.tires where id = :'tire' \gset
reset role;
create temp view t_lot as select stock_qty, reserved_qty, available_qty from public.v_tire_lots where id = :'tire';
grant select on t_lot to authenticated;

-- Devis accepté avec 2 pneus du stock, puis OR créé depuis le devis
set local session_replication_role = replica;
insert into public.quotes (id, number, status, client_id, vehicle_id, accepted_at) values
  ('60000000-0000-0000-0000-000000001291', 'DV91291', 'accepted', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', now());
insert into public.quote_lines (quote_id, position, line_type, description, quantity, unit_price, part_id) values
  ('60000000-0000-0000-0000-000000001291', 0, 'part', 'Pneu Michelin X Multi Z 315/80 R22.5', 2, 415, :'tire_part');
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select results_eq($$ select reserved_qty, available_qty from t_lot $$, $$ values (2, 6) $$,
                  'Devis : 2 pneus réservés');

select public.create_repair_order_from_quote('60000000-0000-0000-0000-000000001291') as ro \gset
select is((select order_status::text from public.ro_lines where repair_order_id = :'ro' and part_id = :'tire_part'),
          'received', 'OR issu du devis : pneu du stock disponible, pas à commander');
select is((select parts_pending_count::int from public.v_repair_orders_overview where id = :'ro'), 0,
          'OR issu du devis : pas de pièce en attente');
select results_eq($$ select reserved_qty, available_qty from t_lot $$, $$ values (2, 6) $$,
                  'Toujours 2 pneus réservés (passés du devis à l''OR)');

-- Pneu du stock ajouté sur l'OR (carte Pièces)
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, quantity, unit_price,
                             purchase_price, part_id, order_status)
values (:'ro', 'done', 10, 'part', 'Pneu Michelin X Multi Z 315/80 R22.5', 4, 415, 312, :'tire_part', 'to_order');
select is((select order_status::text from public.ro_lines where repair_order_id = :'ro' and position = 10),
          'received', 'Pneu ajouté sur l''OR : disponible');
select results_eq($$ select stock_qty, reserved_qty, available_qty from t_lot $$, $$ values (8, 6, 2) $$,
                  'Pneus de l''OR réservés : le disponible baisse aussitôt');

-- Plus assez de pneus : à commander
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, quantity, unit_price, part_id,
                             order_status)
values (:'ro', 'done', 11, 'part', 'Pneu Michelin X Multi Z 315/80 R22.5', 4, 415, :'tire_part', 'to_order');
select is((select order_status::text from public.ro_lines where repair_order_id = :'ro' and position = 11),
          'to_order', 'Stock insuffisant : reste à commander');
delete from public.ro_lines where repair_order_id = :'ro' and position = 11;

-- Facture émise : les 6 pneus sortent du stock
update public.repair_orders set status = 'work_done' where id = :'ro';
select public.build_invoice_draft(array[:'ro'::uuid]) as invoice \gset
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select public.issue_invoice(:'invoice');
select results_eq($$ select stock_qty, reserved_qty, available_qty from t_lot $$, $$ values (2, 0, 2) $$,
                  'Facture émise : 6 pneus sortis du stock');
select is((select sum(quantity)::int from public.tire_movements where tire_id = :'tire' and reason = 'sale'), -6,
          'Sortie tracée');

select * from finish();
rollback;
