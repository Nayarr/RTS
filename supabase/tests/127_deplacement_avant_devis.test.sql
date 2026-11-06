-- =============================================================================
-- Facture des travaux réalisés avant le devis : le déplacement du dépannage y figure, une fois
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

-- OR de dépannage en zone 3 (devis accepté, diagnostic fait) ; OR à l'atelier dans le même cas
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status,
                                  intervention_type, roadside_address, roadside_km, roadside_minutes) values
  ('50000000-0000-0000-0000-000000001271', 'OR91271', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Panne', 'quote_pending', 'roadside', 'Aire de Roissy', 30, 60),
  ('50000000-0000-0000-0000-000000001272', 'OR91272', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'remorque', 'Contrôle', 'quote_pending', 'workshop', null, null, null);
insert into public.ro_lines (id, repair_order_id, kind, position, line_type, description, estimated_hours, unit_price, quantity) values
  ('51000000-0000-0000-0000-000000001271', '50000000-0000-0000-0000-000000001271', 'done', 1, 'package', 'Diagnostic', null, 60, 1),
  ('51000000-0000-0000-0000-000000001272', '50000000-0000-0000-0000-000000001272', 'done', 1, 'package', 'Contrôle feux', null, 40, 1);
insert into public.quotes (id, number, status, repair_order_id, client_id, vehicle_id, accepted_at) values
  ('60000000-0000-0000-0000-000000001271', 'DV91271', 'accepted', '50000000-0000-0000-0000-000000001271',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now()),
  ('60000000-0000-0000-0000-000000001272', 'DV91272', 'accepted', '50000000-0000-0000-0000-000000001272',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', now());
insert into public.quote_lines (quote_id, section, line_type, description, unit_price, source_ro_line_id) values
  ('60000000-0000-0000-0000-000000001271', 'done', 'package', 'Diagnostic', 60, '51000000-0000-0000-0000-000000001271'),
  ('60000000-0000-0000-0000-000000001272', 'done', 'package', 'Contrôle feux', 40, '51000000-0000-0000-0000-000000001272');
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- Dépannage : le déplacement rejoint la facture émise
select (public.settle_pre_quote_work('50000000-0000-0000-0000-000000001271',
  '[{"line_id": "51000000-0000-0000-0000-000000001271", "decision": "billed", "price": 60}]'::jsonb)) ->> 'invoice_id' as invoice \gset
select results_eq(
  format($$ select description, unit_price, quantity from public.invoice_lines
            where invoice_id = %L and line_type = 'travel' $$, :'invoice'),
  $$ values ('Forfait déplacement zone 3 · Aire de Roissy'::text, 130.00::numeric, 1::numeric) $$,
  'Facture : le forfait de la zone 3, avec le lieu');
select is((select sum(net_ht) from public.invoice_lines where invoice_id = :'invoice'), 190.00::numeric,
          'Facture : diagnostic et déplacement');
select is((select status::text from public.repair_orders where id = '50000000-0000-0000-0000-000000001271'), 'invoiced',
          'OR facturé');
select is((select count(*)::int from public.invoice_lines l
            join public.invoice_repair_orders iro on iro.invoice_id = l.invoice_id
            where iro.repair_order_id = '50000000-0000-0000-0000-000000001271' and l.line_type = 'travel'), 1,
          'Déplacement facturé une seule fois');

-- OR à l'atelier : pas de déplacement
select (public.settle_pre_quote_work('50000000-0000-0000-0000-000000001272',
  '[{"line_id": "51000000-0000-0000-0000-000000001272", "decision": "offered"}]'::jsonb)) ->> 'invoice_id' as shop_invoice \gset
select is((select count(*)::int from public.invoice_lines where invoice_id = :'shop_invoice' and line_type = 'travel'), 0,
          'OR à l''atelier : pas de déplacement');
select is((select count(*)::int from public.invoice_lines where invoice_id = :'shop_invoice'), 1,
          'OR à l''atelier : la ligne offerte seule');

select * from finish();
rollback;
