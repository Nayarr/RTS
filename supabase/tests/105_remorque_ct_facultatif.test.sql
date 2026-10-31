-- =============================================================================
-- Remorques : photo du contrôle technique facultative pour terminer l'OR
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, vehicle_type) values
  ('50000000-0000-0000-0000-000000000105', '30000000-0000-0000-0000-000000000002', 'Freins',
   '10000000-0000-0000-0000-0000000000a1', 'remorque'),
  ('50000000-0000-0000-0000-000000000106', '30000000-0000-0000-0000-000000000001', 'Freins',
   '10000000-0000-0000-0000-0000000000a1', 'pl');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.ro_lines set estimated_hours = 1
 where repair_order_id in ('50000000-0000-0000-0000-000000000105', '50000000-0000-0000-0000-000000000106');

select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000106') $$,
  '%Photo du contrôle technique obligatoire%', 'Poids lourd : photo du contrôle technique toujours exigée');
select lives_ok($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000105') $$,
  'Remorque : OR terminé sans photo du contrôle technique');
select is((select status from public.repair_orders where id = '50000000-0000-0000-0000-000000000105'),
          'work_done'::public.repair_order_status, 'Remorque : travaux terminés');

select * from finish();
rollback;
