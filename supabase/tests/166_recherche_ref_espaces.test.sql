-- =============================================================================
-- Recherche de pièce par référence, avec ou sans espaces, tirets, points ou barres
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir helpers/fixtures.psql

insert into public.parts (id, designation, manufacturer_ref, oem_ref, vehicle_ref) values
  ('9c000000-0000-0000-0000-000000001661', 'Filtre gasoil', 'Rx9767BF', null, null),
  ('9c000000-0000-0000-0000-000000001662', 'Filtre à air', 'AX 1200', 'RX 9767 BF', null),
  ('9c000000-0000-0000-0000-000000001663', 'Joint RX-9767.BF/2 de culasse', null, null, null),
  ('9c000000-0000-0000-0000-000000001664', 'Durite', null, null, 'Renault T 480 / réf. DU 55-12'),
  ('9c000000-0000-0000-0000-000000001665', 'Ampoule H7 essai', null, null, null),
  ('9c000000-0000-0000-0000-000000001666', 'Phare avant', 'K-77', null, null);

create function pg_temp.found(p_term text) returns text[] language sql as $$
  select array_agg(designation order by designation) from public.search_parts(p_term)
  where id::text like '9c000000-0000-0000-0000-00000000166%';
$$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

select is(pg_temp.found('Rx9767 BF'),
          array['Filtre à air', 'Filtre gasoil', 'Joint RX-9767.BF/2 de culasse'],
          'Saisie avec espace : références fabricant, constructeur et désignation sans espace');
select is(pg_temp.found('Rx9767BF'),
          array['Filtre à air', 'Filtre gasoil', 'Joint RX-9767.BF/2 de culasse'],
          'Saisie sans espace : référence enregistrée « RX 9767 BF » trouvée');
select is(pg_temp.found('rx-9767.bf'),
          array['Filtre à air', 'Filtre gasoil', 'Joint RX-9767.BF/2 de culasse'],
          'Casse, tirets et points ignorés');
select is(pg_temp.found('RX 9767/BF'),
          array['Filtre à air', 'Filtre gasoil', 'Joint RX-9767.BF/2 de culasse'], 'Barres ignorées');
select is(pg_temp.found('du5512'), array['Durite'], 'Référence dans la référence véhicule');
select is(pg_temp.found('k 77'), array['Phare avant'], 'Référence courte avec espace');

-- Recherche par nom inchangée
select is(pg_temp.found('filtre'), array['Filtre à air', 'Filtre gasoil'], 'Recherche par nom');
select is(pg_temp.found('à air'), array['Filtre à air'], 'Nom avec espace et accent');
select is(pg_temp.found('egas'), null,
          'Saisie sans chiffre : pas de recherche sans espaces dans la désignation');
select is(pg_temp.found('H7'), array['Ampoule H7 essai'], 'Nom avec chiffre');

select * from finish();
rollback;
