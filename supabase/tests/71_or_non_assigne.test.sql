-- =============================================================================
-- OR non assignés : catégorie à part dans le tableau de bord du bureau
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins', '10000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Vidange', null),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'Pneus', null);

select is((public.office_dashboard() -> 'repair_orders'), '{"assigned": 1, "unassigned": 2}'::jsonb,
          'OR sans technicien comptés dans « unassigned », pas dans « assigned »');

update public.repair_orders set technician_id = '10000000-0000-0000-0000-0000000000a1'
where id = '50000000-0000-0000-0000-000000000002';
select is((public.office_dashboard() -> 'repair_orders'), '{"assigned": 2, "unassigned": 1}'::jsonb,
          'OR assigné ensuite : passe dans « assigned »');

select * from finish();
rollback;
