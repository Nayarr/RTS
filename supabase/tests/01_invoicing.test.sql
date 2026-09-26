-- =============================================================================
-- Facturation : numérotation sans trou, brouillon, émission figée, avoirs, paiements
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

\ir helpers/fixtures.psql

-- Un OR facturable : 2 h de main d'œuvre effectuée + une pièce à 100 €
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');

insert into public.repair_orders (id, vehicle_id, requested_work, technician_id)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freinage', '10000000-0000-0000-0000-0000000000a1');

select is((select number from public.repair_orders where id = '50000000-0000-0000-0000-000000000001'),
          'OR00001', 'Le numéro d''OR est attribué par la base');
select is((select client_id from public.repair_orders where id = '50000000-0000-0000-0000-000000000001'),
          '20000000-0000-0000-0000-000000000001'::uuid, 'Le client est repris du véhicule');

insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000001', 'done', 'labor', 'Contrôle freinage', 2);
insert into public.ro_lines (repair_order_id, kind, line_type, description, unit_price, purchase_price, order_status) values
  ('50000000-0000-0000-0000-000000000001', 'planned', 'part', 'Plaquettes avant', 100, 60, 'received');

-- Brouillon
select lives_ok($$ select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]) $$,
                'Le brouillon de facture se construit depuis l''OR');

select is((select count(*) from public.invoice_lines il join public.invoices i on i.id = il.invoice_id
           where i.status = 'draft'), 2::bigint, 'Le brouillon reprend la main d''œuvre et la pièce');

select is((select t.total_ht from public.v_invoice_totals t join public.invoices i on i.id = t.invoice_id where i.status = 'draft'),
          280.00::numeric, 'Main d''œuvre au taux PL (2 h × 90 €) + pièce 100 € = 280 € HT');

select is(public.build_invoice_draft(array['50000000-0000-0000-0000-000000000001'::uuid]),
          (select id from public.invoices where status = 'draft'),
          'Rouvrir la facture reprend le brouillon existant');

-- Émission
select is(public.issue_invoice((select id from public.invoices where status = 'draft')),
          'F11887', 'La numérotation reprend après F11886 (GTA PRO)');

select results_eq(
  $$ select total_ht, total_vat, total_ttc, client_name, client_siren from public.invoices where number = 'F11887' $$,
  $$ values (280.00::numeric, 56.00::numeric, 336.00::numeric, 'Transports Dupont'::text, '123456789'::text) $$,
  'Totaux et instantané client figés à l''émission');

select is((select status from public.repair_orders where id = '50000000-0000-0000-0000-000000000001'),
          'invoiced'::public.repair_order_status, 'L''OR passe « Facturé »');

-- Immuabilité
select throws_like($$ update public.invoice_lines set unit_price = 1
                      where invoice_id = (select id from public.invoices where number = 'F11887') $$,
                   '%ne peut plus être modifiée%', 'Les lignes d''une facture émise sont verrouillées');
select throws_like($$ update public.invoices set total_ttc = 1 where number = 'F11887' $$,
                   '%ne peut plus être modifiée%', 'Les montants d''une facture émise sont verrouillés');
select throws_like($$ delete from public.invoices where number = 'F11887' $$,
                   '%ne peut pas être supprimée%', 'Une facture émise ne peut pas être supprimée');
select lives_ok($$ select public.share_invoice((select id from public.invoices where number = 'F11887')) $$,
                'Le lien de consultation en ligne peut être ajouté après émission');
select throws_like($$ insert into public.invoices (client_id, status, number) values ('20000000-0000-0000-0000-000000000001', 'issued', 'F99999') $$,
                   '%issue_invoice%', 'Impossible de créer directement une facture émise');

-- Pas de trou dans la numérotation si l'émission échoue
insert into public.invoices (id, client_id) values ('60000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002');
select throws_like($$ select public.issue_invoice('60000000-0000-0000-0000-000000000009') $$,
                   '%vide%', 'Une facture vide ne peut pas être émise');
insert into public.invoice_lines (invoice_id, line_type, description, unit_price) values
  ('60000000-0000-0000-0000-000000000009', 'labor', 'Diagnostic', 50);
select is(public.issue_invoice('60000000-0000-0000-0000-000000000009'), 'F11888',
          'L''échec précédent n''a pas consommé de numéro');

-- Avoirs
insert into public.credit_notes (invoice_id, amount_ht, reason)
values ((select id from public.invoices where number = 'F11887'), 50, 'Geste commercial');
select is((select number from public.credit_notes), 'AV1', 'Numéro d''avoir automatique');
select is((select total_ttc from public.credit_notes), 60.00::numeric, 'Avoir TTC = 50 € HT + TVA 20 %');
select throws_like($$ insert into public.credit_notes (invoice_id, amount_ht) values ((select id from public.invoices where number = 'F11887'), 500) $$,
                   '%dépasserait%', 'Le total des avoirs ne peut pas dépasser la facture');

-- Paiements et solde
insert into public.payments (invoice_id, amount_ttc, method) values
  ((select id from public.invoices where number = 'F11887'), 100, 'bank_transfer');
select results_eq(
  $$ select paid_ttc, credited_ttc, balance_due, payment_status from public.v_invoice_balances where number = 'F11887' $$,
  $$ values (100.00::numeric, 60.00::numeric, 176.00::numeric, 'partial'::text) $$,
  'Solde = 336 − 100 payés − 60 d''avoir, facture partiellement payée');

insert into public.invoices (id, client_id) values ('60000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002');
select throws_like($$ insert into public.payments (invoice_id, amount_ttc, method)
                      values ('60000000-0000-0000-0000-000000000010', 10, 'cash') $$,
                   '%facture émise%', 'Pas de paiement sur une facture non émise');

-- Réception : mêmes droits de facturation que la direction, sans la suppression de paiement
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
with d as (delete from public.payments returning 1)
select is(count(*), 0::bigint, 'La réception ne peut pas supprimer un paiement (réservé à la direction)') from d;

select * from finish();
rollback;
