-- =============================================================================
-- Gestion de l'équipe : enregistrement des comptes, garde-fou direction, PIN
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir helpers/fixtures.psql

-- Test indépendant des données de développement : seule direction@test.fr reste direction active.
update public.profiles set is_active = false
where role = 'direction' and email <> 'direction@test.fr';

-- ---------------------------------------------------------------- Enregistrement (Edge Function)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'nouveau.tech@test.fr'),
  ('00000000-0000-0000-0000-0000000000f2', 'nouvelle.recep@test.fr');

set local role service_role;
select lives_ok(
  $$ select public.admin_register_account('00000000-0000-0000-0000-0000000000f1', ' Nouveau.Tech@test.fr ',
       'Karim Benali', 'technician', '{"display_name": "Karim", "color": "#8B3A9E"}') $$,
  'La clé de service enregistre un technicien');
select throws_like(
  $$ select public.admin_register_account('00000000-0000-0000-0000-0000000000f2', 'nouvelle.recep@test.fr',
       'Sans fiche', 'technician') $$,
  '%fiche technicien%', 'Un compte technicien exige une fiche technicien');
reset role;

select results_eq(
  $$ select p.email, p.role::text, t.display_name, t.color
     from public.profiles p join public.technicians t on t.profile_id = p.id
     where p.id = '00000000-0000-0000-0000-0000000000f1' $$,
  $$ values ('nouveau.tech@test.fr'::text, 'technician'::text, 'Karim'::text, '#8B3A9E'::text) $$,
  'Profil (e-mail normalisé) et fiche technicien créés ensemble');

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_like(
  $$ select public.admin_register_account('00000000-0000-0000-0000-0000000000f2', 'x@test.fr', 'X', 'reception') $$,
  '%permission denied%', 'Même la direction ne peut pas appeler directement l''enregistrement (Edge Function obligatoire)');

select lives_ok($$ update public.profiles set full_name = 'Réception principale' where email = 'reception@test.fr' $$,
                'La direction modifie un profil');
select lives_ok($$ update public.technicians set exclude_from_planning = true, rest_group = 'A'
                   where display_name = 'Bruno' $$,
                'La direction modifie une fiche technicien (planning, repos)');

-- ---------------------------------------------------------------- Garde-fou direction
select throws_like($$ update public.profiles set is_active = false where email = 'direction@test.fr' $$,
                   '%au moins un compte Direction%', 'Impossible de désactiver la dernière direction');
select throws_like($$ update public.profiles set role = 'reception' where email = 'direction@test.fr' $$,
                   '%au moins un compte Direction%', 'Impossible de rétrograder la dernière direction');

update public.profiles set role = 'direction' where email = 'reception@test.fr';
select lives_ok($$ update public.profiles set role = 'reception' where email = 'direction@test.fr' $$,
                'Possible dès qu''une autre direction active existe');

-- ---------------------------------------------------------------- PIN
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');   -- désormais direction
select public.set_technician_pin('10000000-0000-0000-0000-0000000000a1', '4321');
select results_eq($$ select technician_id from public.technician_pin_status() $$,
                  $$ values ('10000000-0000-0000-0000-0000000000a1'::uuid) $$,
                  'La direction voit quels techniciens ont un PIN (sans l''empreinte)');
select lives_ok($$ select public.clear_technician_pin('10000000-0000-0000-0000-0000000000a1') $$,
                'La direction supprime un PIN');

reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_like($$ select * from public.technician_pin_status() $$, '%réservé à la direction%',
                   'Un technicien ne voit pas l''état des PIN');

select * from finish();
rollback;
