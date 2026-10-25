-- =============================================================================
-- Facture sans TVA : client étranger vérifié exonéré d'office, bouton « Sans TVA »
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- Client allemand vérifié par VIES (posé comme la fonction « vat-check », sans contrôle)
select set_config('rts.system', 'on', true);
update public.clients set vat_number = 'DE123456789', vat_status = 'valid'
 where id = '20000000-0000-0000-0000-000000000001';
select set_config('rts.system', '', true);

-- La réception ne pose pas elle-même un n° « vérifié »
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ update public.clients set vat_status = 'valid' where id = '20000000-0000-0000-0000-000000000002' $$,
                 '42501', null, 'État de la vérification réservé à « Vérifier »');
update public.clients set vat_number = 'CHE123456789' where id = '20000000-0000-0000-0000-000000000002';
select is((select vat_status from public.clients where id = '20000000-0000-0000-0000-000000000002'), 'unchecked',
          'N° changé : à vérifier');

-- Brouillon du client allemand : sans TVA d'office, mention d'autoliquidation
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000931', '30000000-0000-0000-0000-000000000001', 'Freinage');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000931', 'done', 'labor', 'Contrôle freinage', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000931'::uuid]) as invoice \gset
select ok((select vat_exempt from public.invoices where id = :'invoice'), 'Client étranger vérifié : sans TVA d''office');
select is((select client_vat_number from public.invoices where id = :'invoice'), 'DE123456789',
          'N° de TVA du client sur la facture');
select matches((select vat_exempt_mention from public.invoices where id = :'invoice'), '^Autoliquidation',
               'Mention d''autoliquidation (Union européenne)');
select is((select total_vat from public.v_invoices_overview where id = :'invoice'), 0.00::numeric, 'TVA à 0');

-- Retour à la TVA, puis de nouveau sans TVA ; ligne ajoutée à 0 %
select lives_ok(format($$ select public.set_invoice_vat_exempt(%L, false) $$, :'invoice'), 'TVA remise');
select is((select total_vat from public.v_invoices_overview where id = :'invoice'), 36.00::numeric,
          'Lignes au taux de l''atelier (20 %)');
select public.set_invoice_vat_exempt(:'invoice', true);
insert into public.invoice_lines (invoice_id, line_type, description, unit_price, quantity, vat_rate)
values (:'invoice', 'labor', 'Déplacement', 60, 1, 20);
select is((select sum(total_vat) from public.v_invoices_overview where id = :'invoice'), 0.00::numeric,
          'Ligne ajoutée à une facture sans TVA : 0 %');

-- Facture émise : la TVA ne change plus
select public.issue_invoice(:'invoice');
select throws_ok(format($$ select public.set_invoice_vat_exempt(%L, false) $$, :'invoice'), 'P0001', null,
                 'Facture émise : plus de changement de TVA');

-- Technicien refusé
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$ select public.set_invoice_vat_exempt(%L, true) $$, :'invoice'), '42501', null,
                 'Réservé au bureau');

select * from finish();
rollback;
