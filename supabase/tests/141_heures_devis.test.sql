-- =============================================================================
-- Devis accepté de 3 h, mécano qui finit en 2 h : la facture garde 3 h
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir helpers/fixtures.psql

set local session_replication_role = replica;
insert into public.quotes (id, number, status, client_id, vehicle_id, vehicle_type) values
  ('60000000-0000-0000-0000-000000000141', 'DV90141', 'accepted', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'pl');
-- Main d'œuvre saisie au devis : les heures sont la quantité (3 h)
insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity) values
  ('60000000-0000-0000-0000-000000000141', 'planned', 1, 'labor', 'Remplacement embrayage', 90, 3);
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.create_repair_order_from_quote('60000000-0000-0000-0000-000000000141',
                                             '10000000-0000-0000-0000-0000000000a1') as ro_id \gset
select is((select billed_hours from public.ro_lines where repair_order_id = :'ro_id' and kind = 'done'), 3.00,
          'L''OR reprend les 3 h acceptées par le client');

-- Le mécano termine en 2 h (temps réel)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.ro_lines set estimated_hours = 2 where repair_order_id = :'ro_id' and kind = 'done';
select is((select estimated_hours from public.ro_lines where repair_order_id = :'ro_id' and kind = 'done'), 2.00,
          'Temps réel du mécano gardé à part');
select is((select billed_hours from public.ro_lines where repair_order_id = :'ro_id' and kind = 'done'), 3.00,
          'Le temps facturé ne bouge pas');

reset role;
set local session_replication_role = replica;
update public.repair_orders set status = 'to_invoice', completed_at = now() where id = :'ro_id';
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.build_invoice_draft(array[:'ro_id']::uuid[]) as invoice_id \gset
select results_eq(
  format($$ select quantity, billed_hours, net_ht from public.invoice_lines
            where invoice_id = %L and line_type = 'labor' $$, :'invoice_id'),
  $$ values (3.00::numeric, 3.00::numeric, 270.00::numeric) $$,
  'Facture : 3 h de main d''œuvre, pas les 2 h du mécano');

-- Performance du technicien : 3 h facturées une fois la facture émise
select public.issue_invoice(:'invoice_id');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select billed_hours from public.technician_performance()
           where technician_id = '10000000-0000-0000-0000-0000000000a1'), 3.00::numeric,
          'Rentabilité du mécano : 3 h facturées');

select * from finish();
rollback;
