-- =============================================================================
-- Expertise de plus d'1 h : 1re heure offerte par défaut, mais chaque ligne reste au choix du bureau
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

-- Trois OR d'expertise (PL, 90 €/h), devis acceptés : 1 h + 1 h chacun.
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000000135', 'OR90135', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Expertise', 'quote_pending'),
  ('50000000-0000-0000-0000-000000000136', 'OR90136', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Expertise', 'quote_pending'),
  ('50000000-0000-0000-0000-000000000137', 'OR90137', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Expertise', 'quote_pending');
insert into public.ro_lines (id, repair_order_id, kind, position, line_type, description, estimated_hours, quantity) values
  ('51000000-0000-0000-0000-000000001351', '50000000-0000-0000-0000-000000000135', 'done', 1, 'labor', 'Diagnostic', 1, 1),
  ('51000000-0000-0000-0000-000000001352', '50000000-0000-0000-0000-000000000135', 'done', 2, 'labor', 'Essai routier', 1, 1),
  ('51000000-0000-0000-0000-000000001361', '50000000-0000-0000-0000-000000000136', 'done', 1, 'labor', 'Diagnostic', 1, 1),
  ('51000000-0000-0000-0000-000000001362', '50000000-0000-0000-0000-000000000136', 'done', 2, 'labor', 'Essai routier', 1, 1),
  ('51000000-0000-0000-0000-000000001371', '50000000-0000-0000-0000-000000000137', 'done', 1, 'labor', 'Diagnostic', 1, 1),
  ('51000000-0000-0000-0000-000000001372', '50000000-0000-0000-0000-000000000137', 'done', 2, 'labor', 'Essai routier', 1, 1);
insert into public.quotes (id, number, status, repair_order_id, client_id, vehicle_id, accepted_at) values
  ('60000000-0000-0000-0000-000000000135', 'DV90135', 'accepted', '50000000-0000-0000-0000-000000000135',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now()),
  ('60000000-0000-0000-0000-000000000136', 'DV90136', 'accepted', '50000000-0000-0000-0000-000000000136',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', now()),
  ('60000000-0000-0000-0000-000000000137', 'DV90137', 'accepted', '50000000-0000-0000-0000-000000000137',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now());
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

select is((public.pre_quote_work('50000000-0000-0000-0000-000000000135') -> 'lines' -> 1 ->> 'full_price')::numeric,
          90.00, 'Prix de la ligne entière proposé (facturée sans heure offerte)');

-- 1re heure offerte (défaut) et la 2e ligne offerte aussi : tout est offert
select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000135',
  '[{"line_id": "51000000-0000-0000-0000-000000001351", "decision": "offered", "first_hour": true},
    {"line_id": "51000000-0000-0000-0000-000000001352", "decision": "offered", "price": 90}]') as s135 \gset
select results_eq(
  format($$ select description, unit_price, discount_percent from public.invoice_lines where invoice_id = %L order by position $$,
         :'s135'::jsonb ->> 'invoice_id'),
  $$ values ('Diagnostic · 1re heure d''expertise offerte', 90.00::numeric, 100.00::numeric),
            ('Essai routier · offert (geste commercial)', 90.00, 100.00) $$,
  'La 2e heure peut aussi être offerte : geste commercial');
select is((select total_ttc from public.invoices where id = (:'s135'::jsonb ->> 'invoice_id')::uuid), 0.00::numeric,
          'Tout offert : facture à 0 €');

-- 1re heure repassée en payante : les deux lignes facturées en entier
select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000136',
  '[{"line_id": "51000000-0000-0000-0000-000000001361", "decision": "billed", "price": 90, "first_hour": false},
    {"line_id": "51000000-0000-0000-0000-000000001362", "decision": "billed", "price": 90}]') as s136 \gset
select is((select total_ht from public.invoices where id = (:'s136'::jsonb ->> 'invoice_id')::uuid), 180.00::numeric,
          'Première heure facturée aussi : 2 h × 90 €/h');
select ok(not exists (select 1 from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000000136'
                      and label like '%1re heure offerte%'),
          'Historique sans mention de la 1re heure offerte');
select is((:'s136'::jsonb ->> 'first_hour_offered')::boolean, false, 'Réponse : 1re heure non offerte');

-- Facturée en entier sans prix saisi : prix de la ligne entière
select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000137',
  '[{"line_id": "51000000-0000-0000-0000-000000001371", "decision": "billed", "first_hour": false},
    {"line_id": "51000000-0000-0000-0000-000000001372", "decision": "billed", "price": 90}]') as s137 \gset
select is((select total_ht from public.invoices where id = (:'s137'::jsonb ->> 'invoice_id')::uuid), 180.00::numeric,
          'Sans prix saisi, la ligne facturée en entier prend le prix de la ligne entière');

select * from finish();
rollback;
