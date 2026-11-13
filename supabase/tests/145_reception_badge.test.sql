-- =============================================================================
-- La réception badge : fiche technicien obligatoire, hors planning au départ, planning au choix
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

-- Nouveau compte réception sans fiche : refusé
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001e1', 'accueil.sans@test.fr'),
  ('00000000-0000-0000-0000-0000000001e2', 'accueil@test.fr');
select throws_ok(
  $$ select public.admin_register_account('00000000-0000-0000-0000-0000000001e1', 'accueil.sans@test.fr', 'Sans fiche', 'reception') $$,
  '22023', 'Un compte réception doit avoir une fiche technicien pour badger', 'Compte réception sans fiche refusé');

-- Avec sa fiche (envoyée hors planning par l'écran Équipe)
select lives_ok(
  $$ select public.admin_register_account('00000000-0000-0000-0000-0000000001e2', 'accueil@test.fr', 'Sophie Durand',
       'reception', '{"display_name": "Sophie", "exclude_from_planning": true}') $$,
  'Compte réception créé avec sa fiche');
select ok((select exclude_from_planning and is_active from public.technicians
           where profile_id = '00000000-0000-0000-0000-0000000001e2'),
          'Fiche de la réception active, hors planning');

-- Contrairement au comptable, la direction peut la mettre au planning
update public.technicians set exclude_from_planning = false where profile_id = '00000000-0000-0000-0000-0000000001e2';
select ok(not (select exclude_from_planning from public.technicians where profile_id = '00000000-0000-0000-0000-0000000001e2'),
          'Réception remise au planning par la direction');

-- Elle badge à la borne avec son code
insert into public.technician_pins (technician_id, pin_hash, algorithm)
select id, extensions.crypt('4242', extensions.gen_salt('bf', 4)), 'bcrypt'
from public.technicians where profile_id = '00000000-0000-0000-0000-0000000001e2';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');  -- borne de badgeage
select results_eq(
  $$ select r ->> 'technician_name', r ->> 'event_type'
     from (select public.kiosk_clock('4242', pg_temp.fake_file('clock_photo')) as r) x $$,
  $$ values ('Sophie', 'in') $$,
  'La réception pointe son arrivée à la borne');

-- Son pointage apparaît dans les présences du bureau
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.clock_events c join public.technicians t on t.id = c.technician_id
           where t.profile_id = '00000000-0000-0000-0000-0000000001e2'), 1,
          'Pointage de la réception visible par la direction');

-- Les autres rôles ne changent pas : direction sans fiche acceptée
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000001d2', 'patron2@test.fr');
select lives_ok(
  $$ select public.admin_register_account('00000000-0000-0000-0000-0000000001d2', 'patron2@test.fr', 'Patron', 'direction') $$,
  'Compte direction toujours sans fiche obligatoire');

-- Ligne de travaux saisie par l'accueil (qui a sa fiche) : elle reste au technicien de l'OR
reset role;
insert into public.technicians (id, profile_id, display_name, exclude_from_planning) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'Accueil', true);
insert into public.repair_orders (id, vehicle_id, client_id, requested_work, technician_id) values
  ('50000000-0000-0000-0000-000000000145', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Freins', '10000000-0000-0000-0000-0000000000a1');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000145', 'done', 'labor', 'Disques', 2.5);
select is((select technician_id from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000145'
           and description = 'Disques'), null,
          'Ligne saisie par l''accueil : pas attribuée à sa fiche de pointage');

select * from finish();
rollback;
