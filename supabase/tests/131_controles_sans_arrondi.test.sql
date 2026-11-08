-- =============================================================================
-- Étiquettes (angles morts, contrôle hayon) et extincteurs : temps saisi facturé, sans arrondi ;
-- le reste de la main d'œuvre à l'heure entamée
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000001311', 'OR91311', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Contrôle', 'work_done');
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, unit_price,
                             quantity) values
  ('50000000-0000-0000-0000-000000001311', 'done', 0, 'labor', 'Remplacement Étiquettes angles morts', 0.5, 90, 1),
  ('50000000-0000-0000-0000-000000001311', 'done', 1, 'labor', 'Remplacement Étiquette contrôle hayon', 0.5, 90, 1),
  ('50000000-0000-0000-0000-000000001311', 'done', 2, 'labor', 'Remplacement Extincteur 6 kg camion', 0.5, 90, 1),
  ('50000000-0000-0000-0000-000000001311', 'done', 3, 'labor', 'Réparation hayon', 0.5, 90, 1),
  ('50000000-0000-0000-0000-000000001311', 'done', 4, 'labor', 'Réglage des feux', 0.5, 90, 1);
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000001311') as quote \gset
select results_eq(
  format($$ select description, quantity from public.quote_lines where quote_id = %L order by position $$, :'quote'),
  $$ values ('Remplacement Étiquettes angles morts'::text, 0.50::numeric),
            ('Remplacement Étiquette contrôle hayon', 0.50), ('Remplacement Extincteur 6 kg camion', 0.50),
            ('Réparation hayon', 1.00), ('Réglage des feux', 1.00) $$,
  'Devis : étiquettes et extincteur à 0,5 h, le reste à l''heure entamée');

select public.build_invoice_draft(array['50000000-0000-0000-0000-000000001311'::uuid]) as invoice \gset
select results_eq(
  format($$ select description, quantity, net_ht from public.invoice_lines
            where invoice_id = %L and line_type = 'labor' order by position $$, :'invoice'),
  $$ values ('Remplacement Étiquettes angles morts'::text, 0.50::numeric, 45.00::numeric),
            ('Remplacement Étiquette contrôle hayon', 0.50, 45.00), ('Remplacement Extincteur 6 kg camion', 0.50, 45.00),
            ('Réparation hayon', 1.00, 90.00), ('Réglage des feux', 1.00, 90.00) $$,
  'Facture : étiquettes et extincteur à 0,5 h, le reste à l''heure entamée');

-- Saisie du bureau sur le devis
insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity) values
  (:'quote', 'planned', 20, 'labor', 'Extincteur 2 kg cabine', 90, 0.5),
  (:'quote', 'planned', 21, 'labor', 'Graissage', 90, 0.5);
select results_eq(
  format($$ select description, quantity from public.quote_lines where quote_id = %L and position >= 20
            order by position $$, :'quote'),
  $$ values ('Extincteur 2 kg cabine'::text, 0.50::numeric), ('Graissage', 1.00) $$,
  'Ligne tapée au devis : extincteur gardé à 0,5 h, graissage arrondi à 1 h');
update public.quote_lines set quantity = 0.5 where quote_id = :'quote' and description = 'Graissage';
select is((select quantity from public.quote_lines where quote_id = :'quote' and description = 'Graissage'), 1.00,
          'Quantité modifiée : toujours l''heure entamée hors étiquettes et extincteurs');

select * from finish();
rollback;
