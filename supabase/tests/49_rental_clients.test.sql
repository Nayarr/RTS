-- =============================================================================
-- Location — clients particuliers (nom affiché « Prénom Nom ») et permis de conduire
-- (bureau uniquement ; permis utilisable si scanné recto/verso, catégorie couverte, valide)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Client particulier
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select lives_ok($$
  insert into public.clients (id, kind, civility, first_name, last_name, birth_date, birth_place, phone, name)
  values ('20000000-0000-0000-0000-000000000049', 'individual', 'Mme', 'Julie', 'Martin', '1991-03-14', 'Pontoise',
          '06 12 34 56 78', '')
$$, 'La réception crée un client particulier');
select is((select name from public.clients where id = '20000000-0000-0000-0000-000000000049'), 'Julie Martin',
          'Nom affiché : « Prénom Nom »');
update public.clients set last_name = 'Martin-Leroy' where id = '20000000-0000-0000-0000-000000000049';
select is((select name from public.v_clients_overview where id = '20000000-0000-0000-0000-000000000049'),
          'Julie Martin-Leroy', 'Nom tenu à jour quand l’identité change (liste des clients comprise)');
select throws_ok($$
  insert into public.clients (kind, first_name, name) values ('individual', 'Paul', '')
$$, '23514', null, 'Particulier sans nom de famille : refusé');
select is((select kind::text from public.clients where id = '20000000-0000-0000-0000-000000000001'), 'pro',
          'Les clients existants restent professionnels');

-- ---------------------------------------------------------------- Permis
select lives_ok($$
  insert into public.driving_licenses (id, client_id, last_name, first_name, birth_date, license_number,
                                       categories, issued_on, valid_until, recto_file_id, read_automatically)
  values ('90000000-0000-0000-0000-000000000049', '20000000-0000-0000-0000-000000000049', 'MARTIN', 'Julie',
          '1991-03-14', '910395200123', '{B,BE}', '2010-06-22', '2033-06-22', pg_temp.fake_file('other'), true)
$$, 'La réception enregistre le permis scanné');
select throws_ok($$
  update public.driving_licenses set categories = '{B,Z}' where id = '90000000-0000-0000-0000-000000000049'
$$, '23514', null, 'Catégorie de permis inconnue : refusée');

select is((select public.license_block_reason(l, 'B', '2026-10-10') from public.driving_licenses l
           where id = '90000000-0000-0000-0000-000000000049'),
          'Permis à scanner (recto et verso)', 'Verso manquant : pas de location');
update public.driving_licenses set verso_file_id = pg_temp.fake_file('other')
 where id = '90000000-0000-0000-0000-000000000049';
select is((select public.license_block_reason(l, 'B', '2026-10-10') from public.driving_licenses l
           where id = '90000000-0000-0000-0000-000000000049'), null, 'Permis B scanné et valide : utilisable');
select is((select public.license_block_reason(l, 'C', '2026-10-10') from public.driving_licenses l
           where id = '90000000-0000-0000-0000-000000000049'), 'Permis C requis', 'Catégorie non couverte');
select is((select public.license_block_reason(l, 'B', '2033-07-01') from public.driving_licenses l
           where id = '90000000-0000-0000-0000-000000000049'),
          'Permis expiré le 22/06/2033', 'Permis expiré avant la fin de la location');
select ok(public.license_covers('{B,C,CE}', 'C1') and public.license_covers('{B,C,CE}', 'BE')
          and not public.license_covers('{B}', 'BE'), 'C couvre C1, CE couvre BE ; B ne couvre pas BE');

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select is((select count(*)::int from public.driving_licenses), 0, 'Le technicien ne voit pas les permis');
select throws_ok($$
  insert into public.driving_licenses (client_id, last_name, first_name)
  values ('20000000-0000-0000-0000-000000000049', 'X', 'Y')
$$, '42501', null, 'Le technicien ne peut pas enregistrer de permis');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
delete from public.clients where id = '20000000-0000-0000-0000-000000000049';
select is((select count(*)::int from public.driving_licenses where id = '90000000-0000-0000-0000-000000000049'), 0,
          'Client supprimé : son permis aussi');

select * from finish();
rollback;
