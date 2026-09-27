-- =============================================================================
-- Fiche OR (bureau) : pièces, sous-traitance, consommables, OR facturé figé
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freinage',
        '10000000-0000-0000-0000-0000000000a1');

-- ---------------------------------------------------------------- Pièces
insert into public.ro_lines (id, repair_order_id, kind, line_type, description, unit_price, quantity, purchase_price,
                             supplier_id, order_status)
values ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'done', 'part',
        'Plaquettes avant', 138, 1, 92, '40000000-0000-0000-0000-000000000001', 'to_order');

update public.ro_lines set order_status = 'ordered' where id = '51000000-0000-0000-0000-000000000001';
update public.ro_lines set order_status = 'received' where id = '51000000-0000-0000-0000-000000000001';
update public.ro_lines set unit_price = 140 where id = '51000000-0000-0000-0000-000000000001';
select results_eq(
  $$ select label from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000000001'
     and label like 'Pièce%' order by created_at, label $$,
  $$ values ('Pièce commandée : Plaquettes avant'), ('Pièce reçue : Plaquettes avant') $$,
  'La commande et la réception d''une pièce sont tracées dans l''historique');

select is((select parts_pending_count from public.v_repair_orders_overview
           where id = '50000000-0000-0000-0000-000000000001'), 0::bigint,
          'Une pièce reçue n''est plus en attente');

-- ---------------------------------------------------------------- Sous-traitance et consommables
insert into public.subcontracts (id, repair_order_id, service, supplier_id, cost_ht, margin_percent, expected_return_on)
values ('52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Rectification disques',
        public.ensure_supplier('Rectif Service'), 100, 25, current_date + 3);
select is((select resale_price_ht from public.subcontracts where id = '52000000-0000-0000-0000-000000000001'),
          125.00::numeric, 'La sous-traitance est refacturée avec la marge');

reset role;
insert into public.consumables (id, name, unit, sale_price, purchase_price, stock_qty)
values ('90000000-0000-0000-0000-000000000001', 'Huile 10W40', 'L', 6.5, 3.2, 100);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.ro_consumables (id, repair_order_id, consumable_id, quantity, unit, unit_sale_price, unit_purchase_price)
values ('53000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
        '90000000-0000-0000-0000-000000000001', 32, 'L', 6.5, 3.2);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne assignée
select is((select count(*) from public.subcontracts), 0::bigint, 'Le technicien ne voit pas les coûts de sous-traitance');
select is((select count(*) from public.ro_consumables), 0::bigint, 'Ni les consommables facturés');

-- ---------------------------------------------------------------- Facture : pièce comptée une seule fois
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]) as invoice_id \gset
select results_eq(
  format($$ select line_type::text, count(*) from public.invoice_lines where invoice_id = %L
            group by line_type order by line_type $$, :'invoice_id'),
  $$ values ('consumable', 1::bigint), ('part', 1::bigint), ('subcontract', 1::bigint) $$,
  'Une pièce des travaux effectués n''apparaît qu''une fois sur la facture (pas en main d''œuvre)');

-- ---------------------------------------------------------------- OR facturé : figé
reset role;
update public.repair_orders set status = 'invoiced' where id = '50000000-0000-0000-0000-000000000001';

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$ update public.ro_lines set unit_price = 1 where id = '51000000-0000-0000-0000-000000000001' $$,
                 '42501', 'OR facturé : il ne peut plus être modifié (passer par un avoir)',
                 'Une pièce d''un OR facturé ne se modifie plus');
select throws_ok($$ insert into public.ro_lines (repair_order_id, kind, line_type, description)
                    values ('50000000-0000-0000-0000-000000000001', 'done', 'labor', 'Ajout') $$,
                 '42501', null, 'Aucune ligne ne s''ajoute à un OR facturé');
select throws_ok($$ delete from public.subcontracts where id = '52000000-0000-0000-0000-000000000001' $$,
                 '42501', null, 'La sous-traitance d''un OR facturé ne se supprime plus');
select throws_ok($$ delete from public.ro_consumables where id = '53000000-0000-0000-0000-000000000001' $$,
                 '42501', null, 'Les consommables d''un OR facturé ne se retirent plus');
reset role;
select is((select stock_qty from public.consumables where id = '90000000-0000-0000-0000-000000000001'), 68.00::numeric,
          'Le stock n''a pas été recrédité');

-- Une ligne ne peut pas non plus être déplacée depuis un OR facturé vers un autre
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Autre');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$ update public.ro_lines set repair_order_id = '50000000-0000-0000-0000-000000000002'
                    where id = '51000000-0000-0000-0000-000000000001' $$,
                 '42501', null, 'Une ligne ne quitte pas un OR facturé');

select * from finish();
rollback;
