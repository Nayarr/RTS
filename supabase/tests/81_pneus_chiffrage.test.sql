-- =============================================================================
-- Demandes de chiffrage des pneus : gardées dans l'historique, réservées au bureau
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$
  insert into public.tire_quote_requests (lines, recipients, subject, body)
  values ('[{"size": "315/80 R22.5", "profile": "arriere", "quantity": 4}]', array['commandes@euromaster.test'],
          'Demande de chiffrage pneumatiques', 'Bonjour')
$$, 'La réception garde sa demande');
select is((select sent_by from public.tire_quote_requests), '00000000-0000-0000-0000-0000000000e1'::uuid,
          'Envoyée par la personne connectée');
select throws_ok($$ insert into public.tire_quote_requests (lines, subject, body) values ('[]', 'Objet', 'Texte') $$,
                 '23514', null, 'Demande sans pneu refusée');
select throws_ok($$ update public.tire_quote_requests set body = 'Autre' $$, '42501', null,
                 'Une demande envoyée ne se modifie pas');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is_empty($$ select 1 from public.tire_quote_requests $$, 'Le technicien ne voit pas les demandes');

select * from finish();
rollback;
