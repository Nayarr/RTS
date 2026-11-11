-- =============================================================================
-- Devis libre transformé en OR puis accepté : pas de « travaux réalisés avant le devis »
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

-- Devis fait librement (sans OR), PL : un forfait et de la main-d'œuvre
set local session_replication_role = replica;
insert into public.quotes (id, number, status, client_id, vehicle_id, vehicle_type) values
  ('60000000-0000-0000-0000-000000000136', 'DV90136', 'sent', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'pl');
insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity, standard_hours) values
  ('60000000-0000-0000-0000-000000000136', 'planned', 1, 'labor', 'Remplacement turbocompresseur', 90, 6, 6),
  ('60000000-0000-0000-0000-000000000136', 'planned', 2, 'labor', 'Remplacement joint spi', 90, 1, 1);
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- Transformé en OR avant l'accord : les lignes du devis deviennent les travaux effectués de l'OR
select public.create_repair_order_from_quote('60000000-0000-0000-0000-000000000136') as ro_id \gset
select is((select count(*)::int from public.ro_lines where repair_order_id = :'ro_id' and kind = 'done'), 2,
          'L''OR né du devis reprend ses travaux');

-- Puis le client accepte le devis (accord enregistré par l'accueil)
select public.set_quote_response('60000000-0000-0000-0000-000000000136', 'accepted');

select is(public.pre_quote_work(:'ro_id'), null, 'Rien à facturer ou offrir avant le devis : pas de fenêtre');
select throws_ok(
  format($$ select public.settle_pre_quote_work(%L, '[]') $$, :'ro_id'),
  'P0001', 'Rien à décider : travaux déjà facturés ou offerts',
  'Pas de facture d''expertise possible pour cet OR');

-- Contrôle : un OR d'expertise avec un devis préparé depuis l'OR garde la fenêtre
reset role;
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000000136', 'OR90136', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Expertise', 'quote_pending');
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, quantity) values
  ('50000000-0000-0000-0000-000000000136', 'done', 1, 'labor', 'Diagnostic', 1, 1);
insert into public.quotes (number, status, repair_order_id, client_id, vehicle_id, accepted_at) values
  ('DV90137', 'accepted', '50000000-0000-0000-0000-000000000136', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002', now());
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select isnt(public.pre_quote_work('50000000-0000-0000-0000-000000000136'), null,
            'Expertise faite avant le devis : la fenêtre reste proposée');

select * from finish();
rollback;
