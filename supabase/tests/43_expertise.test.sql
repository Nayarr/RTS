-- =============================================================================
-- Expertise avant devis : 1 h ou moins au choix du bureau ; au-delà, facturée moins 1 h
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

-- Deux OR d'expertise (PL, 90 €/h), devis acceptés : 0,5 h + 1 h + 1 h ; et 1 h tout juste.
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000000043', 'OR90043', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Expertise', 'quote_pending'),
  ('50000000-0000-0000-0000-000000000044', 'OR90044', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Expertise courte', 'quote_pending');
insert into public.ro_lines (id, repair_order_id, kind, position, line_type, description, estimated_hours, quantity) values
  ('51000000-0000-0000-0000-000000000431', '50000000-0000-0000-0000-000000000043', 'done', 1, 'labor', 'Lecture valise', 0.5, 1),
  ('51000000-0000-0000-0000-000000000432', '50000000-0000-0000-0000-000000000043', 'done', 2, 'labor', 'Recherche de fuite', 1, 1),
  ('51000000-0000-0000-0000-000000000433', '50000000-0000-0000-0000-000000000043', 'done', 3, 'labor', 'Essai routier', 1, 1),
  ('51000000-0000-0000-0000-000000000441', '50000000-0000-0000-0000-000000000044', 'done', 1, 'labor', 'Diagnostic', 1, 1);
insert into public.quotes (id, number, status, repair_order_id, client_id, vehicle_id, accepted_at) values
  ('60000000-0000-0000-0000-000000000043', 'DV90043', 'accepted', '50000000-0000-0000-0000-000000000043',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now()),
  ('60000000-0000-0000-0000-000000000044', 'DV90044', 'accepted', '50000000-0000-0000-0000-000000000044',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', now());
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- ---------------------------------------------------------------- Plus d'1 h : 1re heure offerte
select public.pre_quote_work('50000000-0000-0000-0000-000000000043') as pending \gset
select is((:'pending'::jsonb ->> 'expertise_hours')::numeric, 2.5, 'Temps d''expertise : 2,5 h');
select is((:'pending'::jsonb ->> 'first_hour_offered')::boolean, true, 'Plus d''1 h : première heure offerte');
select results_eq(
  $$ select (l ->> 'offered_hours')::numeric, (l ->> 'billed_hours')::numeric, (l ->> 'suggested_price')::numeric
     from jsonb_array_elements(public.pre_quote_work('50000000-0000-0000-0000-000000000043') -> 'lines') l $$,
  $$ values (0.5, 0.0, 0.00), (0.5, 0.5, 45.00), (0.0, 1.0, 90.00) $$,
  'L''heure offerte couvre les premières lignes ; le reste est facturé');

-- Décision imposée : « tout offrir » demandé, l'expertise est quand même facturée moins 1 h
select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000043',
  '[{"line_id": "51000000-0000-0000-0000-000000000431", "decision": "offered"},
    {"line_id": "51000000-0000-0000-0000-000000000432", "decision": "offered"},
    {"line_id": "51000000-0000-0000-0000-000000000433", "decision": "offered"}]') as settled \gset
select results_eq(
  format($$ select total_ht from public.invoices where id = %L $$, :'settled'::jsonb ->> 'invoice_id'),
  $$ values (135.00::numeric) $$,
  'Facturé : 2,5 h − 1 h = 1,5 h × 90 €/h');
select results_eq(
  format($$ select description, unit_price, discount_percent from public.invoice_lines where invoice_id = %L order by position $$,
         :'settled'::jsonb ->> 'invoice_id'),
  $$ values ('Lecture valise · 1re heure d''expertise offerte', 45.00::numeric, 100.00::numeric),
            ('Recherche de fuite', 45.00, 0.00),
            ('Recherche de fuite · 1re heure d''expertise offerte', 45.00, 100.00),
            ('Essai routier', 90.00, 0.00) $$,
  'La première heure offerte apparaît sur la facture avec 100 % de remise');
select ok(exists (select 1 from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000000043'
                  and label like 'Travaux réalisés avant le devis : expertise de 2,5 h, 1re heure offerte%'),
          'Historique de l''OR');

-- ---------------------------------------------------------------- 1 h tout juste : au choix
select is((public.pre_quote_work('50000000-0000-0000-0000-000000000044') ->> 'first_hour_offered')::boolean, false,
          '1 h d''expertise : pas de règle imposée');
select is((public.pre_quote_work('50000000-0000-0000-0000-000000000044') -> 'lines' -> 0 ->> 'suggested_price')::numeric,
          90.00, 'Prix proposé : 1 h × 90 €/h');
select ok((public.settle_pre_quote_work('50000000-0000-0000-0000-000000000044',
  '[{"line_id": "51000000-0000-0000-0000-000000000441", "decision": "offered", "price": 90}]') ->> 'invoice_id') is null,
  'Le bureau choisit d''offrir l''expertise : aucune facture');

select * from finish();
rollback;
