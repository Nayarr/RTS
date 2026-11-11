-- =============================================================================
-- Agent Direction : « la pièce X de l'OR Y est arrivée » ; la pièce passe « Reçue » seulement
-- après validation par la direction
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work, status) values
  ('50000000-0000-0000-0000-000000001321', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Freinage', 'in_progress'),
  ('50000000-0000-0000-0000-000000001322', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'Éclairage', 'in_progress');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
insert into public.ro_lines (id, repair_order_id, kind, position, line_type, description, quantity, order_status) values
  ('61000000-0000-0000-0000-000000001321', '50000000-0000-0000-0000-000000001321', 'planned', 0, 'part',
   'Disque de frein avant', 2, 'ordered'),
  ('61000000-0000-0000-0000-000000001322', '50000000-0000-0000-0000-000000001321', 'planned', 1, 'part',
   'Plaquettes de frein avant', 1, 'ordered'),
  ('61000000-0000-0000-0000-000000001323', '50000000-0000-0000-0000-000000001322', 'planned', 0, 'part',
   'Feu arrière gauche', 1, 'ordered');

-- Second OR facturé depuis (triggers coupés le temps de poser le statut)
reset role;
set local session_replication_role = replica;
update public.repair_orders set status = 'invoiced' where id = '50000000-0000-0000-0000-000000001322';
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');

insert into public.agent_actions (id, kind, payload, summary) values
  ('a1320000-0000-0000-0000-000000000001', 'part_received',
   '{"repair_order_id": "50000000-0000-0000-0000-000000001321", "line_id": "61000000-0000-0000-0000-000000001321", "description": "Disque de frein avant"}',
   'Pièce « Disque de frein avant » de l''OR : passer en « Reçue »'),
  ('a1320000-0000-0000-0000-000000000002', 'part_received',
   '{"repair_order_id": "50000000-0000-0000-0000-000000001321", "line_id": "61000000-0000-0000-0000-000000001323", "description": "Feu arrière gauche"}',
   'Pièce d''un autre OR'),
  ('a1320000-0000-0000-0000-000000000003', 'part_received',
   '{"repair_order_id": "50000000-0000-0000-0000-000000001322", "line_id": "61000000-0000-0000-0000-000000001323", "description": "Feu arrière gauche"}',
   'Pièce d''un OR facturé');

select is((select order_status::text from public.ro_lines where id = '61000000-0000-0000-0000-000000001321'), 'ordered',
          'Action préparée : la pièce n''est pas encore reçue');

select is((public.execute_agent_action('a1320000-0000-0000-0000-000000000001')).status, 'done', 'Pièce reçue validée');
select is((select order_status::text from public.ro_lines where id = '61000000-0000-0000-0000-000000001321'), 'received',
          'Pièce passée « Reçue »');
select is((select order_status::text from public.ro_lines where id = '61000000-0000-0000-0000-000000001322'), 'ordered',
          'Les autres pièces de l''OR ne bougent pas');
select ok(exists (select 1 from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000001321'
                  and label = 'Pièce reçue (Agent Direction) : Disque de frein avant'),
          'Historique de l''OR : pièce reçue par l''Agent Direction');

select is((public.execute_agent_action('a1320000-0000-0000-0000-000000000002')).status, 'failed',
          'Pièce d''un autre OR : refusée');
select is((public.execute_agent_action('a1320000-0000-0000-0000-000000000003')).status, 'failed',
          'OR déjà facturé : pièce non changée');
select is((select order_status::text from public.ro_lines where id = '61000000-0000-0000-0000-000000001323'), 'ordered',
          'Pièce refusée : toujours commandée');

-- Réception : ne peut pas valider une action de la direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.execute_agent_action('a1320000-0000-0000-0000-000000000001') $$, '42501',
                 'Réservé à la direction', 'Réception : validation refusée');

select * from finish();
rollback;
