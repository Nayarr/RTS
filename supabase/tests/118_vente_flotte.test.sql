-- =============================================================================
-- Vente d'un véhicule de la flotte : TVA normale ou sur la marge, comptabilité, annulation
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

\ir helpers/fixtures.psql

select is(public.invoice_margin_vat(12000, 9000, 20), 500.00::numeric, 'Marge 3 000 € TTC à 20 % : 500 € de TVA');
select is(public.invoice_margin_vat(8000, 9000, 20), 0.00::numeric, 'Vendu à perte : pas de TVA');

insert into public.fleet_vehicles (id, plate, brand, model, category, daily_rate, vin, first_registration, mileage) values
  ('f0000000-0000-0000-0000-000000000001', 'VE-001-AA', 'Renault', 'Master', 'van', 80, 'VF620J861GB002211', '2019-03-05', 120000),
  ('f0000000-0000-0000-0000-000000000002', 'VE-002-AA', 'Iveco', 'Daily', 'van', 80, null, null, null),
  ('f0000000-0000-0000-0000-000000000003', 'VE-003-AA', 'Volvo', 'FH', 'tractor', 150, null, null, null);

-- ---------------------------------------------------------------- Refus
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice (technicienne)
select throws_ok($$ select public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000001',
                    '20000000-0000-0000-0000-000000000001', now(), 120500, 'normal', 10000) $$,
                 '42501', null, 'Technicien : vente refusée');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_like($$ select public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000001',
                      '20000000-0000-0000-0000-000000000001', now(), 120500, 'margin', 12000) $$,
                   '%prix d''achat%', 'TVA sur la marge : prix d''achat obligatoire');
select throws_like($$ select public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000001',
                      '20000000-0000-0000-0000-000000000001', now(), 120500, 'normal', 0) $$,
                   '%prix de vente%', 'Prix de vente obligatoire');

-- ---------------------------------------------------------------- TVA sur la marge
create temporary table sold (invoice_id uuid) on commit drop;
grant all on sold to authenticated;
insert into sold select public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '2026-11-03 14:30+00', 120500, 'margin', 12000, 9000);

select is((select count(*)::integer from public.invoice_lines where invoice_id = (select invoice_id from sold)), 1,
          'Le véhicule seul sur la facture (pas de fournitures et recyclage)');
select is((select vat_rate from public.invoice_lines where invoice_id = (select invoice_id from sold)), 0.00::numeric,
          'Ligne sans TVA détaillée');
select ok((select description like '%VE-001-AA%N° de série VF620J861GB002211%120500 km%'
           from public.invoice_lines where invoice_id = (select invoice_id from sold)), 'Désignation complète');
select is((select row(total_ht, total_vat, total_ttc)::text from public.v_invoice_totals
           where invoice_id = (select invoice_id from sold)), '(11500.00,500.00,12000.00)',
          'Brouillon : TVA de la marge calculée pour la comptabilité');
select is((select is_active from public.fleet_vehicles where id = 'f0000000-0000-0000-0000-000000000001'), false,
          'Le véhicule sort de la flotte');
select is((select mileage from public.fleet_vehicles where id = 'f0000000-0000-0000-0000-000000000001'), 120500,
          'Kilométrage mis à jour');
select throws_like($$ select public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000001',
                      '20000000-0000-0000-0000-000000000001', now(), 120500, 'normal', 10000) $$,
                   '%déjà vendu%', 'Pas de seconde vente');
select throws_like($$ insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity)
                      select invoice_id, 1, 'labor', 'Vidange', 90, 1 from sold $$,
                   '%ne porte que le véhicule%', 'Rien d''autre sur une vente à la marge');
select throws_like($$ select public.set_invoice_vat_exempt((select invoice_id from sold), true) $$,
                   '%ne peut pas être sans TVA%', 'Pas d''exonération sur une vente à la marge');
select throws_like($$ select public.cancel_fleet_vehicle_sale('f0000000-0000-0000-0000-000000000002') $$,
                   '%pas vendu%', 'Annulation d''un véhicule non vendu refusée');

select public.issue_invoice((select invoice_id from sold));
select is((select row(total_ht, total_vat, total_ttc)::text from public.invoices where id = (select invoice_id from sold)),
          '(11500.00,500.00,12000.00)', 'Émission : montants figés');
select ok((select vat_exempt_mention like '%régime particulier - biens d''occasion%297 A%' from public.invoices
           where id = (select invoice_id from sold)), 'Mention du régime sur la facture');

-- Facture en ligne : ni TVA ni marge pour l'acheteur
select public.share_invoice((select invoice_id from sold));
reset role;  -- document en ligne : lu par la fonction serveur
select is((select public.public_find_document(public_token) -> 'totals' from public.invoices where id = (select invoice_id from sold)),
          '{"total_ht": 12000.00, "total_vat": 0, "total_ttc": 12000.00}'::jsonb, 'En ligne : prix TTC seul');
select ok((select (public.public_find_document(public_token))::text !~ '(9000|margin_purchase)' from public.invoices
           where id = (select invoice_id from sold)), 'En ligne : prix d''achat absent');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_like($$ select public.cancel_fleet_vehicle_sale('f0000000-0000-0000-0000-000000000001') $$,
                   '%avoir de la totalité%', 'Facture émise : avoir exigé avant l''annulation');

-- ---------------------------------------------------------------- TVA normale, brouillon supprimé
truncate sold;
insert into sold select public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001', now(), null, 'normal', 10000);
select is((select row(total_ht, total_vat, total_ttc)::text from public.v_invoice_totals
           where invoice_id = (select invoice_id from sold)), '(10000.00,2000.00,12000.00)', 'TVA normale : 20 % sur le tout');
delete from public.invoices where id = (select invoice_id from sold);
select is((select is_active from public.fleet_vehicles where id = 'f0000000-0000-0000-0000-000000000002'), true,
          'Brouillon supprimé : véhicule remis en flotte');
select is((select sold_on from public.fleet_vehicles where id = 'f0000000-0000-0000-0000-000000000002'), null,
          'Brouillon supprimé : plus de date de vente');

-- ---------------------------------------------------------------- Location en cours : vente refusée
reset role;
set local session_replication_role = replica;
insert into public.rentals (fleet_vehicle_id, client_id, kind, status, number, departure_at, planned_return_at, rate_period, unit_price, periods)
values ('f0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'rental', 'active', 'LC-T-0001',
        now(), now() + interval '2 days', 'day', 100, 2);
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_like($$ select public.sell_fleet_vehicle('f0000000-0000-0000-0000-000000000003',
                      '20000000-0000-0000-0000-000000000001', now(), null, 'normal', 10000) $$,
                   '%location en cours%', 'Location en cours : vente refusée');

select * from finish();
rollback;
