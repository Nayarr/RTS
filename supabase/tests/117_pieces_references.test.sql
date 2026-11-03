-- =============================================================================
-- Pièces : une référence constructeur, plusieurs références fabricant / fournisseur
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

insert into public.suppliers (id, name) values ('9b000000-0000-0000-0000-000000000001', 'Autodistribution');
insert into public.parts (id, designation, manufacturer_ref, oem_ref, brand, supplier_id, sale_price) values
  ('9c000000-0000-0000-0000-000000000001', 'Filtre à huile', 'HU 12 140 x', '5010-477 842', 'Mann', null, 30),
  ('9c000000-0000-0000-0000-000000000002', 'Filtre huile', 'E 340 H', '5010477842', 'Hengst',
   '9b000000-0000-0000-0000-000000000001', 28),
  ('9c000000-0000-0000-0000-000000000003', 'Courroie', 'K-77', null, 'Gates', null, 40);

select is((select oem_key from public.parts where id = '9c000000-0000-0000-0000-000000000001'),
          (select oem_key from public.parts where id = '9c000000-0000-0000-0000-000000000002'),
          'Même référence constructeur, séparateurs ignorés');
select is((select oem_key from public.parts where id = '9c000000-0000-0000-0000-000000000003'), null,
          'Sans référence constructeur : pas de clé');

-- Fiche reprise seulement si tout est identique
select is(public.find_catalog_part('filtre à huile', 'hu12140x', 'MANN', '5010477842', ''),
          '9c000000-0000-0000-0000-000000000001'::uuid, 'Tout identique : même fiche (prix mis à jour)');
select is(public.find_catalog_part('Filtre à huile', 'HU 12 140 x', 'Mann', '5010477842', 'Autodistribution'), null,
          'Autre fournisseur : nouvelle fiche');
select is(public.find_catalog_part('Filtre à huile', 'HU 12 140 x', 'Mann', '5010477999', ''), null,
          'Autre référence constructeur : nouvelle fiche');
select is(public.find_catalog_part('Filtre huile', 'E 340 H', 'Hengst', '5010477842', 'autodistribution'),
          '9c000000-0000-0000-0000-000000000002'::uuid, 'Fournisseur comparé sans casse');

-- Recherche : les équivalentes suivent
select is((select array_agg(manufacturer_ref order by manufacturer_ref) from public.search_parts('e340h')),
          array['E 340 H', 'HU 12 140 x'], 'Réf. fabricant trouvée sans séparateurs : son équivalente aussi');
select is((select array_agg(manufacturer_ref order by manufacturer_ref) from public.search_parts('5010 477 842')),
          array['E 340 H', 'HU 12 140 x'], 'Réf. constructeur : toutes ses références');
select is((select array_agg(manufacturer_ref order by manufacturer_ref) from public.search_parts('autodistribution')),
          array['E 340 H', 'HU 12 140 x'], 'Recherche par fournisseur, équivalente comprise');

select * from finish();
rollback;
