-- =============================================================================
-- Frais de stationnement : brouillon de facture des jours en trop, tarif du type de véhicule
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work, status, vehicle_type) values
  ('50000000-0000-0000-0000-000000001341', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Embrayage', 'to_invoice', 'pl'),
  ('50000000-0000-0000-0000-000000001342', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'Éclairage', 'to_invoice', 'remorque');
update public.company_settings set parking_rate_pl = 35, parking_rate_remorque = 22;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.build_parking_invoice_draft('50000000-0000-0000-0000-000000001341', '2026-11-04', '2026-11-08')
  as pl_invoice \gset

select results_eq(
  format($$ select i.status::text, i.client_id::text from public.invoices i where i.id = %L $$, :'pl_invoice'),
  $$ values ('draft', '20000000-0000-0000-0000-000000000001') $$,
  'Brouillon de facture au client de l''OR');
select results_eq(
  format($$ select line_type::text, quantity, unit_price from public.invoice_lines where invoice_id = %L $$, :'pl_invoice'),
  $$ values ('package', 4::numeric, 35::numeric) $$,
  'Poids lourd prévu le 4, parti le 8 : 4 jours au tarif poids lourd');
select matches(
  (select description from public.invoice_lines where invoice_id = :'pl_invoice'),
  'départ prévu le 04/11/2026, parti le 08/11/2026 · 4 jours$',
  'Ligne lisible : dates et nombre de jours');
select ok(exists (select 1 from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000001341'
                  and label = 'Frais de stationnement facturés : 4 jours en trop'),
          'Historique de l''OR');
select is((select count(*) from public.invoice_repair_orders where invoice_id = :'pl_invoice'), 0::bigint,
          'Facture à part : la facture des travaux de l''OR reste à faire');

select public.build_parking_invoice_draft('50000000-0000-0000-0000-000000001342', '2026-11-07', '2026-11-08')
  as trailer_invoice \gset
select results_eq(
  format($$ select quantity, unit_price from public.invoice_lines where invoice_id = %L $$, :'trailer_invoice'),
  $$ values (1::numeric, 22::numeric) $$,
  'Remorque : tarif remorque');

select throws_ok($$ select public.build_parking_invoice_draft('50000000-0000-0000-0000-000000001341', '2026-11-08', '2026-11-08') $$,
                 'P0001', 'Parti le 08/11/2026 : pas de jour de stationnement en trop', 'Parti à la date prévue : refusé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select throws_ok($$ select public.build_parking_invoice_draft('50000000-0000-0000-0000-000000001341', '2026-11-01', '2026-11-08') $$,
                 '42501', null, 'Technicien : facturation refusée');

select * from finish();
rollback;
