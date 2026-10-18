-- =============================================================================
-- Forfaits et fiche de contrôle : disques à refaire → forfait disques et plaquettes seul, forfaits
-- déclenchés par toute la fiche (sauf niveaux), essieux ajoutés, photo du contrôle technique exigée
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

insert into public.service_packages (id, name, category, standard_hours, price, trigger_fields) values
  ('80000000-0000-0000-0000-000000000011', 'Forfait plaquettes AV', 'pl', 1, 99, array['plaquettes_avant']),
  ('80000000-0000-0000-0000-000000000012', 'Forfait disques et plaquettes AV', 'pl', 2, 250, array['disques_avant']),
  ('80000000-0000-0000-0000-000000000013', 'Forfait mise aux normes éclairage', 'pl', 1, 80, array['controles.eclairage']),
  ('80000000-0000-0000-0000-000000000014', 'Diagnostic ABS', 'pl', 1, 90, array['voyants.abs']);
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, vehicle_type) values
  ('50000000-0000-0000-0000-000000000063', '30000000-0000-0000-0000-000000000001', 'Contrôle',
   '10000000-0000-0000-0000-0000000000a1', 'pl');

select throws_ok($$ insert into public.service_packages (name, standard_hours, trigger_fields)
                    values ('Niveaux', 1, array['niveaux.huile']) $$,
                 '23514', null, 'Les niveaux ne déclenchent pas de forfait');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
\set ro '''50000000-0000-0000-0000-000000000063'''
insert into public.inspections (repair_order_id, data)
values (:ro, '{"usure": {"plaquettes_avant": "HS"}}');
select is((select string_agg(l.description, ' | ') from public.ro_lines l where l.repair_order_id = :ro and l.line_type = 'package'),
          'Forfait plaquettes AV', 'Plaquettes seules : forfait plaquettes');

update public.inspections set data = '{"usure": {"plaquettes_avant": "HS", "disques_avant": "HS"}}' where repair_order_id = :ro;
select is((select string_agg(l.description, ' | ') from public.ro_lines l where l.repair_order_id = :ro and l.line_type = 'package'),
          'Forfait disques et plaquettes AV', 'Disques à refaire : forfait disques et plaquettes, sans forfait plaquettes');
select is((select count(*)::int from public.ro_lines where repair_order_id = :ro and description like 'Remplacement Plaquettes%'), 0,
          'Pas de ligne « Remplacement Plaquettes » en plus');

update public.inspections set data = '{"controles": {"eclairage": "HS"}, "voyants": {"abs": true}}' where repair_order_id = :ro;
select is((select string_agg(l.description, ' | ' order by l.description) from public.ro_lines l
           where l.repair_order_id = :ro and l.line_type = 'package'),
          'Diagnostic ABS | Forfait mise aux normes éclairage', 'Contrôles et voyants déclenchent aussi un forfait');
select is((select count(*)::int from public.ro_lines where repair_order_id = :ro and description = 'Mise aux normes éclairage'), 0,
          'Case couverte par un forfait : pas de ligne « Mise aux normes » en plus');

update public.inspections set data = '{"pneus": {"essieux": [{"etat": "HS"}]}}' where repair_order_id = :ro;
select is((select count(*)::int from public.ro_lines where repair_order_id = :ro and description like '% (essieu 3)'), 3,
          'Essieu ajouté à HS : forfaits des pneus de l''essieu à prévoir');

-- ---------------------------------------------------------------- Clôture
update public.ro_lines set estimated_hours = 1 where repair_order_id = :ro and kind = 'planned';
select throws_like(format($$ select public.complete_repair_order(%L) $$, :ro),
  '%Taille des pneus essieu 3 obligatoire (HS) ; Photo du contrôle technique obligatoire%',
  'Taille de l''essieu ajouté et photo du contrôle technique exigées');
update public.inspections set data = '{"pneus": {"essieux": [{"etat": "HS", "taille": "315/70/22.5"}]}}' where repair_order_id = :ro;
insert into public.ro_photos (repair_order_id, file_id, label)
values (:ro, pg_temp.fake_file('ro_photo'), 'Contrôle technique');
select lives_ok(format($$ select public.complete_repair_order(%L) $$, :ro), 'Tout est complet : l''OR se termine');

select * from finish();
rollback;
