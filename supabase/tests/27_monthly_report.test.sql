-- =============================================================================
-- Pilotage : rapport mensuel (direction uniquement)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Données de mars 2026 (hors règles métier)
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, created_at) values
  ('50000000-0000-0000-0000-000000000001', 'OR90001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Freins', '2026-03-10 09:00+01'),
  ('50000000-0000-0000-0000-000000000002', 'OR90002', '30000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 'vul', 'Vidange', '2026-04-01 09:00+02');
insert into public.invoices (id, number, status, client_id, client_name, issued_at, due_date, total_ht, total_vat, total_ttc) values
  ('80000000-0000-0000-0000-00000000000a', 'F90001', 'issued', '20000000-0000-0000-0000-000000000001', 'Transports Dupont',
   '2026-03-15 10:00+01', '2026-04-15', 1000, 200, 1200),
  -- Émise le 1er avril à 0 h 30 (heure de Paris) : hors du mois de mars
  ('80000000-0000-0000-0000-00000000000b', 'F90002', 'issued', '20000000-0000-0000-0000-000000000002', 'Logistique Martin',
   '2026-04-01 00:30+02', '2026-05-01', 500, 100, 600);
insert into public.invoice_lines (invoice_id, line_type, description, unit_price, quantity, purchase_price) values
  ('80000000-0000-0000-0000-00000000000a', 'labor', 'Main d''œuvre', 600, 1, null),
  ('80000000-0000-0000-0000-00000000000a', 'part', 'Disques', 200, 2, 125),
  ('80000000-0000-0000-0000-00000000000b', 'labor', 'Vidange', 500, 1, null);
insert into public.payments (invoice_id, amount_ttc, method, paid_on) values
  ('80000000-0000-0000-0000-00000000000a', 300, 'bank_transfer', '2026-03-31'),
  ('80000000-0000-0000-0000-00000000000b', 600, 'bank_transfer', '2026-04-02');
insert into public.credit_notes (number, invoice_id, amount_ht, issued_at)
values ('AV90001', '80000000-0000-0000-0000-00000000000a', 100, '2026-03-20 10:00+01');
insert into public.quotes (client_id, status, accepted_at)
values ('20000000-0000-0000-0000-000000000001', 'accepted', '2026-03-12 15:00+01');
update public.vehicles set ct_due_date = public.paris_date(now()) + 5 where id = '30000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Rapport
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select public.monthly_report('2026-03-17') as report \gset

select is(:'report'::jsonb ->> 'month', '2026-03-01', 'N''importe quel jour du mois donne le mois entier');
select is(:'report'::jsonb -> 'figures',
          '{"revenue_ht": 900.00, "labor_ht": 600.00, "parts_ht": 400.00, "parts_margin_ht": 150.00,
            "credit_notes_ht": 100.00, "invoice_count": 1, "collected_ttc": 300.00,
            "outstanding_ttc": 780.00, "overdue_ttc": 780.00, "repair_orders_opened": 1, "quotes_accepted": 1}'::jsonb,
          'Chiffres du mois (avoir déduit, facture du 1er avril exclue) ; restes dus à ce jour');
select is(:'report'::jsonb -> 'overdue_invoices',
          '[{"invoice_id": "80000000-0000-0000-0000-00000000000a", "number": "F90001",
             "client_name": "Transports Dupont", "issued_at": "2026-03-15T09:00:00+00:00", "balance_due": 780.00}]'::jsonb,
          'Factures en retard : reste dû après paiement et avoir');
select is(jsonb_path_query_array(:'report'::jsonb, '$.deadlines[*] ? (@.plate == "AB-123-CD").kind'), '["ct"]'::jsonb,
          'Échéance véhicule dans les 30 jours');

-- ---------------------------------------------------------------- Réservé à la direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select public.monthly_report('2026-03-01') $$, '42501', null,
                 'La réception ne génère pas le rapport');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select throws_ok($$ select public.monthly_report('2026-03-01') $$, '42501', null,
                 'Un technicien non plus');

select * from finish();
rollback;
