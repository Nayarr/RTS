-- =============================================================================
-- Forfaits du kit accessoires et des barres : une barre 2 h, les deux barres 3 h en un seul forfait
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

select results_eq(
  $$ select name, standard_hours, price from public.service_packages
     where category = 'pl' and trigger_fields && array['kit_accessoires', 'barre_accouplement', 'barre_direction']
     order by name $$,
  $$ values ('Remplacement barre d''accouplement'::text, 2.00::numeric, 180.00::numeric),
            ('Remplacement barre de direction', 2.00, 180.00),
            ('Remplacement barres d''accouplement et de direction', 3.00, 270.00),
            ('Remplacement kit accessoires', 3.00, 270.00) $$,
  'Forfaits PL au taux horaire : kit 3 h, une barre 2 h, les deux barres 3 h');

insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, vehicle_type) values
  ('50000000-0000-0000-0000-000000000142', '30000000-0000-0000-0000-000000000001', 'Contrôle',
   '10000000-0000-0000-0000-0000000000a1', 'pl');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
\set ro '''50000000-0000-0000-0000-000000000142'''
insert into public.inspections (repair_order_id, data) values (:ro, '{"usure": {"barre_accouplement": "HS"}}');
select results_eq(
  format($$ select description, standard_hours from public.ro_lines where repair_order_id = %L and line_type = 'package' $$, :ro),
  $$ values ('Remplacement barre d''accouplement'::text, 2.00::numeric) $$,
  'Barre d''accouplement seule : forfait de 2 h');

update public.inspections set data = '{"usure": {"barre_accouplement": "HS", "barre_direction": "50"}}' where repair_order_id = :ro;
select results_eq(
  format($$ select description, standard_hours from public.ro_lines where repair_order_id = %L and line_type = 'package' $$, :ro),
  $$ values ('Remplacement barres d''accouplement et de direction'::text, 3.00::numeric) $$,
  'Les deux barres : un seul forfait de 3 h, pas deux forfaits de 2 h');
select is((select count(*)::int from public.ro_lines where repair_order_id = :ro and description like 'Remplacement Barre%'), 0,
          'Pas de ligne « Remplacement Barre » sans temps en plus');

update public.inspections set data = '{"usure": {"barre_direction": "HS", "kit_accessoires": "HS"}}' where repair_order_id = :ro;
select results_eq(
  format($$ select description, standard_hours from public.ro_lines where repair_order_id = %L and line_type = 'package'
            order by description $$, :ro),
  $$ values ('Remplacement barre de direction'::text, 2.00::numeric), ('Remplacement kit accessoires', 3.00) $$,
  'Barre de direction seule (2 h) et kit accessoires (3 h)');

-- VUL : kit au taux VUL, pas de barre sur la fiche
reset role;
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, vehicle_type) values
  ('50000000-0000-0000-0000-000000000143', '30000000-0000-0000-0000-000000000003', 'Contrôle',
   '10000000-0000-0000-0000-0000000000a1', 'vul');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.inspections (repair_order_id, data)
values ('50000000-0000-0000-0000-000000000143', '{"usure": {"kit_accessoires": "HS"}}');
select results_eq(
  $$ select description, standard_hours, unit_price from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000143' and line_type = 'package' $$,
  $$ values ('Remplacement kit accessoires'::text, 3.00::numeric, 225.00::numeric) $$,
  'VUL : forfait kit accessoires de 3 h au taux VUL');

-- Forfait déjà créé par la direction pour les mêmes cases : pas de doublon au rejeu
reset role;
select is((select count(*)::int from public.service_packages where trigger_fields = array['kit_accessoires'] and category = 'pl'), 1,
          'Un seul forfait kit accessoires PL');

select * from finish();
rollback;
