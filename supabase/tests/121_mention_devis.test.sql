-- =============================================================================
-- Mention « sous réserve de démontage » : sur les devis seulement
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

select is((select quote_legal_mentions from public.company_settings), array['VALABLE SOUS RÉSERVE DE DÉMONTAGE'],
          'Mention présente par défaut sur les devis');
select ok((select not ('VALABLE SOUS RÉSERVE DE DÉMONTAGE' = any (invoice_legal_mentions)) from public.company_settings),
          'Absente des mentions des factures');

insert into public.quotes (id, client_id, public_token)
values ('d0000000-0000-0000-0000-000000000121', '20000000-0000-0000-0000-000000000001', repeat('q', 32));
insert into public.invoices (id, client_id, public_token)
values ('d0000000-0000-0000-0000-000000000122', '20000000-0000-0000-0000-000000000001', repeat('f', 32));
insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity)
values ('d0000000-0000-0000-0000-000000000122', 0, 'labor', 'Vidange', 90, 1);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.issue_invoice('d0000000-0000-0000-0000-000000000122');
reset role;

select is(public.public_find_document(repeat('q', 32)) -> 'legal_mentions',
          '["VALABLE SOUS RÉSERVE DE DÉMONTAGE"]'::jsonb, 'Devis en ligne : la mention est transmise');
select ok(public.public_find_document(repeat('f', 32)) ->> 'legal_mentions' not like '%DÉMONTAGE%',
          'Facture en ligne : pas de mention du devis');

-- La direction la modifie ou la retire dans les réglages
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
update public.company_settings set quote_legal_mentions = '{}';
reset role;
select is((select quote_legal_mentions from public.company_settings), '{}'::text[], 'Mention retirable');
select is(public.public_find_document(repeat('q', 32)) -> 'legal_mentions', '[]'::jsonb,
          'Mention retirée : plus rien sur le devis en ligne');

select * from finish();
rollback;
