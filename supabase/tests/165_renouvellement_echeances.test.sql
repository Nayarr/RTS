-- =============================================================================
-- Renouvellement d'échéance : photo de la nouvelle étiquette obligatoire, échéance du véhicule
-- et historique mis à jour
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

\ir helpers/fixtures.psql

-- Détection sur les tâches (même règle que l'appli)
select is(public.renewal_kinds_of(array['- Contrôle hayon', 'CT', 'Contrôle des extincteurs', 'Opacité']),
          array['antipollution', 'ct', 'extinguisher', 'tailgate'],
          'Contrôle hayon, CT, contrôle des extincteurs, opacité : quatre renouvellements');
select is(public.renewal_kinds_of(array['Réparation hayon', 'Préparation au contrôle technique',
                                        'Pré-contrôle technique', 'Remplacement extincteur 1 kg cabine']),
          array[]::text[], 'Réparation, préparation, pré-contrôle, remplacement seul : pas de renouvellement');

update public.vehicles set ct_due_date = '2026-12-10', tailgate_due_date = '2026-11-01'
where id = '30000000-0000-0000-0000-000000000003';
insert into public.repair_orders (id, vehicle_id, vehicle_type, requested_work, technician_id, mileage) values
  ('50000000-0000-0000-0000-000000001651', '30000000-0000-0000-0000-000000000003', 'vul',
   E'- Contrôle hayon\n- Freins avant', '10000000-0000-0000-0000-0000000000a1', 128400),
  ('50000000-0000-0000-0000-000000001652', '30000000-0000-0000-0000-000000000003', 'vul',
   'Freins arrière', '10000000-0000-0000-0000-0000000000b1', 128500);
\set ro '''50000000-0000-0000-0000-000000001651'''

-- Réparation à prévoir (pour plus tard) : pas un renouvellement sur cet OR
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.ro_lines (repair_order_id, kind, line_type, description) values
  (:ro, 'planned', 'labor', 'Contrôle technique'),
  (:ro, 'done', 'labor', 'Contrôle des extincteurs');
select is(public.repair_order_renewal_kinds(:ro), array['extinguisher', 'tailgate'],
          'Demande et travaux effectués comptent, pas les réparations à prévoir');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
update public.ro_lines set estimated_hours = 0.5 where repair_order_id = :ro;
insert into public.ro_photos (repair_order_id, file_id, label)
values (:ro, pg_temp.fake_file('ro_photo'), 'Contrôle technique');
select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000001651') $$,
  '%Photo de la nouvelle étiquette obligatoire : contrôle des extincteurs, contrôle hayon%',
  'Terminer l''OR : nouvelles étiquettes exigées');

-- Enregistrement : photo de l'OR obligatoire, échéance prévue sur l'OR seulement
select pg_temp.fake_file('ro_photo') as tailgate_file \gset
insert into public.ro_photos (repair_order_id, file_id, label)
values (:ro, :'tailgate_file', 'Nouvelle étiquette contrôle hayon');
select throws_like($$ select public.record_deadline_renewal('50000000-0000-0000-0000-000000001651', 'ct',
                     '2027-12-10', null) $$,
  '%Aucun renouvellement de cette échéance prévu%', 'Contrôle technique pas prévu sur l''OR : refusé');
select throws_like(format($$ select public.record_deadline_renewal(%L, 'tailgate', '2027-05-01', %L) $$,
                          :ro, pg_temp.fake_file('ro_photo')),
  '%Photo de la nouvelle étiquette introuvable%', 'Fichier qui n''est pas une photo de l''OR : refusé');
select throws_like(format($$ select public.record_deadline_renewal(%L, 'tailgate', null, %L) $$, :ro, :'tailgate_file'),
  '%Date de la nouvelle échéance obligatoire%', 'Sans date : refusé');

select lives_ok(format($$ select public.record_deadline_renewal(%L, 'tailgate', '2027-05-17', %L) $$,
                       :ro, :'tailgate_file'),
  'Hayon renouvelé depuis la photo de la nouvelle étiquette');
reset role;
select is((select tailgate_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000003'),
          '2027-05-01'::date, 'Échéance du hayon du véhicule mise à jour (au mois)');
select results_eq(
  $$ select kind, previous_due, new_due, created_by from public.vehicle_deadline_renewals
     where repair_order_id = '50000000-0000-0000-0000-000000001651' $$,
  $$ values ('tailgate'::text, '2026-11-01'::date, '2027-05-01'::date, '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'Historique : ancienne et nouvelle échéance, auteur');
select ok(exists (select 1 from public.ro_events
                  where repair_order_id = :ro and label = 'Contrôle hayon renouvelé : prochain 05/2027'),
          'Journal de l''OR');

-- Nouvelle photo sur le même OR : date corrigée, ancienne échéance gardée
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$ select public.record_deadline_renewal(%L, 'tailgate', '2027-06-01', %L) $$,
                       :ro, :'tailgate_file'), 'Date corrigée');
reset role;
select results_eq(
  $$ select count(*)::int, min(previous_due), max(new_due) from public.vehicle_deadline_renewals
     where repair_order_id = '50000000-0000-0000-0000-000000001651' $$,
  $$ values (1, '2026-11-01'::date, '2027-06-01'::date) $$,
  'Une seule ligne par échéance et par OR, ancienne échéance gardée');

-- Lecture : le bureau et la technicienne de l'OR, pas un autre technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.vehicle_deadline_renewals), 0, 'Autre technicien : rien de visible');
select throws_like(format($$ select public.record_deadline_renewal(%L, 'tailgate', '2027-06-01', %L) $$,
                          :ro, :'tailgate_file'),
  '%', 'Autre technicien : enregistrement refusé');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((select count(*)::int from public.vehicle_deadline_renewals), 1, 'Bureau : historique visible');
select throws_like($$ insert into public.vehicle_deadline_renewals (vehicle_id, kind, new_due)
                      values ('30000000-0000-0000-0000-000000000003', 'ct', '2028-01-01') $$,
  '%permission denied%', 'Écriture directe refusée (seulement par l''atelier)');

-- Extincteurs puis fin de l'OR
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000001651') $$,
  '%Photo de la nouvelle étiquette obligatoire : contrôle des extincteurs%', 'Il manque encore les extincteurs');
select pg_temp.fake_file('ro_photo') as extinguisher_file \gset
insert into public.ro_photos (repair_order_id, file_id, label)
values (:ro, :'extinguisher_file', 'Nouvelle étiquette extincteurs');
select lives_ok(format($$ select public.record_deadline_renewal(%L, 'extinguisher', '2027-11-01', %L) $$,
                       :ro, :'extinguisher_file'), 'Extincteurs renouvelés');
select lives_ok($$ select public.complete_repair_order('50000000-0000-0000-0000-000000001651') $$,
  'Toutes les nouvelles étiquettes prises : l''OR se termine');

-- Photo du nouveau contrôle technique : vaut photo du contrôle technique
reset role;
insert into public.repair_orders (id, vehicle_id, vehicle_type, requested_work, technician_id, mileage) values
  ('50000000-0000-0000-0000-000000001653', '30000000-0000-0000-0000-000000000003', 'vul',
   'Contrôle technique', '10000000-0000-0000-0000-0000000000a1', 128600);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.fake_file('ro_photo') as ct_file \gset
insert into public.ro_photos (repair_order_id, file_id, label)
values ('50000000-0000-0000-0000-000000001653', :'ct_file', 'Nouveau contrôle technique');
select lives_ok(format($$ select public.record_deadline_renewal(%L, 'ct', '2027-12-10', %L) $$,
                       '50000000-0000-0000-0000-000000001653', :'ct_file'), 'Contrôle technique renouvelé');
select lives_ok($$ select public.complete_repair_order('50000000-0000-0000-0000-000000001653') $$,
  'Photo du nouveau contrôle technique : pas d''autre photo du contrôle technique exigée');

select * from finish();
rollback;
