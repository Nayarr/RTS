-- =============================================================================
-- Rôle Comptable : devis et factures en écriture, stats financières et RH en lecture, badgeage
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

\ir helpers/fixtures.psql

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'comptable@test.fr');
insert into public.profiles (id, email, full_name, role)
values ('00000000-0000-0000-0000-0000000000f1', 'comptable@test.fr', 'Comptable', 'accountant');

-- Badgeage : la fiche technicien est forcée hors planning
insert into public.technicians (id, profile_id, display_name, exclude_from_planning)
values ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1', 'Compta', false);
select ok((select exclude_from_planning from public.technicians where id = '10000000-0000-0000-0000-0000000000f1'),
          'Fiche du comptable hors planning à la création');
update public.technicians set exclude_from_planning = false where id = '10000000-0000-0000-0000-0000000000f1';
select ok((select exclude_from_planning from public.technicians where id = '10000000-0000-0000-0000-0000000000f1'),
          'Fiche du comptable : impossible de la remettre au planning');

-- Compte passé au rôle comptable : sa fiche sort du planning
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'ex.tech@test.fr');
insert into public.profiles (id, email, full_name, role)
values ('00000000-0000-0000-0000-0000000000f2', 'ex.tech@test.fr', 'Ex', 'technician');
insert into public.technicians (id, profile_id, display_name)
values ('10000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f2', 'Ex');
update public.profiles set role = 'accountant' where id = '00000000-0000-0000-0000-0000000000f2';
select ok((select exclude_from_planning from public.technicians where id = '10000000-0000-0000-0000-0000000000f2'),
          'Compte devenu comptable : fiche sortie du planning');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'sans.fiche@test.fr');
select throws_ok(
  $$ select public.admin_register_account('00000000-0000-0000-0000-0000000000f3', 'sans.fiche@test.fr', 'Sans fiche', 'accountant') $$,
  '22023', 'Un compte comptable doit avoir une fiche technicien pour badger', 'Compte comptable sans fiche refusé');

-- Un OR prêt à facturer et un congé, créés par le bureau
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.repair_orders (id, vehicle_id, requested_work, status)
values ('50000000-0000-0000-0000-000000000124', '30000000-0000-0000-0000-000000000001', 'Freinage', 'assigned');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000124', 'done', 'labor', 'Contrôle freinage', 2);
insert into public.leave_requests (id, technician_id, leave_type, starts_on, ends_on, status)
values ('60000000-0000-0000-0000-000000000124', '10000000-0000-0000-0000-0000000000a1', 'paid_leave',
        '2026-12-01', '2026-12-02', 'requested');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');  -- comptable

-- Devis : création, lignes, envoi
select (public.create_quote('AB-123-CD', 'Transports Dupont', 'pl')).id as quote \gset
select is((select count(*) from public.quotes where id = :'quote'), 1::bigint, 'Le comptable crée un devis');
select lives_ok(
  format($$ insert into public.quote_lines (quote_id, section, line_type, description, unit_price, quantity)
            values (%L, 'planned', 'part', 'Plaquettes', 80, 1) $$, :'quote'),
  'Il ajoute une ligne');
select lives_ok(format($$ select public.assign_quote_number(%L, true) $$, :'quote'), 'Il marque le devis envoyé');
select is((select status::text from public.quotes where id = :'quote'), 'sent', 'Devis envoyé');

-- Facture : brouillon depuis l'OR, émission, paiement, avoir
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000124'::uuid]) as invoice \gset
select isnt(:'invoice'::uuid, null::uuid, 'Il prépare la facture de l''OR');
select lives_ok(format($$ update public.invoice_lines set description = 'Contrôle complet' where invoice_id = %L $$, :'invoice'),
                'Il modifie le brouillon');
select lives_ok(format($$ select public.issue_invoice(%L) $$, :'invoice'), 'Il émet la facture');
select is((select status::text from public.repair_orders where id = '50000000-0000-0000-0000-000000000124'), 'invoiced',
          'L''OR passe Facturé');

-- Paiements, avoirs et relances : lecture seule
select throws_ok(
  format($$ insert into public.payments (invoice_id, amount_ttc, method) values (%L, 10, 'card') $$, :'invoice'),
  '42501', null, 'Il n''enregistre pas de paiement');
select throws_ok(
  format($$ insert into public.credit_notes (invoice_id, number, amount_ht, vat_rate, reason)
            values (%L, '', 10, 20, 'Essai') $$, :'invoice'),
  '42501', null, 'Il ne génère pas d''avoir');
select throws_ok(format($$ select public.record_invoice_reminder(%L) $$, :'invoice'),
                 '42501', null, 'Il n''enregistre pas de relance');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- la réception saisit
insert into public.payments (invoice_id, amount_ttc, method) values (:'invoice', 10, 'card');
select public.record_invoice_reminder(:'invoice');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');

select is((select count(*) from public.payments where invoice_id = :'invoice'), 1::bigint, 'Il lit le paiement');
select is((select count(*) from public.payment_events where invoice_id = :'invoice'), 1::bigint, 'Il lit l''historique');
select is((select count(*) from public.invoice_reminders where invoice_id = :'invoice'), 1::bigint, 'Il lit la relance');
with u as (update public.payments set note = 'Essai' returning 1)
select is(count(*), 0::bigint, 'Aucun paiement modifié') from u;

select lives_ok(format($$ select public.set_invoice_due_date(%L, '2027-01-31') $$, :'invoice'),
                'Il change l''échéance');
select throws_ok(
  $$ select public.delete_payment((select id from public.payments limit 1), 'Essai') $$,
  'P0001', null, 'La suppression d''un paiement reste à la direction');

-- Client : création et coordonnées de facturation, sans les tarifs
select lives_ok($$ insert into public.clients (name) values ('Nouveau client comptable') $$, 'Il crée un client');
select lives_ok(
  $$ update public.clients set billing_address = '2 rue du Test' where id = '20000000-0000-0000-0000-000000000002' $$,
  'Il complète une adresse de facturation');

-- Stats financières : lecture
select lives_ok($$ select public.monthly_statistics(12) $$, 'Statistiques lues');
select lives_ok($$ select public.treasury_overview() $$, 'Trésorerie lue');
select lives_ok($$ select public.profitability_report('2026-01-01', '2026-12-31') $$, 'Rentabilité lue');
select throws_ok($$ select public.technician_performance('2026-01-01', '2026-12-31') $$,
                 '42501', null, 'Performance des techniciens réservée à la direction');
select throws_ok($$ select public.office_dashboard() $$, '42501', null, 'Pas de tableau de bord du bureau');

-- RH : lecture seule
select is((select count(*) from public.leave_requests where id = '60000000-0000-0000-0000-000000000124'), 1::bigint,
          'Il lit les congés');
select throws_ok($$ select public.decide_leave_request('60000000-0000-0000-0000-000000000124', true) $$,
                 '42501', null, 'Il ne décide pas des congés');
select throws_ok(
  $$ select public.add_manual_clock_event(p_technician_id => '10000000-0000-0000-0000-0000000000a1', p_work_date => '2026-11-02', p_event_type => 'in', p_time => '08:00', p_reason => 'Oubli') $$,
  '42501', null, 'Il ne corrige pas les pointages');
with u as (update public.clock_events set reason = 'Essai' returning 1)
select is(count(*), 0::bigint, 'Aucun pointage modifié') from u;
select lives_ok($$ select public.technician_pin_status() $$, 'Il voit quels salariés ont un code PIN');
select throws_ok($$ select public.set_technician_pin('10000000-0000-0000-0000-0000000000a1', '4242') $$,
                 '42501', null, 'Il ne change pas les codes PIN');

-- Atelier : lecture seule
select is((select count(*) from public.repair_orders where id = '50000000-0000-0000-0000-000000000124'), 1::bigint,
          'Il lit l''OR facturé');
with u as (update public.repair_orders set requested_work = 'Essai' returning 1)
select is(count(*), 0::bigint, 'Aucun OR modifié') from u;
select throws_ok(
  $$ select public.create_repair_order('AB-123-CD', 'pl', '', 'Essai') $$,
  '42501', null, 'Il ne crée pas d''OR');
select throws_ok(
  $$ insert into public.suppliers (name) values ('Essai') $$,
  '42501', null, 'Il ne modifie pas les fournisseurs');
with u as (update public.company_settings set legal_name = 'Essai' returning 1)
select is(count(*), 0::bigint, 'Il ne modifie pas les réglages') from u;

-- Un technicien reste à l'écart des nouveaux droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(public.can_bill(), false, 'Technicien : pas de droit de facturation');
select throws_ok($$ select public.monthly_statistics(12) $$, '42501', null, 'Technicien : pas de statistiques');

select * from finish();
rollback;
