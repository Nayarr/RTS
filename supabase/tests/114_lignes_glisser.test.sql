-- =============================================================================
-- Lignes d'un devis ou d'une facture déplacées (glisser-déposer) : nouvel ordre, documents figés
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Devis
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select id as quote from public.create_quote('Transports Ordre', null, 'pl') \gset
insert into public.quote_lines (id, quote_id, position, line_type, description, unit_price, quantity) values
  ('11400000-0000-0000-0000-000000000001', :'quote', 0, 'labor', 'Diagnostic', 50, 1),
  ('11400000-0000-0000-0000-000000000002', :'quote', 1, 'labor', 'Vidange', 90, 1),
  ('11400000-0000-0000-0000-000000000003', :'quote', 2, 'labor', 'Freinage', 120, 1);

select lives_ok(format($$ select public.reorder_quote_lines(%L, array[
  '11400000-0000-0000-0000-000000000003', '11400000-0000-0000-0000-000000000001',
  '11400000-0000-0000-0000-000000000002']::uuid[]) $$, :'quote'), 'Lignes du devis réordonnées');
select is((select string_agg(description, ' | ' order by position) from public.quote_lines where quote_id = :'quote'),
          'Freinage | Diagnostic | Vidange', 'Nouvel ordre : rang de la liste reçue');

select throws_ok(format($$ select public.reorder_quote_lines(%L, array['11400000-0000-0000-0000-000000000099']::uuid[]) $$,
                        :'quote'),
                 'P0002', 'Ligne introuvable sur ce devis', 'Ligne d''un autre document refusée');

select public.set_quote_response(:'quote', 'accepted');
select throws_like(format($$ select public.reorder_quote_lines(%L, array[
  '11400000-0000-0000-0000-000000000001', '11400000-0000-0000-0000-000000000002',
  '11400000-0000-0000-0000-000000000003']::uuid[]) $$, :'quote'),
                   '%Devis accepté%', 'Devis accepté : ordre figé');

-- ---------------------------------------------------------------- Facture
insert into public.invoices (id, client_id) values ('11400000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001');
insert into public.invoice_lines (id, invoice_id, position, line_type, description, unit_price) values
  ('11400000-0000-0000-0000-000000000011', '11400000-0000-0000-0000-000000000010', 0, 'labor', 'Diagnostic', 50),
  ('11400000-0000-0000-0000-000000000012', '11400000-0000-0000-0000-000000000010', 1, 'text', 'Remarque', null);
select lives_ok($$ select public.reorder_invoice_lines('11400000-0000-0000-0000-000000000010', array[
  '11400000-0000-0000-0000-000000000012', '11400000-0000-0000-0000-000000000011']::uuid[]) $$,
                'Lignes de la facture en brouillon réordonnées');
select is((select string_agg(description, ' | ' order by position) from public.invoice_lines
           where invoice_id = '11400000-0000-0000-0000-000000000010'),
          'Remarque | Diagnostic', 'Nouvel ordre de la facture');

update public.clients set billing_address = '1 rue du Fret, 95190 Goussainville'
where id = '20000000-0000-0000-0000-000000000001';
select public.issue_invoice('11400000-0000-0000-0000-000000000010');
select throws_like($$ select public.reorder_invoice_lines('11400000-0000-0000-0000-000000000010', array[
  '11400000-0000-0000-0000-000000000011', '11400000-0000-0000-0000-000000000012']::uuid[]) $$,
                   '%facture émise%', 'Facture émise : ordre figé');

-- ---------------------------------------------------------------- Atelier
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select throws_ok(format($$ select public.reorder_quote_lines(%L, array['11400000-0000-0000-0000-000000000001']::uuid[]) $$,
                        :'quote'),
                 'P0002', 'Ligne introuvable sur ce devis', 'Technicien : lignes du devis invisibles, rien ne bouge');

select * from finish();
rollback;
