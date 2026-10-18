-- =============================================================================
-- Devis signé sur la borne par le client présent
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work) values
  ('50000000-0000-0000-0000-000000000075', '30000000-0000-0000-0000-000000000001', 'Freins');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000075', 'planned', 'labor', 'Remplacement plaquettes', 1);
reset role;
set local session_replication_role = replica;
update public.repair_orders set status = 'quote_pending' where id = '50000000-0000-0000-0000-000000000075';
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000000075') as quote \gset
select (public.request_quote_signature(:'quote')) ->> 'id' as request \gset
select isnt((select number from public.quotes where id = :'quote'), null, 'Numéro donné en l''affichant sur la borne');
select is((public.quote_signature_request(:'quote')) ->> 'status', 'pending', 'Bureau : demande en attente');

-- La borne affiche le devis
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');  -- borne
select results_eq(
  $$ select public.kiosk_pending_signature() ->> 'kind', public.kiosk_pending_signature() ->> 'requested_work' $$,
  $$ values ('quote'::text, 'Remplacement plaquettes'::text) $$,
  'Borne : devis affiché avec ses travaux');
select ok((public.kiosk_pending_signature() ->> 'total_ttc')::numeric > 0, 'Total TTC affiché');

-- Le client signe : devis accepté, OR d'origine en « Facture à faire », bureau prévenu
select public.kiosk_sign_repair_order(:'request', 'M. Dupont', pg_temp.fake_file('signature'));
reset role;
select results_eq(
  format($$ select status::text, accepted_by_name, signature_file_id is not null from public.quotes where id = %L $$, :'quote'),
  $$ values ('accepted'::text, 'M. Dupont'::text, true) $$,
  'Devis accepté avec la signature');
select is((select status from public.repair_orders where id = '50000000-0000-0000-0000-000000000075'),
          'to_invoice'::public.repair_order_status, 'OR d''origine : « Facture à faire »');
select is((select count(*) from public.notifications where type = 'quote_response' and title like '%accepté sur la borne'),
          2::bigint, 'Direction et réception prévenues');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok(format($$ select public.request_quote_signature(%L) $$, :'quote'), 'P0001', null,
                 'Devis déjà accepté : plus de signature');

select * from finish();
rollback;
