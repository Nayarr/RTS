-- =============================================================================
-- Devis acceptés dont l'OR est créé : « Transformés en OR », hors des devis à transformer
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select (public.office_dashboard() ->> 'quotes_to_convert')::int as before \gset

reset role;
set local session_replication_role = replica;
-- OR d'expertise et nouvel OR créé depuis son devis accepté
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status, origin_quote_id) values
  ('50000000-0000-0000-0000-000000001371', 'OR91371', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Expertise', 'quote_pending', null),
  ('50000000-0000-0000-0000-000000001372', 'OR91372', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Travaux', 'quote_pending', '60000000-0000-0000-0000-000000001371'),
  -- OR né d'un devis libre
  ('50000000-0000-0000-0000-000000001373', 'OR91373', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Travaux', 'quote_pending', '60000000-0000-0000-0000-000000001373');
insert into public.quotes (id, number, status, repair_order_id, resulting_repair_order_id, client_id, vehicle_id, accepted_at) values
  -- devis de l'OR d'expertise, accepté, nouvel OR créé
  ('60000000-0000-0000-0000-000000001371', 'DV91371', 'accepted', '50000000-0000-0000-0000-000000001371',
   '50000000-0000-0000-0000-000000001372', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now()),
  -- devis libre accepté, pas encore d'OR
  ('60000000-0000-0000-0000-000000001372', 'DV91372', 'accepted', null, null,
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now()),
  -- devis libre transformé en OR puis accepté
  ('60000000-0000-0000-0000-000000001373', 'DV91373', 'accepted', '50000000-0000-0000-0000-000000001373', null,
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', now()),
  -- devis préparé depuis l'OR d'expertise, accepté, OR à créer
  ('60000000-0000-0000-0000-000000001374', 'DV91374', 'accepted', '50000000-0000-0000-0000-000000001371', null,
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now());
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((select order_created from public.v_quotes_overview where id = '60000000-0000-0000-0000-000000001371'), true,
          'Nouvel OR créé depuis le devis : transformé');
select is((select order_created from public.v_quotes_overview where id = '60000000-0000-0000-0000-000000001373'), true,
          'Devis libre transformé en OR : transformé');
select is((select order_created from public.v_quotes_overview where id = '60000000-0000-0000-0000-000000001372'), false,
          'Devis libre accepté sans OR : à transformer');
select is((select order_created from public.v_quotes_overview where id = '60000000-0000-0000-0000-000000001374'), false,
          'Devis de l''OR d''expertise accepté, OR pas encore créé : à transformer');
select is((public.office_dashboard() ->> 'quotes_to_convert')::int, :before + 2,
          'Tableau de bord : seulement les deux devis à transformer');
select is((select reloptions from pg_class where oid = 'public.v_quotes_overview'::regclass), '{security_invoker=on}'::text[],
          'La vue reste lue avec les droits de l''utilisateur');

select * from finish();
rollback;
