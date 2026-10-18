-- =============================================================================
-- Clôture par le technicien : temps estimés, taille des pneus, photo du hayon HS
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, mileage) values
  ('50000000-0000-0000-0000-000000000041', '30000000-0000-0000-0000-000000000001', 'Entretien',
   '10000000-0000-0000-0000-0000000000a1', 184320);
-- Forfait à prévoir ajouté par le bureau : son temps barème suffit
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.ro_lines (repair_order_id, kind, line_type, description, standard_hours) values
  ('50000000-0000-0000-0000-000000000041', 'planned', 'package', 'Forfait vidange PL', 1.5);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
\set ro '''50000000-0000-0000-0000-000000000041'''

insert into public.ro_lines (repair_order_id, kind, line_type, description) values
  (:ro, 'done', 'labor', 'Vidange moteur'),
  (:ro, 'planned', 'labor', 'Remplacement plaquettes avant');
insert into public.ro_photos (repair_order_id, file_id, label)
values (:ro, pg_temp.fake_file('ro_photo'), 'Contrôle technique');
insert into public.inspections (repair_order_id, data)
values (:ro, '{"pneus": {"avant_etat": "HS", "arriere_etat": "50", "arriere_taille": " "}, "controles": {"hayon": "HS"}}');

select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000041') $$,
  'À compléter avant de terminer : Temps estimé manquant : 1 tâche des travaux effectués ; Temps estimé manquant : % tâches à prévoir ; %',
  'Tous les manques listés d''un coup : temps des travaux effectués et à prévoir');
select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000041') $$,
  '%Taille des pneus avant obligatoire (HS) ; Taille des pneus arrière obligatoire (50 \%)%',
  'Pneus à 50 % ou HS : taille obligatoire');

update public.ro_lines set estimated_hours = 1
where repair_order_id = :ro and estimated_hours is null and line_type = 'labor';
select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000041') $$,
  '%Temps estimé manquant : 7 tâches à prévoir%',
  'Forfaits à prévoir (contrôle hayon, pneus avant et arrière) : le technicien donne son temps estimé (barème caché)');
update public.ro_lines set estimated_hours = 1.5
where repair_order_id = :ro and kind = 'planned' and line_type = 'package';

update public.inspections set data = jsonb_set(jsonb_set(data, '{pneus,avant_taille}', '"315/70/22.5"'),
                                               '{pneus,arriere_taille}', '"315/80/22.5"')
where repair_order_id = :ro;
select throws_ok($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000041') $$,
  'P0001', 'À compléter avant de terminer : Photo de l’étiquette contrôle hayon obligatoire (HS)',
  'Étiquette du contrôle hayon HS : photo obligatoire');

insert into public.ro_photos (repair_order_id, file_id, label)
values (:ro, pg_temp.fake_file('ro_photo'), 'Étiquette contrôle hayon');
select lives_ok($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000041') $$,
  'Tout est complet : l''OR se termine');
select is((select status from public.repair_orders where id = :ro), 'work_done'::public.repair_order_status,
          'L''OR passe « Terminé atelier »');

-- Une autre photo (étiquette d'extincteur) ne remplace pas celle du hayon
reset role;
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, mileage) values
  ('50000000-0000-0000-0000-000000000042', '30000000-0000-0000-0000-000000000001', 'Contrôle',
   '10000000-0000-0000-0000-0000000000a1', 184400);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.inspections (repair_order_id, data)
values ('50000000-0000-0000-0000-000000000042', '{"controles": {"hayon": "HS"}}');
update public.ro_lines set estimated_hours = 0.5 where repair_order_id = '50000000-0000-0000-0000-000000000042';
insert into public.ro_photos (repair_order_id, file_id, label)
values ('50000000-0000-0000-0000-000000000042', pg_temp.fake_file('ro_photo'), 'Extincteur 1 kg cabine'),
       ('50000000-0000-0000-0000-000000000042', pg_temp.fake_file('ro_photo'), 'Contrôle technique');
select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000042') $$,
  '%Photo de l’étiquette contrôle hayon obligatoire%', 'Seule la photo de l''étiquette du hayon compte');

select * from finish();
rollback;
