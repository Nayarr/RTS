-- =============================================================================
-- Agent Direction : actions préparées, exécutées seulement après validation de la direction
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000069', '30000000-0000-0000-0000-000000000001', 'Freinage');

-- Préparation : l'action reste proposée
insert into public.agent_actions (id, kind, payload, summary) values
  ('a1000000-0000-0000-0000-000000000001', 'ro_work',
   '{"repair_order_id": "50000000-0000-0000-0000-000000000069", "description": "Changer les balais", "estimated_hours": 0.5}',
   'Ajouter « Changer les balais »'),
  ('a1000000-0000-0000-0000-000000000002', 'assign_technician',
   '{"repair_order_id": "50000000-0000-0000-0000-000000000069", "technician_id": "10000000-0000-0000-0000-0000000000a1"}',
   'Assigner Alice'),
  ('a1000000-0000-0000-0000-000000000003', 'appointment',
   format('{"client_name": "Transports Dupont", "plate": "AB-123-CD", "vehicle_type": "pl", "date": "%s", "start_time": "09:00", "end_time": "10:00", "reason": "Vidange", "technician_id": null}',
          current_date + 3)::jsonb,
   'Rendez-vous');
select is((select count(*) from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000069'
           and description = 'Changer les balais'), 0::bigint, 'Action préparée : rien n''est encore fait');

-- Validation
select is((public.execute_agent_action('a1000000-0000-0000-0000-000000000001')).status, 'done', 'Travail ajouté à l''OR');
select is((select estimated_hours from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000069'
           and description = 'Changer les balais' and kind = 'planned'), 0.5::numeric, 'Ligne de travail à faire créée');
select is((public.execute_agent_action('a1000000-0000-0000-0000-000000000002')).status, 'done', 'Technicien assigné');
select is((select technician_id from public.repair_orders where id = '50000000-0000-0000-0000-000000000069'),
          '10000000-0000-0000-0000-0000000000a1'::uuid, 'Alice sur l''OR');
select is((public.execute_agent_action('a1000000-0000-0000-0000-000000000003')).status, 'done', 'Rendez-vous pris');
select is((select count(*) from public.appointments where reason = 'Vidange' and scheduled_date = current_date + 3),
          1::bigint, 'Rendez-vous au planning');
select throws_ok($$ select public.execute_agent_action('a1000000-0000-0000-0000-000000000001') $$,
                 'P0001', null, 'Une action ne s''exécute qu''une fois');

-- Action refusée par les règles de l'appli : notée en échec
insert into public.agent_actions (id, kind, payload, summary) values
  ('a1000000-0000-0000-0000-000000000004', 'appointment',
   '{"client_name": "", "plate": "", "vehicle_type": "pl", "date": "2099-01-01", "start_time": "09:00", "reason": "X"}',
   'Rendez-vous sans client');
select is((public.execute_agent_action('a1000000-0000-0000-0000-000000000004')).status, 'failed',
          'Rendez-vous sans client ni véhicule : échec noté, rien de créé');

-- Réception : ni préparation ni exécution
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_like($$ insert into public.agent_actions (kind, payload, summary) values ('ro_work', '{}', 'x') $$,
                   '%row-level security%', 'La réception ne prépare pas d''action');
select throws_ok($$ select public.execute_agent_action('a1000000-0000-0000-0000-000000000004') $$,
                 '42501', null, 'Exécution réservée à la direction');

select * from finish();
rollback;
