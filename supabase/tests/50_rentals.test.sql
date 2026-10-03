-- =============================================================================
-- Location — contrats et prêts : numérotation, pas de chevauchement, remise des clés
-- contrôlée (permis, signature, photos, relevés), prêt sans obligation, retour, facture
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

\ir helpers/fixtures.psql

update public.company_settings set supplies_fee_ht = 15;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.fleet_vehicles (id, plate, brand, model, category, daily_rate, mileage, license_category)
values ('60000000-0000-0000-0000-000000000050', 'GE-781-UV', 'Renault', 'Master', 'van', 95, 48210, 'B');
insert into public.clients (id, kind, first_name, last_name, name)
values ('20000000-0000-0000-0000-000000000050', 'individual', 'Julie', 'Martin', '');
insert into public.driving_licenses (id, client_id, last_name, first_name, license_number, categories, valid_until)
values ('90000000-0000-0000-0000-000000000050', '20000000-0000-0000-0000-000000000050', 'MARTIN', 'Julie',
        '910395200123', '{B}', '2033-06-22');

-- ---------------------------------------------------------------- Création et numérotation
insert into public.rentals (id, client_id, fleet_vehicle_id, driving_license_id, departure_at, planned_return_at,
                            unit_price, periods, km_included, extra_km_price, deposit)
values ('a0000000-0000-0000-0000-000000000050', '20000000-0000-0000-0000-000000000050',
        '60000000-0000-0000-0000-000000000050', '90000000-0000-0000-0000-000000000050',
        '2026-10-05 09:30+02', '2026-10-07 18:00+02', 95, 2, 500, 0.35, 1500);
select is((select number from public.rentals where id = 'a0000000-0000-0000-0000-000000000050'), 'LC-2026-0001',
          'Location numérotée LC-AAAA-NNNN');
select throws_ok($$
  insert into public.rentals (client_id, fleet_vehicle_id, departure_at, planned_return_at)
  values ('20000000-0000-0000-0000-000000000050', '60000000-0000-0000-0000-000000000050',
          '2026-10-06 08:00+02', '2026-10-06 12:00+02')
$$, '23P01', null, 'Véhicule déjà réservé sur la période : refusé');
select throws_ok($$
  insert into public.rentals (client_id, fleet_vehicle_id, departure_at, planned_return_at)
  values ('20000000-0000-0000-0000-000000000050', '60000000-0000-0000-0000-000000000050',
          '2026-10-09 08:00+02', '2026-10-08 12:00+02')
$$, '23514', null, 'Retour prévu avant le départ : refusé');
select throws_ok($$
  update public.rentals set status = 'active' where id = 'a0000000-0000-0000-0000-000000000050'
$$, '42501', null, 'Statut jamais modifié directement');

-- ---------------------------------------------------------------- Remise des clés contrôlée
select is(public.rental_missing('a0000000-0000-0000-0000-000000000050', 'departure'),
  array['Permis à scanner (recto et verso)', 'Signature du client', 'Photo avant', 'Photo arrière',
        'Photo côté gauche', 'Photo côté droit', 'Photo du tableau de bord', 'Kilométrage', 'Niveau de carburant'],
  'Départ : tout ce qui manque est listé');
select throws_like($$ select public.start_rental('a0000000-0000-0000-0000-000000000050') $$,
  'Impossible de remettre les clés : Permis à scanner%', 'Clés refusées tant que tout n’est pas fait');

update public.driving_licenses set recto_file_id = pg_temp.fake_file('other'), verso_file_id = pg_temp.fake_file('other')
 where id = '90000000-0000-0000-0000-000000000050';
update public.rentals set signature_file_id = pg_temp.fake_file('signature'), signed_at = now(), terms_accepted = true
 where id = 'a0000000-0000-0000-0000-000000000050';
insert into public.rental_photos (rental_id, phase, slot, file_id)
select 'a0000000-0000-0000-0000-000000000050', 'departure', s::public.rental_photo_slot, pg_temp.fake_file('ro_photo')
from unnest(array['front', 'back', 'left', 'right', 'dashboard']) s;
select throws_ok($$
  insert into public.rental_photos (rental_id, phase, slot, file_id)
  values ('a0000000-0000-0000-0000-000000000050', 'departure', 'front', pg_temp.fake_file('ro_photo'))
$$, '23505', null, 'Une seule photo par côté (gros plans en plus)');
insert into public.rental_damages (rental_id, phase, x, y, label)
values ('a0000000-0000-0000-0000-000000000050', 'departure', 0.68, 0.28, 'Rayure pare-chocs avant droit');
insert into public.rental_inspections (rental_id, phase, mileage, fuel_eighths, equipment)
values ('a0000000-0000-0000-0000-000000000050', 'departure', 48210, 8, '{Gilet et triangle,2 clés}');
select is(cardinality(public.rental_missing('a0000000-0000-0000-0000-000000000050', 'departure')), 0,
          'Départ complet');

-- Véhicule bloqué (assurance expirée) : clés refusées
update public.fleet_vehicles set insurance_due_date = '2026-10-01' where id = '60000000-0000-0000-0000-000000000050';
select throws_like($$ select public.start_rental('a0000000-0000-0000-0000-000000000050') $$,
  '%Assurance expirée le 01/10/2026%', 'Assurance du véhicule expirée : clés refusées');
update public.fleet_vehicles set insurance_due_date = null where id = '60000000-0000-0000-0000-000000000050';

select lives_ok($$ select public.start_rental('a0000000-0000-0000-0000-000000000050') $$, 'Clés remises');
select is((select status::text from public.rentals where id = 'a0000000-0000-0000-0000-000000000050'), 'active',
          'Location en cours');
select throws_ok($$
  update public.rentals set unit_price = 10 where id = 'a0000000-0000-0000-0000-000000000050'
$$, '42501', null, 'Conditions figées après le départ');
select lives_ok($$
  update public.rentals set planned_return_at = '2026-10-08 18:00+02', notes = 'Prolongée'
   where id = 'a0000000-0000-0000-0000-000000000050'
$$, 'Retour prévu prolongeable');
select throws_ok($$
  insert into public.rental_photos (rental_id, phase, slot, file_id)
  values ('a0000000-0000-0000-0000-000000000050', 'departure', 'closeup', pg_temp.fake_file('ro_photo'))
$$, '42501', null, 'État des lieux de départ figé après la remise des clés');

-- ---------------------------------------------------------------- Retour
select throws_like($$ select public.return_rental('a0000000-0000-0000-0000-000000000050', now()) $$,
  'Retour incomplet : Photo avant%', 'Retour : photos obligatoires');
insert into public.rental_photos (rental_id, phase, slot, file_id)
select 'a0000000-0000-0000-0000-000000000050', 'return', s::public.rental_photo_slot, pg_temp.fake_file('ro_photo')
from unnest(array['front', 'back', 'left', 'right', 'dashboard']) s;
insert into public.rental_inspections (rental_id, phase, mileage, fuel_eighths)
values ('a0000000-0000-0000-0000-000000000050', 'return', 48000, 5);
select throws_like($$ select public.return_rental('a0000000-0000-0000-0000-000000000050', now()) $$,
  'Kilométrage de retour inférieur%', 'Kilométrage de retour cohérent');
update public.rental_inspections set mileage = 48912
 where rental_id = 'a0000000-0000-0000-0000-000000000050' and phase = 'return';
select lives_ok($$ select public.return_rental('a0000000-0000-0000-0000-000000000050', now()) $$, 'Retour enregistré');
select is((select mileage from public.fleet_vehicles where id = '60000000-0000-0000-0000-000000000050'), 48912,
          'Compteur du véhicule mis à jour');

-- ---------------------------------------------------------------- Clôture et facture
select public.close_rental('a0000000-0000-0000-0000-000000000050', $$[
  {"description": "Location Renault Master · GE-781-UV", "quantity": 2, "unit_price": 95},
  {"description": "Kilomètres supplémentaires", "quantity": 202, "unit_price": 0.35}
]$$::jsonb) as invoice \gset
select results_eq(
  format($$ select line_type::text, description, net_ht from public.invoice_lines where invoice_id = %L order by position $$, :'invoice'),
  $$ values ('rental', 'Location Renault Master · GE-781-UV', 190.00::numeric),
            ('rental', 'Kilomètres supplémentaires', 70.70::numeric) $$,
  'Facture brouillon : lignes de location, sans « Fournitures et recyclage »');
select is((select (status, invoice_id)::text from public.rentals where id = 'a0000000-0000-0000-0000-000000000050'),
          format('(closed,%s)', :'invoice'), 'Contrat clôturé, facture rattachée');
select is((select rental_id from public.invoices where id = :'invoice'),
          'a0000000-0000-0000-0000-000000000050'::uuid, 'Facture rattachée au contrat');

-- ---------------------------------------------------------------- Prêt : rien d'obligatoire
insert into public.rentals (id, kind, client_id, fleet_vehicle_id, departure_at, planned_return_at, billable)
values ('a0000000-0000-0000-0000-000000000051', 'loan', '20000000-0000-0000-0000-000000000001',
        '60000000-0000-0000-0000-000000000050', '2026-10-12 08:00+02', '2026-10-14 18:00+02', false);
select is((select number from public.rentals where id = 'a0000000-0000-0000-0000-000000000051'), 'PR-2026-0001',
          'Prêt numéroté PR-AAAA-NNNN');
select lives_ok($$ select public.start_rental('a0000000-0000-0000-0000-000000000051') $$,
  'Prêt : clés remises sans permis, signature ni photos');
select lives_ok($$ select public.return_rental('a0000000-0000-0000-0000-000000000051', now()) $$,
  'Prêt : retour sans photos');
select is(public.close_rental('a0000000-0000-0000-0000-000000000051', '[]'), null,
          'Prêt gratuit : clôturé sans facture');

-- ---------------------------------------------------------------- Annulation et droits
insert into public.rentals (id, client_id, fleet_vehicle_id, departure_at, planned_return_at)
values ('a0000000-0000-0000-0000-000000000052', '20000000-0000-0000-0000-000000000050',
        '60000000-0000-0000-0000-000000000050', '2026-11-02 08:00+01', '2026-11-03 18:00+01');
select lives_ok($$ select public.cancel_rental('a0000000-0000-0000-0000-000000000052') $$,
  'Réservation annulée (le véhicule redevient libre)');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select is((select count(*)::int from public.v_rentals_overview), 0, 'Le technicien ne voit pas les contrats');

select * from finish();
rollback;
