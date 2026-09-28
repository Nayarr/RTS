-- =============================================================================
-- Pilotage : statistiques mensuelles et trésorerie (direction uniquement)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Données (hors règles métier)
select public.paris_date(now()) as today \gset
select date_trunc('month', public.paris_date(now()))::date as month_start \gset

set local session_replication_role = replica;
insert into public.invoices (id, number, status, client_id, client_name, issued_at, due_date, total_ht, total_vat, total_ttc) values
  -- A : ce mois, 1 000 € HT, échéance dans 10 jours
  ('80000000-0000-0000-0000-00000000000a', 'F1', 'issued', '20000000-0000-0000-0000-000000000001', 'Transports Dupont',
   now(), :'today'::date + 10, 1000, 200, 1200),
  -- B : il y a deux mois, en retard de 20 jours
  ('80000000-0000-0000-0000-00000000000b', 'F2', 'issued', '20000000-0000-0000-0000-000000000001', 'Transports Dupont',
   ((:'month_start'::date - interval '2 months' + interval '10 days 12 hours')::timestamp at time zone 'Europe/Paris'),
   :'today'::date - 20, 500, 100, 600),
  -- C : le mois dernier, payée 5 jours après l'échéance
  ('80000000-0000-0000-0000-00000000000c', 'F3', 'issued', '20000000-0000-0000-0000-000000000002', 'Logistique Martin',
   ((:'month_start'::date - interval '1 month' + interval '10 days 12 hours')::timestamp at time zone 'Europe/Paris'),
   :'today'::date - 40, 300, 60, 360);
insert into public.invoice_lines (invoice_id, line_type, description, unit_price, quantity, purchase_price) values
  ('80000000-0000-0000-0000-00000000000a', 'labor', 'Main d''œuvre', 600, 1, null),
  ('80000000-0000-0000-0000-00000000000a', 'part', 'Disques', 200, 2, 125),
  ('80000000-0000-0000-0000-00000000000a', 'text', 'OR00001', null, 1, null),
  ('80000000-0000-0000-0000-00000000000b', 'labor', 'Vidange', 500, 1, null),
  ('80000000-0000-0000-0000-00000000000c', 'package', 'Forfait', 300, 1, null);
insert into public.payments (invoice_id, amount_ttc, method, paid_on) values
  ('80000000-0000-0000-0000-00000000000a', 200, 'bank_transfer', :'today'),
  ('80000000-0000-0000-0000-00000000000c', 360, 'bank_transfer', :'today'::date - 35);
insert into public.credit_notes (number, invoice_id, amount_ht) values ('AV1', '80000000-0000-0000-0000-00000000000a', 100);
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Statistiques
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction

select is((select count(*) from public.monthly_statistics()), 12::bigint, '12 mois, y compris les mois sans facture');
select results_eq(
  $$ select invoice_count, labor_ht, parts_ht, parts_margin_ht, credit_notes_ht, total_ht
     from public.monthly_statistics() order by month desc limit 1 $$,
  $$ values (1::bigint, 600::numeric, 400::numeric, 150::numeric, 100::numeric, 900::numeric) $$,
  'Mois en cours : MO, pièces, marge pièces, avoir déduit');
select results_eq(
  $$ select invoice_count, labor_ht, total_ht from public.monthly_statistics() order by month desc offset 1 limit 2 $$,
  $$ values (1::bigint, 300::numeric, 300::numeric), (1::bigint, 500::numeric, 500::numeric) $$,
  'Mois précédents : forfait compté en main d''œuvre');

-- ---------------------------------------------------------------- Trésorerie
select public.treasury_overview() as treso \gset
select is((:'treso'::jsonb ->> 'collected_this_month')::numeric, 200::numeric, 'Encaissé ce mois');
select is((:'treso'::jsonb ->> 'due_within_30_days')::numeric, 880::numeric,
          'À encaisser sous 30 jours : reste dû après paiement et avoir');
select is((:'treso'::jsonb ->> 'overdue')::numeric, 600::numeric, 'En retard');
select is(jsonb_path_query_array(:'treso'::jsonb, '$.weeks[*].amount'), '[0, 880, 0, 0, 0, 0, 0, 0]'::jsonb,
          'Encaissements attendus sur 8 semaines');
select is(:'treso'::jsonb -> 'overdue_by_client',
          '[{"client_id": "20000000-0000-0000-0000-000000000001", "client_name": "Transports Dupont",
             "invoice_count": 1, "amount": 600.00, "max_days_late": 20}]'::jsonb,
          'Impayés en retard par client');
select is(:'treso'::jsonb -> 'payment_habits',
          '[{"client_id": "20000000-0000-0000-0000-000000000002", "client_name": "Logistique Martin",
             "invoice_count": 1, "average_delay_days": 5}]'::jsonb,
          'Habitudes de paiement : délai moyen après l''échéance');

-- ---------------------------------------------------------------- Réservé à la direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select * from public.monthly_statistics() $$, '42501', null,
                 'La réception ne voit pas les statistiques');
select throws_ok($$ select public.treasury_overview() $$, '42501', null, 'La réception ne voit pas la trésorerie');

select * from finish();
rollback;
