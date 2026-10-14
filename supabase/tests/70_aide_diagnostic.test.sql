-- =============================================================================
-- Aide au diagnostic : historique du véhicule, documentation technique cherchée en plein texte
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

-- Deux passages du véhicule AB-123-CD : un ancien (pièce changée), l'OR en cours d'Alice
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.repair_orders (id, vehicle_id, requested_work, mileage, technician_id) values
  ('50000000-0000-0000-0000-000000000070', '30000000-0000-0000-0000-000000000001', 'Voyant huile', 412000,
   '10000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000071', '30000000-0000-0000-0000-000000000001', 'Vidange', 380000, null);
insert into public.ro_lines (repair_order_id, kind, line_type, description) values
  ('50000000-0000-0000-0000-000000000071', 'done', 'labor', 'Vidange moteur'),
  ('50000000-0000-0000-0000-000000000071', 'planned', 'part', 'Filtre à huile');

-- Documentation : un document prêt, un autre encore en lecture
reset role;
insert into public.knowledge_documents (id, title, status) values
  ('d0000000-0000-0000-0000-000000000001', 'Manuel Volvo FH', 'ready'),
  ('d0000000-0000-0000-0000-000000000002', 'Brouillon', 'pending');
insert into public.knowledge_chunks (document_id, page, content) values
  ('d0000000-0000-0000-0000-000000000001', 12, 'Voyant de pression d''huile allumé : contrôler le niveau puis le capteur de pression d''huile.'),
  ('d0000000-0000-0000-0000-000000000001', 40, 'Remplacement des plaquettes de frein avant.'),
  ('d0000000-0000-0000-0000-000000000002', 1, 'Voyant de pression d''huile : brouillon non publié.');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice, technicienne de l'OR
select is((public.vehicle_history_for_diagnosis('50000000-0000-0000-0000-000000000070')) -> 'vehicule' ->> 'immatriculation',
          'AB-123-CD', 'Le technicien de l''OR lit l''historique du véhicule');
select is(jsonb_array_length((public.vehicle_history_for_diagnosis('50000000-0000-0000-0000-000000000070')) -> 'passages'),
          1, 'Passages précédents du véhicule');
select is((public.vehicle_history_for_diagnosis('50000000-0000-0000-0000-000000000070')) -> 'passages' -> 0 -> 'pieces' ->> 0,
          'Filtre à huile', 'Pièces des passages précédents');
select is((select title from public.search_knowledge('le voyant d''huile s''allume au ralenti') limit 1),
          'Manuel Volvo FH', 'Passage utile trouvé dans la documentation');
select is((select count(*) from public.search_knowledge('voyant pression huile') where title = 'Brouillon'),
          0::bigint, 'Document pas encore prêt : ignoré');
select is((select count(*) from public.knowledge_chunks), 0::bigint, 'Passages non lisibles directement par le technicien');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');  -- Bruno, pas sur cet OR
select throws_ok($$ select public.vehicle_history_for_diagnosis('50000000-0000-0000-0000-000000000070') $$,
                 '42501', null, 'OR d''un autre technicien : historique refusé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_like($$ insert into public.knowledge_documents (title) values ('X') $$,
                   '%row-level security%', 'Documentation gérée par la direction');

select * from finish();
rollback;
