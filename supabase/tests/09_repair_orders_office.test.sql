-- =============================================================================
-- OR côté bureau : création (client / véhicule à la volée), validations, droits,
-- garde-fous des fichiers rattachés (signature, photos)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

\ir helpers/fixtures.psql

select pg_temp.fake_file('signature') as signature \gset
select pg_temp.fake_file('ro_photo') as photo \gset
select pg_temp.fake_file('logo') as logo \gset

-- ---------------------------------------------------------------- Création
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

create temp table created on commit drop as
  select * from public.create_repair_order(
    ' zz-999-zz ', 'vul', ' Nouveau Client SARL ', ' Vidange + filtres ', 120000,
    '10000000-0000-0000-0000-0000000000a1', '2026-10-01', '09:00', '11:00', :'signature');
grant select on created to authenticated;

select ok((select number ~ '^OR\d{5}$' from created), 'Numéro d''OR attribué par la base');
select results_eq(
  $$ select v.plate, v.vehicle_type::text, c.name, r.requested_work, r.status::text, r.planned_date, r.created_by
     from created r join public.vehicles v on v.id = r.vehicle_id join public.clients c on c.id = r.client_id $$,
  $$ values ('ZZ-999-ZZ', 'vul', 'Nouveau Client SARL', 'Vidange + filtres', 'assigned', '2026-10-01'::date,
             '00000000-0000-0000-0000-0000000000e1'::uuid) $$,
  'Véhicule et client créés à la volée, OR assigné');
select is((select v.client_id from public.vehicles v where v.plate_key = 'ZZ999ZZ'),
          (select client_id from created), 'Le nouveau véhicule est rattaché au client');

-- Client et véhicule existants : retrouvés (plaque et nom saisis différemment), pas de doublon
select lives_ok($$ select public.create_repair_order('ab 123 cd', 'pl', 'transports-dupont', 'Freins') $$,
                'OR sur un véhicule et un client existants');
select results_eq(
  $$ select (select count(*) from public.vehicles where plate_key = 'AB123CD'),
            (select count(*) from public.clients where name_key = 'TRANSPORTSDUPONT') $$,
  $$ values (1::bigint, 1::bigint) $$,
  'Aucun doublon de véhicule ni de client');

-- Sans client saisi : celui du véhicule
select is((select client_id from public.create_repair_order('EF-456-GH', 'remorque', '', 'Éclairage')),
          '20000000-0000-0000-0000-000000000001'::uuid, 'Sans client saisi, l''OR prend le client du véhicule');

-- Date prévue ignorée sans heure de début (comme l'ancienne appli)
select is((select planned_date from public.create_repair_order('IJ-789-KL', 'vul', null, 'Contrôle', null, null, '2026-10-02')),
          null, 'Date prévue sans heure de début : non planifié');

-- ---------------------------------------------------------------- Validations
select throws_like($$ select public.create_repair_order(' - ', 'pl', null, 'Freins') $$,
                   '%immatriculation%', 'Immatriculation obligatoire');
select throws_like($$ select public.create_repair_order('AB-123-CD', 'pl', null, '  ') $$,
                   '%tâche à faire%', 'Tâche obligatoire');
select throws_like($$ select public.create_repair_order('AB-123-CD', 'pl', null, 'Freins', null, null, null, '10:00', '09:00') $$,
                   '%heure de fin%', 'Heure de fin après l''heure de début');
select throws_like(format($$ select public.create_repair_order('AB-123-CD', 'pl', null, 'Freins', null, null, null, null, null, %L) $$, :'logo'),
                   '%Fichier invalide%', 'La signature doit être un fichier « signature » confirmé');

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_like($$ select public.create_repair_order('AB-123-CD', 'pl', null, 'Freins') $$,
                   '%réservé au bureau%', 'Un technicien ne crée pas d''OR');
select pg_temp.act_as_anon();
select throws_like($$ select public.create_repair_order('AB-123-CD', 'pl', null, 'Freins') $$,
                   '%permission denied%', 'Aucune création anonyme');

-- ---------------------------------------------------------------- Photos d'OR
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_like(
  format($$ insert into public.ro_photos (repair_order_id, file_id, label) values ((select id from created), %L, 'Face avant') $$, :'logo'),
  '%Fichier invalide%', 'Une photo d''OR doit être un fichier « ro_photo »');
select lives_ok(
  format($$ insert into public.ro_photos (repair_order_id, file_id, label) values ((select id from created), %L, 'Face avant') $$, :'photo'),
  'Photo d''OR confirmée acceptée');
select is((select created_by from public.ro_photos where file_id = :'photo'),
          '00000000-0000-0000-0000-0000000000e1'::uuid, 'L''auteur de la photo est enregistré');

-- Historique : création journalisée
select ok(exists (select 1 from public.ro_events where repair_order_id = (select id from created) and label like 'OR créé : OR%'),
          'Création inscrite à l''historique');

select * from finish();
rollback;
