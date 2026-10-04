-- =============================================================================
-- Location : flotte du garage : accès réservé au bureau, plaque unique,
-- boîte à gants, raison qui bloque la location (assurance / CT expirés, entretien)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Bureau : ajout d'un véhicule
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select lives_ok($$
  insert into public.fleet_vehicles (id, plate, brand, model, category, daily_rate, mileage, ct_due_date, insurance_due_date)
  values ('60000000-0000-0000-0000-000000000048', 'GH-482-KL', 'Renault', 'Master L3H2', 'van', 89, 84210,
          '2027-03-01', '2027-01-15')
$$, 'La réception ajoute un véhicule à la flotte');
select is((select (cleaning_fee, late_fee_per_hour, fuel_price_per_liter, loanable)::text
           from public.fleet_vehicles where id = '60000000-0000-0000-0000-000000000048'),
          '(45.00,20.00,2.20,t)', 'Frais par défaut : nettoyage 45 €, retard 20 €/h, carburant 2,20 €/L ; prêtable');
select throws_ok($$
  insert into public.fleet_vehicles (plate, brand, model, category, daily_rate)
  values ('gh 482 kl', 'Iveco', 'Daily', 'van', 70)
$$, '23505', null, 'Plaque déjà dans la flotte (même écrite autrement) : refusée');
select throws_ok($$
  insert into public.fleet_vehicles (plate, brand, model, category, daily_rate, vin)
  values ('ZZ-001-ZZ', 'Iveco', 'Daily', 'van', 70, 'VF1MA000O12345678')
$$, '23514', null, 'VIN invalide (lettre O) : refusé');
select throws_ok($$
  insert into public.fleet_vehicles (plate, brand, model, category, daily_rate, license_category)
  values ('ZZ-002-ZZ', 'Iveco', 'Daily', 'van', 70, 'D')
$$, '23514', null, 'Catégorie de permis inconnue : refusée');

-- ---------------------------------------------------------------- Boîte à gants
select lives_ok($$
  insert into public.fleet_documents (fleet_vehicle_id, kind, label, file_id, valid_until)
  values ('60000000-0000-0000-0000-000000000048', 'insurance', 'Attestation d’assurance',
          pg_temp.fake_file('other'), '2027-01-15')
$$, 'La réception range l’attestation d’assurance dans la boîte à gants');
select is((select created_by from public.fleet_documents where fleet_vehicle_id = '60000000-0000-0000-0000-000000000048'),
          '00000000-0000-0000-0000-0000000000e1'::uuid, 'Document signé par son auteur');

-- ---------------------------------------------------------------- Raison de blocage
select is((select public.fleet_vehicle_block_reason(v, '2026-10-03') from public.fleet_vehicles v
           where id = '60000000-0000-0000-0000-000000000048'), null, 'Échéances à jour : louable');
select is((select public.fleet_vehicle_block_reason(v, '2027-02-01') from public.fleet_vehicles v
           where id = '60000000-0000-0000-0000-000000000048'),
          'Assurance expirée le 15/01/2027', 'Assurance expirée : bloqué');
select is((select public.fleet_vehicle_block_reason(v, '2027-04-01') from public.fleet_vehicles v
           where id = '60000000-0000-0000-0000-000000000048'),
          'Assurance expirée le 15/01/2027', 'Assurance et CT expirés : l’assurance est signalée d’abord');
update public.fleet_vehicles set in_maintenance = true where id = '60000000-0000-0000-0000-000000000048';
select is((select public.fleet_vehicle_block_reason(v, '2026-10-03') from public.fleet_vehicles v
           where id = '60000000-0000-0000-0000-000000000048'), 'Véhicule en entretien', 'En entretien : bloqué');

-- ---------------------------------------------------------------- Droits
delete from public.fleet_vehicles where id = '60000000-0000-0000-0000-000000000048';
select is((select count(*)::int from public.fleet_vehicles where id = '60000000-0000-0000-0000-000000000048'), 1,
          'La réception ne peut pas supprimer un véhicule');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select is((select count(*)::int from public.fleet_vehicles), 0, 'Le technicien ne voit pas la flotte');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
delete from public.fleet_vehicles where id = '60000000-0000-0000-0000-000000000048';
select is((select count(*)::int from public.fleet_documents), 0,
          'La direction supprime le véhicule, avec sa boîte à gants');

select * from finish();
rollback;
