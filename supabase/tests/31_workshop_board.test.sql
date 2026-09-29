-- =============================================================================
-- Écran atelier (télé) : contenu du tableau, accès bureau et borne seulement
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

select public.paris_date(now()) as today \gset

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, technician_id, status, planned_date, planned_start) values
  -- Alice : en cours (badgeage ouvert, pièce en attente), assigné aujourd'hui, assigné demain (masqué)
  ('50000000-0000-0000-0000-000000000001', 'OR90001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Freins', '10000000-0000-0000-0000-0000000000a1', 'in_progress', null, null),
  ('50000000-0000-0000-0000-000000000002', 'OR90002', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'remorque', 'Pneus', '10000000-0000-0000-0000-0000000000a1', 'assigned', :'today', '14:00'),
  ('50000000-0000-0000-0000-000000000003', 'OR90003', '30000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 'vul', 'Vidange', '10000000-0000-0000-0000-0000000000a1', 'assigned', :'today'::date + 1, null),
  -- Terminé : plus sur l'écran
  ('50000000-0000-0000-0000-000000000004', 'OR90004', '30000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 'vul', 'Clim', '10000000-0000-0000-0000-0000000000b1', 'work_done', null, null);
insert into public.time_entries (repair_order_id, technician_id, started_at)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000a1', now() - interval '1 hour');
insert into public.ro_lines (repair_order_id, kind, line_type, description, order_status)
values ('50000000-0000-0000-0000-000000000001', 'planned', 'part', 'Disques', 'ordered');
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, status)
values ('10000000-0000-0000-0000-0000000000b1', 'sick', :'today', :'today', 'approved');
insert into public.appointments (vehicle_id, scheduled_date, start_time)
values ('30000000-0000-0000-0000-000000000003', :'today', '10:30');
set local session_replication_role = origin;

-- ---------------------------------------------------------------- La borne voit le tableau
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');  -- borne
select public.workshop_board() as board \gset

select is(jsonb_path_query_array(:'board'::jsonb, '$.technicians[*].name') @> '["Alice", "Bruno"]'::jsonb, true,
          'Une colonne par technicien actif');
select is(jsonb_path_query_array(:'board'::jsonb,
            '$.orders[*] ? (@.technician_id == "10000000-0000-0000-0000-0000000000a1").plate'),
          '["AB-123-CD", "EF-456-GH"]'::jsonb,
          'OR en cours et assignés aujourd''hui ; pas ceux prévus demain');
select is(jsonb_path_query_first(:'board'::jsonb, '$.orders[*] ? (@.plate == "AB-123-CD")') - 'id' - 'technician_id',
          '{"plate": "AB-123-CD", "task": "Freins", "status": "in_progress", "running": true,
            "planned_start": null, "planned_end": null, "parts_pending": true}'::jsonb,
          'Badgeage en cours et attente pièces ; aucun prix');
select is(jsonb_path_query_array(:'board'::jsonb, '$.orders[*] ? (@.status == "work_done")'), '[]'::jsonb,
          'OR terminé : plus sur l''écran');
select is(jsonb_path_query_array(:'board'::jsonb, '$.leaves[*].leave_type'), '["sick"]'::jsonb, 'Absence du jour');
select is(:'board'::jsonb -> 'appointments',
          '[{"start_time": "10:30:00", "plate": "IJ-789-KL", "client_name": "Logistique Martin"}]'::jsonb,
          'Véhicules attendus aujourd''hui');

-- ---------------------------------------------------------------- Accès
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select ok(public.workshop_board() ? 'orders', 'Le bureau voit aussi le tableau');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select throws_ok($$ select public.workshop_board() $$, '42501', null, 'Pas pour un technicien');

select * from finish();
rollback;
