-- =============================================================================
-- CA de la main d'œuvre par catégorie (statistiques de la direction)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

-- Point de départ : CA déjà en base (rejouable sur une base qui a des factures)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
create temp table before as select category, amount_ht, hours from public.labor_revenue_by_category();
reset role;
grant select on before to authenticated;

set local session_replication_role = replica;
insert into public.invoices (id, number, client_id, status, issued_at, due_date, total_ht, total_vat, total_ttc, client_name) values
  ('70000000-0000-0000-0000-000000001391', 'F91391', '20000000-0000-0000-0000-000000000001', 'issued', now(),
   current_date, 0, 0, 0, 'Client'),
  ('70000000-0000-0000-0000-000000001392', null, '20000000-0000-0000-0000-000000000001', 'draft', null,
   null, null, null, null, null),
  ('70000000-0000-0000-0000-000000001393', 'F91393', '20000000-0000-0000-0000-000000000001', 'issued',
   now() - interval '2 years', current_date, 0, 0, 0, 'Client');
insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, discount_percent, vat_rate, labor_category, billed_hours) values
  -- facture émise : PL 6 h à 90 €, soudure 2 h à 70 € remisée 10 %, ligne sans catégorie (PL) 1 h, une pièce
  ('70000000-0000-0000-0000-000000001391', 1, 'labor', 'Turbo', 90, 6, 0, 20, 'pl', 6),
  ('70000000-0000-0000-0000-000000001391', 2, 'labor', 'Soudure châssis', 70, 2, 10, 20, 'remorque', 2),
  ('70000000-0000-0000-0000-000000001391', 3, 'labor', 'Contrôle', 90, 1, 0, 20, null, 1),
  ('70000000-0000-0000-0000-000000001391', 4, 'part', 'Disque', 100, 2, 0, 20, null, null),
  -- brouillon et facture trop ancienne : pas comptés
  ('70000000-0000-0000-0000-000000001392', 1, 'labor', 'Brouillon', 90, 5, 0, 20, 'pl', 5),
  ('70000000-0000-0000-0000-000000001393', 1, 'labor', 'Ancienne', 90, 5, 0, 20, 'pl', 5);
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
create temp view delta as
  select r.category::text, r.label, r.amount_ht - coalesce(b.amount_ht, 0) as amount, r.hours - coalesce(b.hours, 0) as hours
  from public.labor_revenue_by_category() r left join before b on b.category = r.category;

select is((select count(*)::int from public.labor_revenue_by_category()), 4, 'Les quatre catégories de base, même à 0 €');
select is((select amount from delta where category = 'pl'), 630.00::numeric,
          'PL : 6 h × 90 € + la ligne sans catégorie (1 h × 90 €)');
select is((select hours from delta where category = 'pl'), 7.00::numeric, 'PL : 7 h facturées');
select is((select amount from delta where category = 'remorque'), 126.00::numeric, 'Soudure : 2 h × 70 € − 10 %');
select is((select amount from delta where category = 'vul'), 0.00::numeric, 'Brouillon, ancienne facture et pièces : pas comptés');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok('select * from public.labor_revenue_by_category()', '42501', null, 'Réservé à la direction et au comptable');

select * from finish();
rollback;
