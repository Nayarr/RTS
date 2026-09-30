-- =============================================================================
-- Mentions et validité des documents : devis expiré non signable en ligne
-- (l'adresse obligatoire à l'émission est testée dans 01_invoicing)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

set local session_replication_role = replica;
insert into public.quotes (id, number, status, client_id, vehicle_id, public_token, sent_at, valid_until) values
  ('60000000-0000-0000-0000-000000000001', 'DV90001', 'sent', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', repeat('a', 64), now() - interval '40 days', current_date - 1),
  ('60000000-0000-0000-0000-000000000002', 'DV90002', 'sent', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', repeat('b', 64), now(), current_date + 30);
insert into public.quote_lines (quote_id, section, line_type, description, unit_price) values
  ('60000000-0000-0000-0000-000000000001', 'planned', 'labor', 'Freins', 90),
  ('60000000-0000-0000-0000-000000000002', 'planned', 'labor', 'Freins', 90);
set local session_replication_role = origin;

-- Réponse en ligne (Edge Function « quote-response », clé de service)
select throws_like($$ select public.public_respond_quote(repeat('a', 64), false, 'Jean Client') $$,
  'Ce devis a expiré le %', 'Devis expiré : refus en ligne impossible');
select throws_like($$ select public.public_respond_quote(repeat('a', 64), true, 'Jean Client', null) $$,
  'Ce devis a expiré le %', 'Devis expiré : signature en ligne impossible');
select lives_ok($$ select public.public_respond_quote(repeat('b', 64), false, 'Jean Client') $$,
  'Devis encore valable : réponse en ligne possible');

-- Le bureau peut toujours enregistrer l'accord du client à la main (prix confirmés)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select public.set_quote_response('60000000-0000-0000-0000-000000000001', 'accepted') $$,
  'Devis expiré : accord enregistré par le bureau');

select * from finish();
rollback;
