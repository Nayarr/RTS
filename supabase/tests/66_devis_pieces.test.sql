-- =============================================================================
-- SIRET contrôlé, prix de vente calculé depuis la marge, statistiques pièces
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- SIRET
select ok(public.is_valid_siret('98498913700018'), 'SIRET valide (clé de Luhn)');
select ok(not public.is_valid_siret('98498913700019'), 'Clé de contrôle fausse : refusé');
select ok(not public.is_valid_siret('984989137'), 'Un SIREN (9 chiffres) n''est pas un SIRET');
select ok(public.is_valid_siret('35600000000056'), 'La Poste : somme des chiffres multiple de 5');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ update public.clients set siret = '12345678900016' where id = '20000000-0000-0000-0000-000000000001' $$,
                 '23514', null, 'Un SIRET invalide est refusé sur la fiche client');

-- ---------------------------------------------------------------- Marge
insert into public.parts (id, designation, vehicle_ref, manufacturer_ref, purchase_price, shipping_cost, margin_kind, margin_value)
values ('60000000-0000-0000-0000-000000000001', 'Plaquettes avant', 'Volvo FH 500', 'K-1137', 100, 10, 'percent', 30);
select is((select sale_price from public.parts where id = '60000000-0000-0000-0000-000000000001'),
          143.00::numeric, 'Marge 30 % sur achat + port : (100 + 10) × 1,3 = 143 € HT');

update public.parts set margin_kind = 'amount', margin_value = 25 where id = '60000000-0000-0000-0000-000000000001';
select is((select sale_price from public.parts where id = '60000000-0000-0000-0000-000000000001'),
          135.00::numeric, 'Marge fixe de 25 € : 100 + 10 + 25 = 135 € HT');

insert into public.parts (id, designation, sale_price) values ('60000000-0000-0000-0000-000000000002', 'Ampoule H7', 9.5);
select is((select sale_price from public.parts where id = '60000000-0000-0000-0000-000000000002'),
          9.50::numeric, 'Sans marge saisie, le prix de vente est celui saisi');

-- ---------------------------------------------------------------- Statistiques et facture
update public.clients set siret = '12345678900015' where id = '20000000-0000-0000-0000-000000000001';
insert into public.invoices (id, client_id) values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
insert into public.invoice_lines (invoice_id, line_type, description, unit_price, quantity, part_id, purchase_price, shipping_cost)
values ('70000000-0000-0000-0000-000000000001', 'part', 'Plaquettes avant', 135, 2, '60000000-0000-0000-0000-000000000001', 100, 20);
select public.issue_invoice('70000000-0000-0000-0000-000000000001');

select is((select client_siret from public.invoices where id = '70000000-0000-0000-0000-000000000001'),
          '12345678900015', 'Le SIRET du client est figé sur la facture émise');
select results_eq(
  $$ select invoices_count, quantity_sold, revenue_ht, margin_ht from public.v_part_stats
     where id = '60000000-0000-0000-0000-000000000001' $$,
  $$ values (1::bigint, 2.00::numeric, 270.00::numeric, 50.00::numeric) $$,
  'Statistiques : 2 pièces vendues, 270 € HT, marge 270 − 200 − 20 = 50 €');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select is((select count(*) from public.v_part_stats), 0::bigint, 'Un technicien ne voit pas les statistiques pièces');

select * from finish();
rollback;
