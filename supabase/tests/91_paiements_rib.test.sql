-- =============================================================================
-- Moyens de paiement sans LCR, RIB de l'atelier sur la facture en ligne
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction

-- RIB (IBAN d'exemple de la norme, aucun compte réel)
select throws_ok($$ update public.company_settings set iban = 'FR14 2004' $$, '23514', null,
                 'IBAN mal formé refusé');
select throws_ok($$ update public.company_settings set bic = 'BNPA' $$, '23514', null, 'BIC mal formé refusé');
select lives_ok($$ update public.company_settings set iban = 'FR1420041010050500013M02606', bic = 'BNPAFRPP' $$,
                'La direction enregistre le RIB de l''atelier');

-- Facture émise, puis paiements
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000091', '30000000-0000-0000-0000-000000000001', 'Freinage');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000091', 'done', 'labor', 'Contrôle freinage', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000091'::uuid]) as invoice \gset
select public.issue_invoice(:'invoice');
select public.share_invoice(:'invoice') as token \gset

select throws_ok(format($$ insert into public.payments (invoice_id, amount_ttc, method, paid_on)
                           values (%L, 10, 'bill_of_exchange', current_date) $$, :'invoice'),
                 '23514', null, 'Plus de nouveau paiement en LCR / traite');
select lives_ok(format($$ insert into public.payments (invoice_id, amount_ttc, method, paid_on)
                          values (%L, 10, 'bank_transfer', current_date) $$, :'invoice'),
                'Paiement par virement accepté');

select pg_temp.act_as_anon();
select is((select doc ->> 'iban' || ' ' || (doc ->> 'bic') from (select public.public_get_document(:'token') as doc) d),
          'FR1420041010050500013M02606 BNPAFRPP', 'Facture en ligne : RIB de l''atelier');

select * from finish();
rollback;
