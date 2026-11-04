-- =============================================================================
-- Conditions générales de vente : texte par défaut, modifiable, sur la facture en ligne
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

\ir helpers/fixtures.psql

select ok((select invoice_terms like '1. OBJET ET CHAMP%11. GARANTIES LÉGALES%' from public.company_settings),
          'Les 11 articles sont en place par défaut');
select ok((select invoice_terms not like '%—%' from public.company_settings), 'Pas de tiret cadratin');
select ok(pg_get_functiondef('public.public_find_document(text)'::regprocedure) like '%''terms'', (select invoice_terms%',
          'Facture en ligne : conditions générales envoyées');

select * from finish();
rollback;
