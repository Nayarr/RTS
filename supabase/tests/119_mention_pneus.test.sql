-- =============================================================================
-- Mention de reprise des pneus usagés dans les mentions légales des factures
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is((select count(*)::integer from public.company_settings, unnest(invoice_legal_mentions) as mention
           where mention like 'Remettez vos pneus usagés%quefairedemesdechets.fr'), 1, 'Mention présente une seule fois');
select ok((select 'TVA sur les encaissements.' = any (invoice_legal_mentions) from public.company_settings),
          'Les autres mentions sont gardées');

select * from finish();
rollback;
