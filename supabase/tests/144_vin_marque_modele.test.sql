-- =============================================================================
-- Contrôle technique lu : marque et modèle sur la fiche véhicule s'ils y manquent,
-- marque déduite du code constructeur du VIN
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

select results_eq(
  $$ select public.vin_brand('vf6 1234-5678 901234'), public.vin_brand('YS2R4X20005123456'),
            public.vin_brand('XLRTE47MS0E123456'), public.vin_brand('ZZZ12345678901234'), public.vin_brand(null) $$,
  $$ values ('Renault Trucks'::text, 'Scania'::text, 'DAF'::text, null::text, null::text) $$,
  'Marque tirée des 3 premiers caractères du VIN, sinon rien');

insert into public.repair_orders (id, vehicle_id, requested_work, technician_id) values
  ('50000000-0000-0000-0000-000000000144', '30000000-0000-0000-0000-000000000001', 'Entretien',
   '10000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000145', '30000000-0000-0000-0000-000000000003', 'Entretien',
   '10000000-0000-0000-0000-0000000000a1');
update public.vehicles set brand = null, model = null where id = '30000000-0000-0000-0000-000000000001';
update public.vehicles set brand = 'Renault', model = 'Master' where id = '30000000-0000-0000-0000-000000000003';

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne assignée

-- Vignette : VIN seul, fiche sans marque : marque déduite du VIN
select lives_ok($$ select public.update_vehicle_deadlines('50000000-0000-0000-0000-000000000144',
                   '{"vin": "VF612345678901234"}') $$, 'VIN enregistré depuis l''OR');
select results_eq(
  $$ select brand, model from public.vehicles where id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('Renault Trucks'::text, null::text) $$,
  'Marque vide remplie depuis le VIN ; modèle inconnu (le VIN ne le donne pas)');

-- Procès-verbal : modèle lu, la marque déjà remplie reste
select lives_ok($$ select public.update_vehicle_deadlines('50000000-0000-0000-0000-000000000144',
                   '{"ct_due_date": "2027-03-31", "brand": "RENAULT", "model": "  T 480  "}') $$,
  'Échéance, marque et modèle lus sur le procès-verbal');
select results_eq(
  $$ select brand, model, ct_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values ('Renault Trucks'::text, 'T 480'::text, '2027-03-31'::date) $$,
  'Modèle vide rempli (espaces retirés), marque déjà connue gardée');

-- Fiche déjà complète : rien n'est remplacé
select lives_ok($$ select public.update_vehicle_deadlines('50000000-0000-0000-0000-000000000145',
                   '{"vin": "VF1MA000000000001", "brand": "Peugeot", "model": "Boxer"}') $$,
  'Lecture sur un véhicule déjà renseigné');
select results_eq(
  $$ select brand, model, vin from public.vehicles where id = '30000000-0000-0000-0000-000000000003' $$,
  $$ values ('Renault'::text, 'Master'::text, 'VF1MA000000000001'::text) $$,
  'Marque et modèle saisis par le bureau jamais remplacés, VIN enregistré');

select throws_ok($$ select public.update_vehicle_deadlines('50000000-0000-0000-0000-000000000144', '{"plate": "XX-000-XX"}') $$,
  '22023', 'Champ non modifiable : plate', 'Toujours pas d''immatriculation modifiable depuis l''OR');

select * from finish();
rollback;
