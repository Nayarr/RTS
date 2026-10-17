-- =============================================================================
-- Pièces : même désignation, référence et marque reprises ; marge sur le prix d'achat
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.parts (id, designation, manufacturer_ref, brand, purchase_price, sale_price)
values ('9a000000-0000-0000-0000-000000000001', 'Filtre à huile', 'HU 12 140 x', 'Mann-Filter', 20, 30);

select is(public.find_catalog_part('  filtre à HUILE ', 'hu 12 140 x', 'MANN-FILTER'),
          '9a000000-0000-0000-0000-000000000001'::uuid, 'Même pièce, casse et espaces ignorés');
select is(public.find_catalog_part('Filtre à huile', 'HU 12 140 x', 'Bosch'), null,
          'Autre marque : nouvelle pièce');
select is(public.find_catalog_part('Filtre à huile', 'HU 12 141', 'Mann-Filter'), null,
          'Autre référence : nouvelle pièce');

-- Marge sur le prix d'achat seul (port facturé à part)
select is(public.part_sale_price(100, 10, 'percent', 30), 130.00::numeric, 'Achat 100 €, marge 30 % : 130 €');

-- Prix de vente saisi : gardé tel quel même avec une marge arrondie
insert into public.parts (id, designation, purchase_price, sale_price, margin_kind, margin_value)
values ('9a000000-0000-0000-0000-000000000002', 'Courroie', 7, 10, 'percent', 42.86);
select is((select sale_price from public.parts where id = '9a000000-0000-0000-0000-000000000002'), 10.00::numeric,
          'Prix de vente saisi gardé');
-- Sans prix de vente : calculé depuis la marge
insert into public.parts (id, designation, purchase_price, margin_kind, margin_value)
values ('9a000000-0000-0000-0000-000000000003', 'Ampoule', 4, 'percent', 50);
select is((select sale_price from public.parts where id = '9a000000-0000-0000-0000-000000000003'), 6.00::numeric,
          'Sans prix de vente : calculé depuis la marge');

select * from finish();
rollback;
