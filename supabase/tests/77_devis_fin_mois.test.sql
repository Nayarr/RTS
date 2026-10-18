-- =============================================================================
-- Devis envoyés sans réponse : alerte et OR en « Facture à faire » le dernier jour travaillé
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Dernier jour travaillé
select is(public.last_working_day_of_month('2026-10-12'), '2026-10-31'::date, 'Octobre 2026 : samedi 31, samedi compris');
select is(public.last_working_day_of_month('2026-05-04'), '2026-05-30'::date, 'Mai 2026 : le 31 est un dimanche, samedi 30');
select is(public.last_working_day_of_month('2027-02-10'), '2027-02-27'::date, 'Février 2027 : le 28 est un dimanche, samedi 27');

-- OR de diagnostic en attente de devis, devis envoyé sans réponse ; un autre devis accepté
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000077', '30000000-0000-0000-0000-000000000001', 'Diagnostic', null, 'assigned');
set local session_replication_role = replica;
update public.repair_orders set status = 'quote_pending' where id = '50000000-0000-0000-0000-000000000077';
insert into public.quotes (id, number, client_id, vehicle_id, repair_order_id, status, sent_at) values
  ('60000000-0000-0000-0000-000000000771', 'DV07701', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000077', 'sent', '2026-10-05'),
  ('60000000-0000-0000-0000-000000000772', 'DV07702', '20000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000003', null, 'accepted', '2026-10-06');
set local session_replication_role = origin;
insert into public.quote_lines (quote_id, position, line_type, description, quantity, unit_price)
values ('60000000-0000-0000-0000-000000000771', 0, 'labor', 'Freins', 1, 100);

-- ---------------------------------------------------------------- Pas encore le moment
select is(public.month_end_unsigned_quotes('2026-10-30 10:00+02'), 0, 'Avant le dernier jour travaillé : rien');
select is(public.month_end_unsigned_quotes('2026-10-31 07:30+01'), 0, 'Dernier jour, avant 8 h : rien');
select is((select status from public.repair_orders where id = '50000000-0000-0000-0000-000000000077'),
          'quote_pending'::public.repair_order_status, 'OR toujours en attente du devis');

-- ---------------------------------------------------------------- Dernier jour travaillé, 8 h
select is(public.month_end_unsigned_quotes('2026-10-31 08:05+01'), 1, 'Un devis envoyé sans réponse');
select results_eq(
  $$ select recipient_role::text, title, link from public.notifications where type = 'quotes_unsigned' order by 1 $$,
  $$ values ('direction', '1 devis envoyé sans réponse en fin de mois', '/devis?filtre=sent'),
            ('reception', '1 devis envoyé sans réponse en fin de mois', '/devis?filtre=sent') $$,
  'Réception et direction prévenues, lien vers les devis en attente');
select ok((select body like 'DV07701 · Transports Dupont · AB-123-CD · 120,00 € TTC%'
           from public.notifications where type = 'quotes_unsigned' and recipient_role = 'direction'),
          'Le devis est listé : numéro, client, véhicule, montant');
select results_eq(
  $$ select r.status::text, q.status::text from public.repair_orders r
     join public.quotes q on q.repair_order_id = r.id where r.id = '50000000-0000-0000-0000-000000000077' $$,
  $$ values ('to_invoice', 'sent') $$,
  'OR d''origine en « Facture à faire », le devis reste signable');
select is(public.month_end_unsigned_quotes('2026-10-31 09:05+01'), 0, 'Une seule fois par mois');

select * from finish();
rollback;
