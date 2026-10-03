-- =============================================================================
-- Ligne « Fournitures et recyclage » ajoutée aux nouveaux devis et factures
-- (montant des Réglages ; supprimable et modifiable ; pas pour les contrats)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

update public.company_settings set supplies_fee_ht = 15;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work) values
  ('50000000-0000-0000-0000-000000000046', '30000000-0000-0000-0000-000000000001', 'Freins');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000046', 'done', 'labor', 'Plaquettes', 2);

-- ---------------------------------------------------------------- Devis
select id as quote from public.create_quote('Transports Dupont', 'AB-123-CD', 'pl') \gset
select results_eq(
  format($$ select section::text, line_type::text, description, unit_price, quantity, vat_rate
            from public.quote_lines where quote_id = %L $$, :'quote'),
  $$ values ('planned', 'consumable', 'Fournitures et recyclage', 15.00::numeric, 1.00::numeric, 20.00::numeric) $$,
  'Nouveau devis : ligne « Fournitures et recyclage » à 15 € HT');
select lives_ok(format($$ update public.quote_lines set unit_price = 12.5 where quote_id = %L $$, :'quote'),
  'Montant modifiable sur le devis');
select lives_ok(format($$ delete from public.quote_lines where quote_id = %L $$, :'quote'),
  'Ligne supprimable du devis');

-- ---------------------------------------------------------------- Facture (brouillon, pro forma)
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000046'::uuid]) as draft \gset
select results_eq(
  format($$ select line_type::text, description, net_ht from public.invoice_lines where invoice_id = %L order by position $$, :'draft'),
  $$ values ('labor', 'Plaquettes', 180.00::numeric), ('consumable', 'Fournitures et recyclage', 15.00::numeric) $$,
  'Nouvelle facture : la ligne vient en dernier, après les travaux');
select is((select total_ht from public.v_invoices_overview where id = :'draft'), 195.00::numeric,
          'Comptée dans le total HT');
select lives_ok(format($$ delete from public.invoice_lines where invoice_id = %L and line_type = 'consumable' $$, :'draft'),
  'Ligne supprimable de la facture');

-- ---------------------------------------------------------------- Contrat d'entretien : pas de ligne
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
insert into public.maintenance_contracts (id, client_id, service_description, frequency_months, monthly_price_ht)
values ('70000000-0000-0000-0000-000000000046', '20000000-0000-0000-0000-000000000001', 'Entretien', 3, 150);
select public.build_contract_invoice_draft('70000000-0000-0000-0000-000000000046', '2026-09-01') as contract \gset
select is((select count(*)::int from public.invoice_lines where invoice_id = :'contract' and line_type = 'consumable'), 0,
          'Facture de contrat : pas de ligne de fournitures');

-- ---------------------------------------------------------------- Montant vide : aucune ligne
reset role;
update public.company_settings set supplies_fee_ht = null;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select id as other from public.create_quote('Transports Dupont', 'AB-123-CD', 'pl') \gset
select is((select count(*)::int from public.quote_lines where quote_id = :'other'), 0,
          'Réglage vide : pas de ligne ajoutée');

select * from finish();
rollback;
