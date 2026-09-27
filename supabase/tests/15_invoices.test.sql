-- =============================================================================
-- Facturation (bureau) : vue des factures, paiement plafonné, facture groupée
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work, mileage) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins', 184320),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Feux', null),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'Vidange', null);
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000001', 'done', 'labor', 'Plaquettes', 2),
  ('50000000-0000-0000-0000-000000000002', 'done', 'labor', 'Ampoules', 1);

-- ---------------------------------------------------------------- Brouillon
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]) as draft \gset
select results_eq(
  format($$ select status::text, client_name, vehicle_label, mileage, total_ht, total_ttc, balance_due, repair_order_numbers
            from public.v_invoices_overview where id = %L $$, :'draft'),
  $$ values ('draft', 'Transports Dupont', 'AB-123-CD', 184320, 180.00::numeric, 216.00::numeric, null::numeric,
             array['OR00001']) $$,
  'Brouillon : client, véhicule, kilométrage, totaux calculés en direct, OR concerné');

-- ---------------------------------------------------------------- Facture groupée
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid,
                                        '50000000-0000-0000-0000-000000000002'::uuid]) as grouped \gset
select results_eq(
  format($$ select vehicle_label, repair_order_numbers, total_ht from public.v_invoices_overview where id = %L $$,
         :'grouped'),
  $$ values ('Plusieurs véhicules (2)', array['OR00001', 'OR00002'], 270.00::numeric) $$,
  'Facture groupée : deux OR du même client');
select is((select count(*) from public.invoice_lines where invoice_id = :'grouped' and line_type = 'text'), 2::bigint,
          'Chaque OR a sa ligne d''en-tête sur la facture groupée');
select throws_ok($$ select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid,
                                                            '50000000-0000-0000-0000-000000000003'::uuid]) $$,
                 'P0001', 'Les OR d''une facture groupée doivent appartenir au même client',
                 'Pas de facture groupée entre deux clients');
delete from public.invoices where id = :'grouped';

-- ---------------------------------------------------------------- Émission et paiements
select public.issue_invoice(:'draft') as number \gset
select results_eq(
  format($$ select status::text, balance_due, payment_status from public.v_invoices_overview where id = %L $$, :'draft'),
  $$ values ('issued', 216.00::numeric, 'pending') $$,
  'Facture émise : reste dû = TTC');

select throws_ok(format($$ insert into public.payments (invoice_id, amount_ttc, method) values (%L, 2160, 'check') $$,
                        :'draft'),
                 'P0001', 'Le paiement dépasse le reste dû (216.00 €)', 'Un paiement ne dépasse pas le reste dû');
insert into public.payments (invoice_id, amount_ttc, method) values (:'draft', 100, 'check');
select lives_ok(format($$ insert into public.payments (invoice_id, amount_ttc, method) values (%L, 116, 'bank_transfer') $$,
                       :'draft'),
                'Le solde exact est accepté');
select results_eq(
  format($$ select balance_due, payment_status from public.v_invoices_overview where id = %L $$, :'draft'),
  $$ values (0::numeric, 'paid') $$,
  'Facture soldée');

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select is((select count(*) from public.v_invoices_overview), 0::bigint, 'Un technicien ne voit pas les factures');

select * from finish();
rollback;
