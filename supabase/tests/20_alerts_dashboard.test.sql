-- =============================================================================
-- Alertes de l'utilisateur et tableau de bord du bureau
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Données
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins', '10000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Vidange', '10000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'Pneus', null);
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000001', 'done', 'labor', 'Plaquettes', 2),
  ('50000000-0000-0000-0000-000000000002', 'done', 'labor', 'Vidange', 1.5);
insert into public.ro_lines (repair_order_id, kind, line_type, description, quantity, order_status) values
  ('50000000-0000-0000-0000-000000000001', 'planned', 'part', 'Disques', 2, 'to_order');

-- Facture émise pour l'OR 3, échue et impayée
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000003'::uuid]) as invoice_id \gset
insert into public.invoice_lines (invoice_id, line_type, description, unit_price, quantity, position)
values (:'invoice_id', 'labor', 'Montage', 100, 1, 99);
select public.issue_invoice(:'invoice_id');

select id as quote_sent from public.create_quote('Transports Dupont') \gset
select id as quote_accepted from public.create_quote('Logistique Martin') \gset

insert into public.appointments (client_id, scheduled_date, start_time) values
  ('20000000-0000-0000-0000-000000000001', public.paris_date(now()), '10:00'),
  ('20000000-0000-0000-0000-000000000002', public.paris_date(now()) + 1, '08:00');

-- Ajustements hors règles métier (statuts et échéance), pour le test uniquement
reset role;
set local session_replication_role = replica;
update public.repair_orders set status = 'in_progress' where id = '50000000-0000-0000-0000-000000000002';
update public.quotes set status = 'sent' where id = :'quote_sent';
update public.quotes set status = 'accepted' where id = :'quote_accepted';
update public.invoices set due_date = current_date - 1 where id = :'invoice_id';
set local session_replication_role = origin;
insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on)
values ('10000000-0000-0000-0000-0000000000b1', 'paid_leave', '2026-12-01', '2026-12-02');

-- ---------------------------------------------------------------- Tableau de bord
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.office_dashboard() as dashboard \gset

select is((:'dashboard'::jsonb -> 'repair_orders'), '{"assigned": 1, "in_progress": 1}'::jsonb,
          'OR non facturés par statut (l''OR facturé n''est pas compté)');
select is((:'dashboard'::jsonb ->> 'parts_to_order')::int, 1, 'Pièces à commander');
select results_eq(
  format($$ select (%1$L::jsonb ->> 'quotes_awaiting_response')::int, (%1$L::jsonb ->> 'quotes_to_convert')::int $$, :'dashboard'),
  $$ values (1, 1) $$,
  'Devis en attente de réponse et devis acceptés à transformer en OR');
select is((:'dashboard'::jsonb -> 'overdue_invoices'), '{"count": 1, "balance_due": 120.00}'::jsonb,
          'Factures en retard et reste dû');
select results_eq(
  format($$ select (%1$L::jsonb ->> 'appointments_today')::int, (%1$L::jsonb ->> 'reminders_to_send')::int,
                   (%1$L::jsonb ->> 'leave_requests')::int $$, :'dashboard'),
  $$ values (1, 1, 1) $$,
  'Rendez-vous du jour, rappels à envoyer, congés à traiter');
select is((select jsonb_agg(w) from jsonb_array_elements(:'dashboard'::jsonb -> 'workload') w
           where w ->> 'technician_id' like '10000000-%'),
          '[{"technician_id": "10000000-0000-0000-0000-0000000000a1", "name": "Alice", "color": null, "sort_order": 0, "orders": 2, "hours": 3.5},
            {"technician_id": "10000000-0000-0000-0000-0000000000b1", "name": "Bruno", "color": null, "sort_order": 0, "orders": 0, "hours": 0}]'::jsonb,
          'Charge de travail : heures déclarées et OR en cours par technicien');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok($$ select public.office_dashboard() $$, '42501', null, 'Le tableau de bord est réservé au bureau');

-- ---------------------------------------------------------------- Alertes
reset role;
insert into public.notifications (id, recipient_role, type, title) values
  ('60000000-0000-0000-0000-000000000001', 'direction', 'test', 'Pour la direction'),
  ('60000000-0000-0000-0000-000000000002', 'reception', 'test', 'Pour la réception');
insert into public.notifications (id, recipient_profile_id, type, title) values
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', 'test', 'Personnelle');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select results_eq(
  $$ select title from public.v_my_notifications where type = 'test' order by title $$,
  $$ values ('Personnelle'), ('Pour la direction') $$,
  'Chacun ne voit que les alertes de son rôle ou les siennes');
insert into public.notification_reads (notification_id, profile_id)
values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1');
select results_eq(
  $$ select title, read_at is not null from public.v_my_notifications where type = 'test' order by title $$,
  $$ values ('Personnelle', false), ('Pour la direction', true) $$,
  'État « lu » propre à l''utilisateur');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((select read_at from public.v_my_notifications where title = 'Pour la réception'), null,
          'La lecture de la direction ne marque rien pour la réception');

select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.v_my_notifications $$, '42501', null, 'Un visiteur ne lit pas les alertes');

select * from finish();
rollback;
