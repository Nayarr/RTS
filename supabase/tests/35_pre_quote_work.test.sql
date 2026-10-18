-- =============================================================================
-- Travaux réalisés avant le devis : lignes proposées, facturer / offrir, rappel, droits
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

\ir helpers/fixtures.psql

-- OR de diagnostic (PL, taux 90 €/h) : devis accepté ; un 2e OR tout offert ; un 3e au devis non accepté.
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000000001', 'OR90001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Bruit freinage', 'quote_pending'),
  ('50000000-0000-0000-0000-000000000002', 'OR90002', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'remorque', 'Contrôle', 'quote_pending'),
  ('50000000-0000-0000-0000-000000000003', 'OR90003', '30000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 'vul', 'Diagnostic', 'quote_pending');
insert into public.ro_lines (id, repair_order_id, kind, position, line_type, description, estimated_hours, unit_price, quantity) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'done', 1, 'labor', 'Diagnostic freinage', 1.5, null, 1),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'done', 2, 'package', 'Contrôle sécurité', null, 60, 1),
  ('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'done', 3, 'text', 'Remarque', null, null, 1),
  ('51000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 'planned', 4, 'labor', 'Disques avant', 2, null, 1),
  ('51000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000002', 'done', 1, 'labor', 'Contrôle feux', 0.5, null, 1),
  ('51000000-0000-0000-0000-000000000006', '50000000-0000-0000-0000-000000000003', 'done', 1, 'labor', 'Diagnostic clim', 1, null, 1);
insert into public.quotes (id, number, status, repair_order_id, client_id, vehicle_id, accepted_at) values
  ('60000000-0000-0000-0000-000000000001', 'DV90001', 'accepted', '50000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now()),
  ('60000000-0000-0000-0000-000000000002', 'DV90002', 'accepted', '50000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', now()),
  ('60000000-0000-0000-0000-000000000003', 'DV90003', 'sent', '50000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', null);
insert into public.quote_lines (quote_id, section, line_type, description, unit_price, source_ro_line_id) values
  ('60000000-0000-0000-0000-000000000001', 'done', 'labor', 'Diagnostic freinage', 135, '51000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000001', 'planned', 'labor', 'Disques avant', 180, null);
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Lignes proposées
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.pre_quote_work('50000000-0000-0000-0000-000000000001') as pending \gset
select is(:'pending'::jsonb ->> 'quote_number', 'DV90001', 'Devis accepté : décision à prendre');
select is(jsonb_array_length(:'pending'::jsonb -> 'lines'), 2, 'Travaux effectués seulement (ni texte, ni travaux à prévoir)');
select is((:'pending'::jsonb -> 'lines' -> 0 ->> 'suggested_price')::numeric, 45.00,
          'Expertise de 1,5 h : prix proposé pour la part facturée, 0,5 h × 90 €/h (taux PL), 1re heure offerte');
select is((:'pending'::jsonb -> 'lines' -> 1 ->> 'suggested_price')::numeric, 60.00, 'Forfait : son prix');
select is(public.pre_quote_work('50000000-0000-0000-0000-000000000003'), null, 'Devis pas encore accepté : rien à décider');

-- ---------------------------------------------------------------- Contrôles de saisie
select throws_ok($$ select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000001',
  '[{"line_id": "51000000-0000-0000-0000-000000000001", "decision": "billed", "price": 135}]') $$,
  '22023', 'Choisis « facturer » ou « offrir » pour chaque ligne', 'Chaque ligne doit être tranchée');
select throws_ok($$ select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000001',
  '[{"line_id": "51000000-0000-0000-0000-000000000001", "decision": "billed", "price": 0},
    {"line_id": "51000000-0000-0000-0000-000000000002", "decision": "offered", "price": 60}]') $$,
  '22023', 'Indique un prix pour chaque ligne à facturer', 'Prix obligatoire pour une ligne facturée');

-- ---------------------------------------------------------------- Facturer une ligne, offrir l'autre
select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000001',
  '[{"line_id": "51000000-0000-0000-0000-000000000001", "decision": "billed", "price": 120},
    {"line_id": "51000000-0000-0000-0000-000000000002", "decision": "offered", "price": 60}]') as settled \gset
select ok((:'settled'::jsonb ->> 'invoice_number') is not null, 'Facture séparée émise tout de suite');
select results_eq(
  format($$ select status::text, total_ht from public.invoices where id = %L $$, :'settled'::jsonb ->> 'invoice_id'),
  $$ values ('issued', 120.00::numeric) $$,
  'Montant : seulement la ligne facturée, au prix saisi');
select results_eq(
  format($$ select description, unit_price, discount_percent from public.invoice_lines where invoice_id = %L order by position $$,
         :'settled'::jsonb ->> 'invoice_id'),
  $$ values ('Diagnostic freinage', 120.00::numeric, 0.00::numeric),
            ('Diagnostic freinage · 1re heure d''expertise offerte', 90.00::numeric, 100.00::numeric),
            ('Contrôle sécurité · offert (geste commercial)', 60.00::numeric, 100.00::numeric) $$,
  'Lignes offertes (1re heure d''expertise, forfait) visibles avec 100 % de remise');
select is((select status::text from public.repair_orders where id = '50000000-0000-0000-0000-000000000001'), 'invoiced',
          'OR de diagnostic facturé');
select is((select done_line_decision::text from public.quote_lines
           where source_ro_line_id = '51000000-0000-0000-0000-000000000001'), 'billed',
          'Décision notée sur la ligne du devis');
select is(public.pre_quote_work('50000000-0000-0000-0000-000000000001'), null, 'Plus rien à décider');
select throws_ok($$ select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000001', '[]') $$,
  'P0001', null, 'Pas de seconde décision');

-- ---------------------------------------------------------------- Tout offrir : facture à 0 € quand même
select public.settle_pre_quote_work('50000000-0000-0000-0000-000000000002',
  '[{"line_id": "51000000-0000-0000-0000-000000000005", "decision": "offered", "price": 45}]') as offered \gset
select results_eq(
  format($$ select i.status::text, i.total_ttc, l.unit_price, l.discount_percent
            from public.invoices i join public.invoice_lines l on l.invoice_id = i.id where i.id = %L $$,
         :'offered'::jsonb ->> 'invoice_id'),
  $$ values ('issued'::text, 0.00::numeric, 45.00::numeric, 100.00::numeric) $$,
  'Tout offert : facture émise à 0 €, le travail offert y figure avec son prix et 100 % de remise');

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select throws_ok($$ select public.pre_quote_work('50000000-0000-0000-0000-000000000003') $$, '42501', null,
                 'Technicien : pas d''accès');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------- Rappel dans la cloche
update public.quotes set status = 'accepted', accepted_at = now() where id = '60000000-0000-0000-0000-000000000003';
select is(public.pre_quote_work_alerts(), 2, 'Devis accepté, travaux non tranchés : alerte direction et réception');
select is(public.pre_quote_work_alerts(), 0, 'Pas de doublon');

select * from finish();
rollback;
