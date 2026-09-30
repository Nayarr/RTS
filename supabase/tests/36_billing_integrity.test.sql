-- =============================================================================
-- Intégrité de la facturation : une facture par OR (sauf après avoir total), OR facturé
-- figé, contrat facturé une fois par mois, paiement jamais daté dans le futur
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins', '10000000-0000-0000-0000-0000000000a1', 'work_done'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Feux', null, 'work_done');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000001', 'done', 'labor', 'Plaquettes', 2),
  ('50000000-0000-0000-0000-000000000002', 'done', 'labor', 'Ampoules', 1);

-- Brouillon ouvert avant l'émission de la première facture (double-clic, deux postes…)
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]) as first \gset
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid,
                                        '50000000-0000-0000-0000-000000000002'::uuid]) as grouped \gset
select public.issue_invoice(:'first') as number \gset

-- ---------------------------------------------------------------- Une seule facture par OR
select throws_ok($$ select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]) $$,
  'P0001', null, 'OR facturé : pas de nouveau brouillon');
select throws_ok(format($$ select public.issue_invoice(%L) $$, :'grouped'),
  'P0001', null, 'Brouillon préparé avant : son émission est refusée');
reset role;
select matches(
  (select public.active_invoice_number('50000000-0000-0000-0000-000000000001')), '^F\d+$',
  'Facture active de l''OR identifiée');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

-- ---------------------------------------------------------------- OR facturé figé
select throws_ok($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'OR facturé : « terminer » refusé');
select throws_ok($$ select public.tech_update_repair_order('50000000-0000-0000-0000-000000000001', '{"mileage": 1}') $$,
  '42501', null, 'OR facturé : kilométrage figé');
select throws_ok($$ update public.repair_orders set status = 'work_done' where id = '50000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'OR facturé : pas de retour en arrière du statut');

-- ---------------------------------------------------------------- Avoir total : nouvelle facture possible
insert into public.credit_notes (invoice_id, reason, amount_ht)
select id, 'Erreur de prix', total_ht from public.invoices where id = :'first';
reset role;
select is(public.active_invoice_number('50000000-0000-0000-0000-000000000001'), null,
  'Facture entièrement annulée par avoir : plus active');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]) $$,
  'Après l''avoir : nouvelle facture possible');
select lives_ok($$ update public.repair_orders set mileage = 150000 where id = '50000000-0000-0000-0000-000000000001' $$,
  'Après l''avoir : OR de nouveau modifiable');

-- ---------------------------------------------------------------- Contrat : une facture par mois
insert into public.maintenance_contracts (id, client_id, service_description, frequency_months, monthly_price_ht)
values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Entretien', 3, 150);
select public.build_contract_invoice_draft('70000000-0000-0000-0000-000000000001', '2026-09-01') as contract \gset
select is(public.build_contract_invoice_draft('70000000-0000-0000-0000-000000000001', '2026-09-15'), :'contract'::uuid,
  'Même mois : le brouillon existant est repris');
select public.issue_invoice(:'contract');
select throws_ok($$ select public.build_contract_invoice_draft('70000000-0000-0000-0000-000000000001', '2026-09-01') $$,
  'P0001', null, 'Mois déjà facturé : refusé');
select isnt(public.build_contract_invoice_draft('70000000-0000-0000-0000-000000000001', '2026-10-01'), :'contract'::uuid,
  'Mois suivant : nouvelle facture');
select is((select count(*)::integer from public.invoices where maintenance_contract_id = '70000000-0000-0000-0000-000000000001'),
  2, 'Deux factures au total (septembre émise, octobre en brouillon)');

-- ---------------------------------------------------------------- Paiements
select throws_ok(format($$ insert into public.payments (invoice_id, amount_ttc, method, paid_on)
                           values (%L, 10, 'bank_transfer', current_date + 5) $$, :'contract'),
  '22023', 'La date du paiement ne peut pas être dans le futur', 'Paiement daté dans le futur refusé');
select lives_ok(format($$ insert into public.payments (invoice_id, amount_ttc, method, paid_on)
                          values (%L, 10, 'bank_transfer', public.paris_date(now())) $$, :'contract'),
  'Paiement du jour accepté');

-- ---------------------------------------------------------------- Droits
select throws_ok($$ select public.active_invoice_number('50000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'Fonction interne : pas appelable depuis l''appli');
reset role;
select lives_ok($$ update public.repair_orders set pre_quote_work_settled_at = now()
                   where id = '50000000-0000-0000-0000-000000000002' $$,
  'Colonnes tenues à jour automatiquement : toujours modifiables');

select * from finish();
rollback;
