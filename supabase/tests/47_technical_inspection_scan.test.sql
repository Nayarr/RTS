-- =============================================================================
-- Contrôle technique lu depuis l'OR : échéance et VIN enregistrés sur le véhicule
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, requested_work, technician_id) values
  ('50000000-0000-0000-0000-000000000047', '30000000-0000-0000-0000-000000000001', 'Entretien',
   '10000000-0000-0000-0000-0000000000a1');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne assignée
select lives_ok($$ select public.update_vehicle_deadlines('50000000-0000-0000-0000-000000000047',
                   '{"ct_due_date": "2027-03-31", "vin": "vf6 1234-5678 901234"}') $$,
  'Échéance du contrôle technique et VIN enregistrés depuis l''OR');
select results_eq(
  $$ select ct_due_date, vin from public.vehicles where id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('2027-03-31'::date, 'VF612345678901234') $$,
  'VIN mis en forme (majuscules, sans espaces ni tirets) sur la fiche véhicule');
select throws_ok($$ select public.update_vehicle_deadlines('50000000-0000-0000-0000-000000000047', '{"vin": "VF61234567890123O"}') $$,
  '22023', 'VIN invalide : 17 caractères (lettres sauf I, O, Q, et chiffres)', 'VIN invalide refusé');
select throws_ok($$ select public.update_vehicle_deadlines('50000000-0000-0000-0000-000000000047', '{"plate": "XX-000-XX"}') $$,
  '22023', 'Champ non modifiable : plate', 'Seuls les échéances et le VIN se modifient depuis l''OR');

select * from finish();
rollback;
