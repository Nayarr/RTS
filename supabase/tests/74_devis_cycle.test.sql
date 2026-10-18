-- =============================================================================
-- Cycle des OR : devis accepté, travaux terminés, OR créé à l'arrivée d'un rendez-vous
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000071', '30000000-0000-0000-0000-000000000001', 'Freins', null, 'assigned');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000071', 'planned', 'labor', 'Remplacement plaquettes', 1);
reset role;
set local session_replication_role = replica;
update public.repair_orders set status = 'quote_pending' where id = '50000000-0000-0000-0000-000000000071';
set local session_replication_role = origin;

-- Devis de l'OR accepté : l'OR d'origine passe « Facture à faire »
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000000071') as quote \gset
select public.set_quote_response(:'quote', 'accepted');
select is((select status from public.repair_orders where id = '50000000-0000-0000-0000-000000000071'),
          'to_invoice'::public.repair_order_status, 'Devis accepté : OR d''origine en « Facture à faire »');

-- Statut choisi à la main par le bureau : gardé
update public.repair_orders set status = 'work_done' where id = '50000000-0000-0000-0000-000000000071';
select is((select status from public.repair_orders where id = '50000000-0000-0000-0000-000000000071'),
          'work_done'::public.repair_order_status, 'Statut choisi à la main : pas changé');

-- Rendez-vous arrivé : OR avec tous les contrôles obligatoires si demandé
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction (seule à l'exiger)
insert into public.appointments (id, client_id, vehicle_id, scheduled_date, start_time, reason)
values ('80000000-0000-0000-0000-000000000071', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002', current_date, '10:00', 'Révision');
select public.create_repair_order_from_appointment('80000000-0000-0000-0000-000000000071', true) as ro \gset
select is((select inspection_required from public.repair_orders where id = :'ro'), true,
          'OR du rendez-vous : tous les contrôles obligatoires');
select is((select requested_work from public.repair_orders where id = :'ro'), 'Révision', 'Motif repris');

insert into public.appointments (id, client_id, vehicle_id, scheduled_date, start_time, reason)
values ('80000000-0000-0000-0000-000000000072', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002', current_date, '14:00', 'Vidange');
select public.create_repair_order_from_appointment('80000000-0000-0000-0000-000000000072') as ro2 \gset
select is((select inspection_required from public.repair_orders where id = :'ro2'), false,
          'Sans le choix : fiche libre comme avant');

select throws_ok($$ select public.create_repair_order_from_appointment('80000000-0000-0000-0000-000000000072') $$,
                 'P0001', null, 'Rendez-vous déjà transformé en OR');

-- ---------------------------------------------------------------- Dupliquer
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.duplicate_quote(:'quote') as quote_copy \gset
select results_eq(
  format($$ select status::text, repair_order_id, number from public.quotes where id = %L $$, :'quote_copy'),
  $$ values ('in_progress'::text, '50000000-0000-0000-0000-000000000071'::uuid, null::text) $$,
  'Devis dupliqué : brouillon rattaché au même OR, numéro donné à l''envoi');
select is((select count(*) from public.quote_lines where quote_id = :'quote_copy'),
          (select count(*) from public.quote_lines where quote_id = :'quote'), 'Mêmes lignes');

select public.duplicate_repair_order('50000000-0000-0000-0000-000000000071') as ro_copy \gset
select results_eq(
  format($$ select requested_work, technician_id, status::text from public.repair_orders where id = %L $$, :'ro_copy'),
  $$ values ('Freins'::text, null::uuid, 'assigned'::text) $$,
  'OR dupliqué : mêmes tâches, non assigné');

select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000071'::uuid]) as invoice \gset
insert into public.invoice_lines (invoice_id, line_type, description, unit_price, quantity, position)
values (:'invoice', 'labor', 'Montage', 100, 1, 99);
select public.duplicate_invoice(:'invoice') as invoice_copy \gset
select is((select array_agg(repair_order_id) from public.invoice_repair_orders where invoice_id = :'invoice_copy'),
          array['50000000-0000-0000-0000-000000000071'::uuid], 'Facture dupliquée : rattachée au même OR');
select is((select count(*) from public.invoice_lines where invoice_id = :'invoice_copy'),
          (select count(*) from public.invoice_lines where invoice_id = :'invoice'), 'Mêmes lignes, en brouillon');

select public.issue_invoice(:'invoice');
select throws_like(format($$ select public.duplicate_invoice(%L) $$, :'invoice'),
                   '%déjà facturé%avoir%', 'OR déjà facturé : un avoir d''abord');

select * from finish();
rollback;
