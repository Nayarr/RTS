-- =============================================================================
-- Agent Direction : pièce passée dans n'importe quel statut (« À commander », « Commandée »,
-- « Reçue »), seulement après validation par la direction
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work, status) values
  ('50000000-0000-0000-0000-000000001381', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Freinage', 'in_progress');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
insert into public.ro_lines (id, repair_order_id, kind, position, line_type, description, quantity, order_status) values
  ('61000000-0000-0000-0000-000000001381', '50000000-0000-0000-0000-000000001381', 'planned', 0, 'part',
   'Disque de frein avant', 2, 'to_order'),
  ('61000000-0000-0000-0000-000000001382', '50000000-0000-0000-0000-000000001381', 'planned', 1, 'part',
   'Plaquettes de frein avant', 1, 'received');

insert into public.agent_actions (id, kind, payload, summary) values
  ('a1380000-0000-0000-0000-000000000001', 'part_received',
   '{"repair_order_id": "50000000-0000-0000-0000-000000001381", "line_id": "61000000-0000-0000-0000-000000001381", "description": "Disque de frein avant", "status": "ordered"}',
   'Pièce « Disque de frein avant » de l''OR : passer en « Commandée »'),
  ('a1380000-0000-0000-0000-000000000002', 'part_received',
   '{"repair_order_id": "50000000-0000-0000-0000-000000001381", "line_id": "61000000-0000-0000-0000-000000001382", "description": "Plaquettes de frein avant", "status": "to_order"}',
   'Pièce « Plaquettes de frein avant » de l''OR : passer en « À commander »');

select is((select order_status::text from public.ro_lines where id = '61000000-0000-0000-0000-000000001381'), 'to_order',
          'Action préparée : rien ne change avant la validation');

select is((public.execute_agent_action('a1380000-0000-0000-0000-000000000001')).status, 'done', 'Commande validée');
select is((select order_status::text from public.ro_lines where id = '61000000-0000-0000-0000-000000001381'), 'ordered',
          'Pièce passée « Commandée »');
select ok(exists (select 1 from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000001381'
                  and label = 'Pièce commandée (Agent Direction) : Disque de frein avant'),
          'Historique de l''OR : pièce commandée par l''Agent Direction');

select is((public.execute_agent_action('a1380000-0000-0000-0000-000000000002')).status, 'done',
          'Retour en arrière validé');
select is((select order_status::text from public.ro_lines where id = '61000000-0000-0000-0000-000000001382'), 'to_order',
          'Pièce reçue repassée « À commander »');

select * from finish();
rollback;
