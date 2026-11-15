-- =============================================================================
-- Note du bureau pour le technicien : lue sur sa fiche, l'OR repasse « Modifié » quand elle change
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work, technician_id, assignment_changed_at) values
  ('50000000-0000-0000-0000-000000000143', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Freins avant', '10000000-0000-0000-0000-0000000000a1',
   now() - interval '1 day');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
update public.repair_orders set technician_note = 'Clés au bureau' where id = '50000000-0000-0000-0000-000000000143';
select ok((select assignment_changed_at > now() - interval '1 minute' from public.repair_orders
           where id = '50000000-0000-0000-0000-000000000143'),
          'Note modifiée : l''OR repasse en « Modifié » chez le technicien');
select throws_ok($$ update public.repair_orders set technician_note = repeat('x', 1001)
                    where id = '50000000-0000-0000-0000-000000000143' $$,
                 '23514', null, 'Note de 1 000 caractères au plus');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien assigné
select is((select technician_note from public.v_repair_orders_overview
           where id = '50000000-0000-0000-0000-000000000143'),
          'Clés au bureau', 'Le technicien lit la note sur sa fiche OR');
select is((select requested_work from public.v_repair_orders_overview
           where id = '50000000-0000-0000-0000-000000000143'),
          'Freins avant', 'Les tâches restent à part');
update public.repair_orders set technician_note = 'autre' where id = '50000000-0000-0000-0000-000000000143';
reset role;
select is((select technician_note from public.repair_orders where id = '50000000-0000-0000-0000-000000000143'),
          'Clés au bureau', 'Le technicien ne modifie pas la note du bureau');

select * from finish();
rollback;
