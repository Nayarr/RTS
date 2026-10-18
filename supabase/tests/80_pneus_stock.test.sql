-- =============================================================================
-- Stock des pneus : par taille et profil, lots, seuil et alerte, réservations, sortie à la facture
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

\ir helpers/fixtures.psql

-- Stock vide (le jeu de démo local a des pneus)
delete from public.tire_movements;
delete from public.tires;
delete from public.tire_lines;
delete from public.tire_brands;

-- ---------------------------------------------------------------- Tailles
select is(public.tire_size_label('31580225'), '315/80 R22.5', 'Taille tapée en chiffres');
select is(public.tire_size_label('315/80/22.5'), '315/80 R22.5', 'Taille de la fiche de contrôle');
select is(public.tire_size_label('235/65 r16c'), '235/65 R16C', 'Utilitaire : C gardé');
select is(public.tire_size_label('3158'), null, 'Taille incomplète refusée');

-- ---------------------------------------------------------------- Entrée en stock (réception)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

select throws_like($$ select public.add_tires('pl', '31580225', 'toutes', 'Michelin', 'X Multi Z', 'neuf', 8, 312, 415) $$,
                   '%Profil invalide%', 'Poids lourd : avant, arrière ou remorque');

create temp table t_ids (key text primary key, id uuid);
grant all on t_ids to authenticated;
insert into t_ids select 'michelin', public.add_tires('pl', '31580225', 'avant', 'Michelin', 'X Multi Z', 'neuf', 8, 312, 415,
  '40000000-0000-0000-0000-000000000001', '156/150 L', 'Rack A1', '24/2026', 6, 'BL-44711');

select results_eq(
  $$ select l.size, l.profile::text, l.min_qty, t.stock_qty, t.purchase_price, t.sale_price
     from public.tires t join public.tire_lines l on l.id = t.line_id where t.id = (select id from t_ids where key = 'michelin') $$,
  $$ values ('315/80 R22.5', 'avant', 6, 8, 312.00::numeric, 415.00::numeric) $$,
  'Ligne 315/80 R22.5 avant créée, seuil 6, 8 pneus en stock');
select results_eq(
  $$ select p.designation, p.brand, p.is_tire, p.margin_value from public.parts p
     join public.tires t on t.part_id = p.id where t.id = (select id from t_ids where key = 'michelin') $$,
  $$ values ('Pneu Michelin X Multi Z 315/80 R22.5', 'Michelin', true, 33.01::numeric) $$,
  'Pièce du lot pour les devis et factures, marge sur l''achat');
select results_eq(
  $$ select quantity, reason::text, reference, unit_purchase_price from public.tire_movements $$,
  $$ values (8, 'entry', 'BL-44711', 312.00::numeric) $$,
  'Entrée tracée avec le bon de livraison');

-- Même marque, modèle et état : le lot est repris
select is(public.add_tires('pl', '315/80/22.5', 'avant', 'MICHELIN', 'x multi z', 'neuf', 4, 320, 420),
          (select id from t_ids where key = 'michelin'), 'Même pneu : même lot');
select results_eq(
  $$ select stock_qty, purchase_price, sale_price from public.tires where id = (select id from t_ids where key = 'michelin') $$,
  $$ values (12, 320.00::numeric, 420.00::numeric) $$, 'Quantité ajoutée, prix mis à jour');

-- Autre marque, même taille et profil : même ligne de stock
insert into t_ids select 'hankook', public.add_tires('pl', '31580225', 'avant', 'Hankook', 'AH31', 'neuf', 4, 230, 292);
select results_eq(
  $$ select stock_qty, lots_count, brands, avg_purchase_price, status from public.v_tire_lines $$,
  $$ values (16, 2, 'Michelin 12 · Hankook 4', 297.50::numeric, 'ok') $$,
  'Stock compté par taille et profil, quelle que soit la marque');
select is((select count(*)::integer from public.tire_lines), 1, 'Une seule ligne');

-- ---------------------------------------------------------------- Correction
select throws_like($$ select public.correct_tire_stock((select id from t_ids where key = 'hankook'), 3, '') $$,
                   '%motif%', 'Correction : motif obligatoire');
select is(public.correct_tire_stock((select id from t_ids where key = 'hankook'), 1, 'Pneus abîmés au stockage'), 1,
          'Stock compté enregistré');
select is((select quantity from public.tire_movements where reason = 'correction'), -3, 'Écart gardé dans les mouvements');

-- ---------------------------------------------------------------- Seuil : alerte
update public.tire_lines set min_qty = 15;
select results_eq(
  $$ select status, missing_qty from public.v_tire_lines $$, $$ values ('to_order', 2) $$,
  'Sous le seuil : à commander, 2 manquants');

-- ---------------------------------------------------------------- Réservé au devis, sorti à la facture
reset role;
select results_eq(
  $$ select recipient_role::text, title, link from public.notifications where link like '/stock/pneumatiques%' order by 1 $$,
  $$ values ('direction', 'Pneus à commander : 315/80 R22.5 avant', '/stock/pneumatiques?filtre=seuil'),
            ('reception', 'Pneus à commander : 315/80 R22.5 avant', '/stock/pneumatiques?filtre=seuil') $$,
  'Direction et réception prévenues');
insert into public.quotes (id, number, client_id, vehicle_id, status) values
  ('60000000-0000-0000-0000-000000000801', 'DV08001', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'sent');
insert into public.quote_lines (quote_id, line_type, description, quantity, unit_price, part_id)
select '60000000-0000-0000-0000-000000000801', 'part', 'Pneu Michelin X Multi Z 315/80 R22.5', 2, 420, part_id
from public.tires where id = (select id from t_ids where key = 'michelin');
select results_eq(
  $$ select stock_qty, reserved_qty, available_qty from public.v_tire_lots where id = (select id from t_ids where key = 'michelin') $$,
  $$ values (12, 2, 10) $$, 'Pneus du devis réservés');
select results_eq($$ select status from public.v_tire_lines $$, $$ values ('to_order'::text) $$,
                  'Le disponible compte les pneus réservés');

update public.quotes set status = 'refused' where id = '60000000-0000-0000-0000-000000000801';
insert into public.invoices (id, client_id) values ('60000000-0000-0000-0000-000000000802', '20000000-0000-0000-0000-000000000001');
insert into public.invoice_lines (invoice_id, line_type, description, quantity, unit_price, purchase_price, part_id)
select '60000000-0000-0000-0000-000000000802', 'part', 'Pneu Michelin X Multi Z 315/80 R22.5', 2, 420, 320, part_id
from public.tires where id = (select id from t_ids where key = 'michelin');
select is((select reserved_qty from public.v_tire_lots where id = (select id from t_ids where key = 'michelin')), 2,
          'Devis refusé : plus réservé ; pneus sur la facture à émettre : réservés');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ select public.issue_invoice('60000000-0000-0000-0000-000000000802') $$, 'Facture émise');
select results_eq(
  $$ select stock_qty, reserved_qty from public.v_tire_lots where id = (select id from t_ids where key = 'michelin') $$,
  $$ values (10, 0) $$, 'Les pneus facturés sortent du stock');
select results_eq(
  $$ select (k->>'sold_30d')::int, (k->>'revenue_30d')::numeric, (k->>'margin_30d')::numeric, (k->>'margin_percent')::numeric
     from public.tire_stock_kpis() k $$,
  $$ values (2, 840.00::numeric, 200.00::numeric, 31.3::numeric) $$,
  'Ventes et marge des 30 derniers jours');

-- Arrivage qui laisse une nouvelle ligne sous son seuil : alerte aussi
select public.add_tires('vul', '2356516C', 'toutes', 'Continental', 'VanContact', 'neuf', 2, 108, 145, null, null, null, null, 4);
reset role;
select is((select count(*)::integer from public.notifications where title = 'Pneus à commander : 235/65 R16C'), 2,
          'Arrivage sous le seuil mini : direction et réception prévenues');

-- ---------------------------------------------------------------- Accès
select is((select count(*)::integer from public.v_part_stats where designation like 'Pneu %'), 0,
          'Les pneus ne sont pas dans la liste des pièces');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is_empty($$ select 1 from public.tires $$, 'Le technicien ne voit pas le stock des pneus');

select * from finish();
rollback;
