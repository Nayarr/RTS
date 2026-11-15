-- =============================================================================
-- Performance : la ligne de facture compte pour le salarié indiqué dessus (main d'œuvre, ventes)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

select public.paris_date(now()) as today \gset

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000148', 'OR90148', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Freins', '10000000-0000-0000-0000-0000000000a1', 'invoiced');
insert into public.invoices (id, number, status, client_id, client_name, issued_at, due_date, total_ht, total_vat, total_ttc) values
  ('80000000-0000-0000-0000-000000000148', 'F90148', 'issued', '20000000-0000-0000-0000-000000000001', 'Transports Dupont',
   now(), :'today'::date + 30, 495, 99, 594);
insert into public.invoice_repair_orders (invoice_id, repair_order_id) values
  ('80000000-0000-0000-0000-000000000148', '50000000-0000-0000-0000-000000000148');
insert into public.invoice_lines (id, invoice_id, repair_order_id, line_type, description, unit_price, quantity, billed_hours,
                                  purchase_price, shipping_cost) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000148', '50000000-0000-0000-0000-000000000148',
   'labor', 'Disques', 90, 3, 3, null, null),
  -- Pièce vendue 80 € (achat 50 €, port 5 €) et fournitures : vendues par Bruno
  ('81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000148', '50000000-0000-0000-0000-000000000148',
   'part', 'Disque', 80, 1, null, 50, 5),
  ('81000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000148', '50000000-0000-0000-0000-000000000148',
   'consumable', 'Fournitures et recyclage', 15, 1, null, null, null),
  -- Ligne sans salarié : technicien de l'OR (Alice)
  ('81000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000148', '50000000-0000-0000-0000-000000000148',
   'part', 'Plaquettes', 130, 1, null, 100, null);
insert into public.invoice_line_employees (invoice_line_id, technician_id) values
  ('81000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000a1'),
  ('81000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b1'),
  ('81000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-0000000000b1');
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select results_eq(
  format($$ select name, labor_ht, sales_margin_ht, billed_hours, ro_count
            from public.technician_performance(%L, %L)
            where technician_id in ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b1') order by name $$, :'today'::date - 1, :'today'::date + 1),
  $$ values ('Alice'::text, 270.00::numeric, 30.00::numeric, 3.00::numeric, 1::bigint),
            ('Bruno', 0, 40.00, 0, 1) $$,
  'Alice : main d''œuvre et ligne sans salarié ; Bruno : marge de la pièce (25 €) + fournitures (15 €)');

-- La direction change le vendeur de la pièce : la marge passe à Alice
select public.set_invoice_line_employee('81000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000a1');
select results_eq(
  format($$ select name, sales_margin_ht from public.technician_performance(%L, %L)
            where technician_id in ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b1') order by name $$,
         :'today'::date - 1, :'today'::date + 1),
  $$ values ('Alice'::text, 55.00::numeric), ('Bruno', 15.00) $$,
  'Vendeur changé sur la facture : sa performance suit');

-- Compte du bureau qui badge (fiche technicien liée au profil) : ses ventes comptent sur sa fiche
reset role;
insert into public.technicians (id, profile_id, display_name, exclude_from_planning) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Réception', true);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.set_invoice_line_employee('81000000-0000-0000-0000-000000000003', null, '00000000-0000-0000-0000-0000000000e1');
select is((select sales_margin_ht from public.technician_performance(:'today'::date - 1, :'today'::date + 1)
           where technician_id = '10000000-0000-0000-0000-0000000000e1'), 15.00::numeric, 'Fournitures vendues par l''accueil : +15 € dans ses ventes');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select * from public.technician_performance() $$, '42501', null, 'Réservé à la direction');

select * from finish();
rollback;
