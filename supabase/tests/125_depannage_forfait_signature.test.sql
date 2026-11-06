-- =============================================================================
-- Dépannage extérieur : lieu et forfait de la zone sur ce que le client signe, ligne au devis
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

\ir helpers/fixtures.psql

-- OR de dépannage en zone 3 (30 km, trajet compris dans le forfait)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, client_id, requested_work, intervention_type, roadside_address,
                                  roadside_km, roadside_minutes)
select '50000000-0000-0000-0000-000000001251', id, client_id, 'Crevaison', 'roadside', 'Aire de Roissy, 95700 Roissy', 30, 60
from public.vehicles where id = '30000000-0000-0000-0000-000000000001';
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000001251', 'planned', 'labor', 'Remplacement pneu', 1);

-- Lien à distance
select (public.request_repair_order_signature('50000000-0000-0000-0000-000000001251', 'email')) ->> 'token' as ro_token \gset
select results_eq(
  format($$ select d -> 'roadside' ->> 'address', d -> 'roadside' ->> 'label', (d -> 'roadside' ->> 'price')::numeric
            from public.public_get_document(%L) d $$, :'ro_token'),
  $$ values ('Aire de Roissy, 95700 Roissy'::text, 'Forfait déplacement zone 3'::text, 130.00::numeric) $$,
  'Lien à distance : lieu et forfait de la zone 3');

-- Borne
select public.request_repair_order_signature('50000000-0000-0000-0000-000000001251', 'kiosk');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');  -- borne
select results_eq(
  $$ select public.kiosk_pending_signature() -> 'roadside' ->> 'address',
            (public.kiosk_pending_signature() -> 'roadside' ->> 'price')::numeric $$,
  $$ values ('Aire de Roissy, 95700 Roissy'::text, 130.00::numeric) $$,
  'Borne : lieu et forfait de la zone 3');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.cancel_signature_request(id) from public.signature_requests
where repair_order_id = '50000000-0000-0000-0000-000000001251' and channel = 'kiosk' and status = 'pending';

-- OR à l'atelier : rien à afficher
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000001252', '30000000-0000-0000-0000-000000000001', 'Vidange');
select (public.request_repair_order_signature('50000000-0000-0000-0000-000000001252', 'email')) ->> 'token' as shop_token \gset
select is((public.public_get_document(:'shop_token')) -> 'roadside', 'null'::jsonb, 'OR à l''atelier : pas de lieu');

-- Devis : une ligne de déplacement, avec le lieu, comme à la facture
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000001251') as quote \gset
select results_eq(
  format($$ select section::text, description, unit_price, quantity from public.quote_lines
            where quote_id = %L and line_type = 'travel' $$, :'quote'),
  $$ values ('planned'::text, 'Forfait déplacement zone 3 · Aire de Roissy, 95700 Roissy'::text, 130.00::numeric, 1::numeric) $$,
  'Devis : forfait de la zone 3 avec le lieu');
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000001251') as quote_again \gset
select is(:'quote_again'::uuid, :'quote'::uuid, 'Le devis est repris');
select is((select count(*)::int from public.quote_lines where quote_id = :'quote' and line_type = 'travel'), 1,
          'Devis repris : le forfait n''est pas ajouté une deuxième fois');
select is((select total_ht from public.v_quote_totals where quote_id = :'quote'),
          (select sum(net_ht) from public.quote_lines where quote_id = :'quote'),
          'Le forfait compte dans le total du devis');

-- Devis en ligne : le prix affiché en haut est celui de la ligne, même modifié à la main
update public.quote_lines set unit_price = 100 where quote_id = :'quote' and line_type = 'travel';
select public.share_quote(:'quote') as quote_token \gset
select results_eq(
  format($$ select d -> 'roadside' ->> 'address', d -> 'roadside' ->> 'label', (d -> 'roadside' ->> 'price')::numeric
            from public.public_get_document(%L) d $$, :'quote_token'),
  $$ values ('Aire de Roissy, 95700 Roissy'::text, 'Forfait déplacement zone 3'::text, 100.00::numeric) $$,
  'Devis en ligne : lieu et prix de la ligne du devis');
update public.quote_lines set unit_price = 130 where quote_id = :'quote' and line_type = 'travel';

-- Devis sur la borne
select (public.request_quote_signature(:'quote')) ->> 'id' as request \gset
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select results_eq(
  $$ select public.kiosk_pending_signature() ->> 'kind', public.kiosk_pending_signature() -> 'roadside' ->> 'address',
            (public.kiosk_pending_signature() -> 'roadside' ->> 'price')::numeric $$,
  $$ values ('quote'::text, 'Aire de Roissy, 95700 Roissy'::text, 130.00::numeric) $$,
  'Devis sur la borne : lieu et prix');

-- Signé : l'OR issu du devis ne reprend pas le déplacement, l'OR d'origine le facture une fois
select public.kiosk_sign_repair_order(:'request', 'M. Dupont', pg_temp.fake_file('signature'));
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.create_repair_order_from_quote(:'quote') as new_order \gset
select is((select requested_work from public.repair_orders where id = :'new_order'), 'Remplacement pneu',
          'Le déplacement n''est pas une tâche de l''OR issu du devis');
select is((select count(*)::int from public.ro_lines where repair_order_id = :'new_order' and line_type = 'travel'), 0,
          'Aucune ligne de déplacement sur l''OR issu du devis');
select is((select intervention_type::text from public.repair_orders where id = :'new_order'), 'workshop',
          'L''OR issu du devis ne facture pas de déplacement');
select public.build_invoice_draft(array[:'new_order'::uuid]) as new_invoice \gset
select is((select count(*)::int from public.invoice_lines where invoice_id = :'new_invoice' and line_type = 'travel'), 0,
          'Facture de l''OR issu du devis : pas de déplacement');
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000001251'::uuid]) as origin_invoice \gset
select results_eq(
  format($$ select unit_price from public.invoice_lines where invoice_id = %L and line_type = 'travel' $$, :'origin_invoice'),
  $$ values (130.00::numeric) $$,
  'Facture de l''OR d''origine : le forfait, une seule fois');

-- Fonctions internes : ni client anonyme ni utilisateur connecté
select ok(not has_function_privilege('anon', 'public.roadside_summary(uuid)', 'execute'), 'Résumé fermé à anon');
select ok(not has_function_privilege('authenticated', 'public.quote_roadside_summary(uuid)', 'execute'),
          'Résumé du devis fermé aux comptes connectés');

select * from finish();
rollback;
