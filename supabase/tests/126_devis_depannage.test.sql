-- =============================================================================
-- Dépannage extérieur choisi sur le devis : ligne, lieu affiché, OR créé, facturé une seule fois
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.quotes (id, client_id, vehicle_id, vehicle_type)
select '60000000-0000-0000-0000-000000001261', client_id, id, vehicle_type
from public.vehicles where id = '30000000-0000-0000-0000-000000000001';
insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity, vat_rate)
values ('60000000-0000-0000-0000-000000001261', 'planned', 0, 'labor', 'Remplacement pneu', 90, 1, 20);

-- Zone 3 posée sur le devis
select public.set_quote_roadside('60000000-0000-0000-0000-000000001261', ' Aire de Roissy ', 30, 60, null);
select results_eq(
  $$ select section::text, position, description, unit_price from public.quote_lines
     where quote_id = '60000000-0000-0000-0000-000000001261' and line_type = 'travel' $$,
  $$ values ('planned'::text, 1, 'Forfait déplacement zone 3 · Aire de Roissy'::text, 130.00::numeric) $$,
  'Ligne de déplacement ajoutée après les travaux');

-- Trajet corrigé : la même ligne est mise à jour
select public.set_quote_roadside('60000000-0000-0000-0000-000000001261', 'Aire de Roissy', 15, 70, null);
select results_eq(
  $$ select description, unit_price from public.quote_lines
     where quote_id = '60000000-0000-0000-0000-000000001261' and line_type = 'travel' $$,
  $$ values ('Déplacement zone 2 : 1 h 10 de trajet aller-retour · Aire de Roissy'::text, 105.00::numeric) $$,
  'Trajet corrigé : une seule ligne, mise à jour');

-- Retiré : plus de ligne ni de lieu
select public.set_quote_roadside('60000000-0000-0000-0000-000000001261', '', null, null, null);
select is((select count(*)::int from public.quote_lines
           where quote_id = '60000000-0000-0000-0000-000000001261' and line_type = 'travel'), 0, 'Retiré : plus de ligne');
select is((select roadside_address from public.quotes where id = '60000000-0000-0000-0000-000000001261'), null,
          'Retiré : plus de lieu');

-- Règles
select throws_ok(
  $$ select public.set_quote_roadside('60000000-0000-0000-0000-000000001261', 'Roissy', null, null, null) $$,
  '22023', 'Indique la distance et le temps de trajet aller-retour', 'Trajet obligatoire');
select throws_ok(
  $$ select public.set_quote_roadside('60000000-0000-0000-0000-000000001261', 'Lyon', 52, 60, null) $$,
  '22023', 'Au-delà de la zone 3 : indique le prix du déplacement', 'Prix obligatoire au-delà de la zone 3');
select public.set_quote_roadside('60000000-0000-0000-0000-000000001261', 'Aire de Roissy', 30, 60, null);

-- Devis sans OR : lieu et prix sur le lien et sur la borne
select public.share_quote('60000000-0000-0000-0000-000000001261') as quote_token \gset
select results_eq(
  format($$ select d -> 'roadside' ->> 'address', (d -> 'roadside' ->> 'price')::numeric
            from public.public_get_document(%L) d $$, :'quote_token'),
  $$ values ('Aire de Roissy'::text, 130.00::numeric) $$,
  'Lien du devis : lieu et prix');
select (public.request_quote_signature('60000000-0000-0000-0000-000000001261')) ->> 'id' as request \gset
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');  -- borne
select results_eq(
  $$ select public.kiosk_pending_signature() -> 'roadside' ->> 'address',
            (public.kiosk_pending_signature() -> 'roadside' ->> 'price')::numeric $$,
  $$ values ('Aire de Roissy'::text, 130.00::numeric) $$,
  'Borne : lieu et prix du devis');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.cancel_signature_request(:'request');

-- Devis dupliqué : le dépannage suit
select public.duplicate_quote('60000000-0000-0000-0000-000000001261') as copy \gset
select is((select roadside_km from public.quotes where id = :'copy'), 30.0::numeric, 'Copie : dépannage repris');
select is((select count(*)::int from public.quote_lines where quote_id = :'copy' and line_type = 'travel'), 1,
          'Copie : une ligne de déplacement');

-- OR créé depuis le devis : il devient un dépannage, sa facture a le déplacement une fois
select public.create_repair_order_from_quote('60000000-0000-0000-0000-000000001261') as new_order \gset
select results_eq(
  format($$ select intervention_type::text, roadside_address, roadside_km, roadside_minutes, requested_work
            from public.repair_orders where id = %L $$, :'new_order'),
  $$ values ('roadside'::text, 'Aire de Roissy'::text, 30.0::numeric, 60, 'Remplacement pneu'::text) $$,
  'OR créé : dépannage repris, déplacement absent des tâches');
select is((select count(*)::int from public.ro_lines where repair_order_id = :'new_order' and line_type = 'travel'), 0,
          'OR créé : pas de ligne de déplacement en double');
select public.build_invoice_draft(array[:'new_order'::uuid]) as invoice \gset
select results_eq(
  format($$ select unit_price from public.invoice_lines where invoice_id = %L and line_type = 'travel' $$, :'invoice'),
  $$ values (130.00::numeric) $$,
  'Facture : le forfait, une seule fois');

-- Le devis est maintenant rattaché à un OR de dépannage : il se règle sur l'OR, sans doublon
select throws_ok(
  $$ select public.set_quote_roadside('60000000-0000-0000-0000-000000001261', 'Ailleurs', 8, 20, null) $$,
  'P0001', 'Ce dépannage se modifie sur la fiche de l''OR', 'Devis d''un OR de dépannage : réglé sur l''OR');
select public.build_quote_from_repair_order(:'new_order') as rebuilt \gset
select is((select count(*)::int from public.quote_lines where quote_id = :'rebuilt' and line_type = 'travel'), 1,
          'Devis de l''OR : une seule ligne de déplacement');

-- Devis rattaché à un OR à l'atelier : l'OR devient un dépannage
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000001262', '30000000-0000-0000-0000-000000000001', 'Vidange');
select public.merge_quote_into_repair_order(:'copy', '50000000-0000-0000-0000-000000001262');
select results_eq(
  $$ select intervention_type::text, roadside_address from public.repair_orders
     where id = '50000000-0000-0000-0000-000000001262' $$,
  $$ values ('roadside'::text, 'Aire de Roissy'::text) $$,
  'Devis repris dans un OR : dépannage repris');

-- Devis accepté : verrouillé ; droits
select throws_ok(
  format($$ select public.set_quote_roadside(%L, 'Ailleurs', 8, 20, null) $$, :'copy'),
  'P0001', 'Ce devis ne peut plus être modifié', 'Devis rattaché : plus modifiable');
select pg_temp.act_as_anon();
select throws_ok(
  $$ select public.set_quote_roadside('60000000-0000-0000-0000-000000001261', 'X', 8, 20, null) $$,
  '42501', null, 'Fermé au client anonyme');

select * from finish();
rollback;
