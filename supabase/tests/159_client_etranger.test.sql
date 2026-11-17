-- =============================================================================
-- Client étranger : pays et n° d'entreprise du pays au lieu du SIRET, figés sur la facture émise
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

select is((select country from public.clients where id = '20000000-0000-0000-0000-000000000001'), 'FR',
          'Client existant : France par défaut');

select lives_ok($$ insert into public.clients (id, name, billing_address, country, foreign_id) values
  ('20000000-0000-0000-0000-000000000991', 'Transport Peeters', 'Rue de la Gare 4, 1000 Bruxelles, Belgique',
   'BE', 'BE 0123.456.789') $$, 'Client belge : n° d''entreprise libre, sans SIRET');

select throws_like($$ update public.clients set siret = '12345678900015'
                      where id = '20000000-0000-0000-0000-000000000991' $$,
                   '%clients_foreign_siret_check%', 'Client étranger : pas de SIRET');
select throws_like($$ update public.clients set foreign_id = 'X1'
                      where id = '20000000-0000-0000-0000-000000000001' $$,
                   '%clients_foreign_id_check%', 'Client français : pas de n° étranger');
select throws_like($$ update public.clients set country = 'be'
                      where id = '20000000-0000-0000-0000-000000000991' $$,
                   '%clients_country_check%', 'Pays : code à deux lettres majuscules');
select throws_like($$ update public.clients set foreign_id = ' '
                      where id = '20000000-0000-0000-0000-000000000991' $$,
                   '%clients_foreign_id_check%', 'N° d''entreprise vide refusé (null attendu)');

-- Facture émise : pays et n° figés, une modification de la fiche ne la change plus
insert into public.invoices (id, client_id)
values ('60000000-0000-0000-0000-000000000991', '20000000-0000-0000-0000-000000000991');
insert into public.invoice_lines (invoice_id, line_type, description, unit_price) values
  ('60000000-0000-0000-0000-000000000991', 'labor', 'Diagnostic', 80);
select lives_ok($$ select public.issue_invoice('60000000-0000-0000-0000-000000000991') $$,
                'Facture d''un client étranger émise');
update public.clients set foreign_id = 'BE 0999.999.999' where id = '20000000-0000-0000-0000-000000000991';
select results_eq(
  $$ select client_country, client_foreign_id, client_siret from public.invoices
     where id = '60000000-0000-0000-0000-000000000991' $$,
  $$ values ('BE'::text, 'BE 0123.456.789'::text, null::text) $$,
  'Pays et n° d''entreprise figés à l''émission');

-- Client français : pays figé, pas de n° étranger
insert into public.invoices (id, client_id)
values ('60000000-0000-0000-0000-000000000992', '20000000-0000-0000-0000-000000000001');
insert into public.invoice_lines (invoice_id, line_type, description, unit_price) values
  ('60000000-0000-0000-0000-000000000992', 'labor', 'Diagnostic', 80);
select public.issue_invoice('60000000-0000-0000-0000-000000000992');
select results_eq(
  $$ select client_country, client_foreign_id, client_siret from public.invoices
     where id = '60000000-0000-0000-0000-000000000992' $$,
  $$ values ('FR'::text, null::text, '12345678900015'::text) $$,
  'Client français : SIRET et France figés');

select * from finish();
rollback;
