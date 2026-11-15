-- =============================================================================
-- SAV : OR de reprise gratuit pour le client, temps et pièces comptés contre le responsable
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir helpers/fixtures.psql

select public.paris_date(now()) as today \gset

-- OR d'origine fait par Alice, facturé
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000149', 'OR90149', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Embrayage', '10000000-0000-0000-0000-0000000000a1', 'invoiced');
set local session_replication_role = origin;

-- Le client revient : nouvel OR (même véhicule) fait par Bruno, marqué SAV
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select (public.create_repair_order('AB-123-CD', 'pl', 'Transports Dupont', 'Reprise embrayage',
        p_technician_id => '10000000-0000-0000-0000-0000000000b1')).id as sav_id \gset
select throws_ok(format($$ select public.mark_repair_order_sav(%L, %L) $$, :'sav_id', :'sav_id'),
  '22023', null, 'Pas de SAV de lui-même');
select lives_ok(format($$ select public.mark_repair_order_sav(%L, '50000000-0000-0000-0000-000000000149') $$, :'sav_id'),
  'OR marqué SAV de l''OR d''origine');
select results_eq(
  format($$ select sav_of_number, sav_responsible_name from public.v_repair_orders_overview where id = %L $$, :'sav_id'),
  $$ values ('OR90149'::text, 'Alice'::text) $$,
  'Responsable par défaut : le technicien de l''OR d''origine');

-- Autre véhicule : refusé
reset role;
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work) values
  ('50000000-0000-0000-0000-000000000150', 'OR90150', '30000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 'vul', 'Autre');
set local session_replication_role = origin;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.mark_repair_order_sav('50000000-0000-0000-0000-000000000150', '50000000-0000-0000-0000-000000000149') $$,
  '22023', null, 'Le SAV concerne le même véhicule');

-- Travaux du SAV : 2 h badgées par Bruno, une pièce achetée 50 € (vendue 80 €)
reset role;
insert into public.time_entries (repair_order_id, technician_id, started_at, ended_at) values
  (:'sav_id', '10000000-0000-0000-0000-0000000000b1', now() - interval '3 hours', now() - interval '1 hour');
insert into public.ro_lines (repair_order_id, kind, line_type, description, quantity, unit_price, purchase_price) values
  (:'sav_id', 'planned', 'part', 'Butée d''embrayage', 1, 80, 50);
update public.ro_lines set estimated_hours = 2 where repair_order_id = :'sav_id' and kind = 'done';
set local session_replication_role = replica;
update public.repair_orders set status = 'to_invoice', completed_at = now() where id = :'sav_id';
set local session_replication_role = origin;

-- Devis sur le SAV : gratuit aussi
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.quotes (id, repair_order_id, client_id, vehicle_id, vehicle_type) values
  ('60000000-0000-0000-0000-000000000149', :'sav_id', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'pl');
insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity) values
  ('60000000-0000-0000-0000-000000000149', 'planned', 1, 'labor', 'Main d''œuvre', 90, 2);
select is((select net_ht from public.quote_lines where quote_id = '60000000-0000-0000-0000-000000000149'
           and line_type = 'labor'), 0.00::numeric, 'Devis d''un SAV : rien de facturé');

-- Facture : tout à 0 €, mention du SAV, prix d'achat gardé
select public.build_invoice_draft(array[:'sav_id']::uuid[]) as invoice_id \gset
select is((select count(*)::int from public.invoice_lines where invoice_id = :'invoice_id'
           and line_type <> 'text' and discount_percent <> 100), 0,
          'Toutes les lignes (main d''œuvre, pièce, fournitures) à 100 % de remise');
select is((select coalesce(sum(net_ht), 0) from public.invoice_lines where invoice_id = :'invoice_id'), 0.00::numeric,
          'Facture à 0 €');
select ok(exists (select 1 from public.invoice_lines where invoice_id = :'invoice_id' and line_type = 'text'
                  and description = 'SAV de l''OR OR90149 : intervention prise en charge par l''atelier, non facturée.'),
          'Mention du SAV sur la facture');
update public.invoice_lines set discount_percent = 0 where invoice_id = :'invoice_id' and line_type = 'part';
select is((select discount_percent from public.invoice_lines where invoice_id = :'invoice_id' and line_type = 'part'),
          100.00::numeric, 'Une ligne de SAV ne repasse pas en payante');
select lives_ok(format($$ select public.issue_invoice(%L) $$, :'invoice_id'), 'Facture à 0 € émise');

-- Compta : la pièce coûte 50 € (marge négative)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select sum(parts_margin_ht) from public.v_invoice_line_economics where invoice_id = :'invoice_id'
           and line_type = 'part'), -50.00::numeric, 'Pièce du SAV : -50 € dans les statistiques');

-- Performance : 2 h et la pièce contre Alice, rien pour Bruno
select results_eq(
  format($$ select name, sav_count, sav_hours, sav_cost_ht, worked_hours, labor_ht from public.technician_performance(%L, %L)
            where technician_id in ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b1')
            order by name $$, :'today'::date - 1, :'today'::date + 1),
  $$ values ('Alice'::text, 1::bigint, 2.00::numeric, 230.00::numeric, 0.00::numeric, 0::numeric),
            ('Bruno', 0, 0.00, 0.00, 0.00, 0) $$,
  'Alice : 1 SAV, 2 h × 90 € + 50 € de pièce ; Bruno : son temps sur le SAV ne le pénalise pas');

-- OR facturé : la réception ne change plus rien, la direction change encore le responsable
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok(format($$ select public.mark_repair_order_sav(%L, '50000000-0000-0000-0000-000000000149',
                          '10000000-0000-0000-0000-0000000000b1') $$, :'sav_id'),
  '42501', null, 'SAV facturé : responsable figé pour l''accueil');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.mark_repair_order_sav(:'sav_id', '50000000-0000-0000-0000-000000000149', '10000000-0000-0000-0000-0000000000b1');
select is((select sav_hours from public.technician_performance(:'today'::date - 1, :'today'::date + 1)
           where technician_id = '10000000-0000-0000-0000-0000000000b1'), 2.00::numeric,
          'Responsable changé : le SAV compte pour lui');

select * from finish();
rollback;
