-- =============================================================================
-- Forfaits : gestion par la direction, détection sur les OR
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ insert into public.service_packages (name, standard_hours) values ('Pirate', 1) $$,
                 '42501', null, 'La réception ne crée pas de forfait');
select is((select count(*) from public.service_packages where name = 'Pirate'), 0::bigint, 'Aucun forfait créé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select throws_ok($$ insert into public.service_packages (name, standard_hours, trigger_fields)
                    values ('Mauvaise case', 1, array['retroviseur']) $$,
                 '23514', null, 'Seules les cases d''usure de la fiche de contrôle déclenchent un forfait');

insert into public.service_packages (id, name, category, standard_hours, price, details, keywords)
values ('70000000-0000-0000-0000-000000000001', 'Forfait disques et plaquettes arrière PL', 'pl', 3, 340,
        E'Dépose des roues arrière\nRemplacement disques et plaquettes', array['disque arrière', 'plaquette arrière']);

-- ---------------------------------------------------------------- Détection sur un OR
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000001', 'planned', 'labor', 'Remplacement des disques arrière', 3),
  ('50000000-0000-0000-0000-000000000001', 'planned', 'labor', 'Contrôle éclairage', 1);

select is(public.apply_package_keywords('50000000-0000-0000-0000-000000000001'),
          array['Forfait disques et plaquettes arrière PL'], 'Tous les mots d''un mot-clé présents : forfait appliqué');
select results_eq(
  $$ select line_type::text, unit_price, standard_hours, description from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000001' order by position, description $$,
  $$ values ('labor', null::numeric, null::numeric, 'Contrôle éclairage'),
            ('package', 340.00::numeric, 3.00::numeric,
             E'Forfait disques et plaquettes arrière PL\nDépose des roues arrière\nRemplacement disques et plaquettes') $$,
  'La ligne devient le forfait (prix, barème, détail) ; les autres lignes ne bougent pas');

-- Forfait retiré par la direction (archivé) : plus détecté
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
update public.service_packages set is_active = false where id = '70000000-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.ro_lines (repair_order_id, kind, line_type, description)
values ('50000000-0000-0000-0000-000000000001', 'planned', 'labor', 'Plaquettes arrière usées');
select is(public.apply_package_keywords('50000000-0000-0000-0000-000000000001'), '{}'::text[],
          'Forfait archivé : plus détecté');

-- Case de la fiche de contrôle liée à un forfait archivé : la ligne « Remplacement … » revient
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.service_packages (name, standard_hours, price, trigger_fields, is_active)
values ('Ancien forfait plaquettes', 2, 200, array['plaquettes_avant'], false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Contrôle');
insert into public.inspections (repair_order_id, data)
values ('50000000-0000-0000-0000-000000000002', '{"usure": {"plaquettes_avant": "HS"}}');
select results_eq(
  $$ select line_type::text, description from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000002' $$,
  $$ values ('labor', 'Remplacement Plaquettes avant') $$,
  'Forfait archivé : la case HS propose à nouveau « Remplacement … »');

select * from finish();
rollback;
