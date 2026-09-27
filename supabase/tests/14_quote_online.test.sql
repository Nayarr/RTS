-- =============================================================================
-- Devis en ligne : lien à signer, réponse du client (via l'Edge Function)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select id as quote_id from public.create_quote('Transports Dupont', 'AB-123-CD') \gset
insert into public.quote_lines (quote_id, description, unit_price, quantity) values (:'quote_id', 'Géométrie', 90, 1.5);

reset role;
update public.quotes set public_token = repeat('c', 64) where id = :'quote_id';
select throws_ok($$ select public.public_respond_quote(repeat('c', 64), false, 'M. Dupont') $$,
                 'P0001', 'Ce devis n''est pas ouvert à la signature',
                 'Un devis pas encore envoyé ne peut pas recevoir de réponse');
update public.quotes set public_token = null where id = :'quote_id';

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.share_quote(:'quote_id') as token \gset
select is((select status::text from public.quotes where id = :'quote_id'), 'sent', 'Le devis partagé passe « Envoyé »');
select is(public.share_quote(:'quote_id'), :'token', 'Un nouvel envoi garde le même lien');

-- Réponse du client : uniquement par l'Edge Function (clé de service)
select pg_temp.act_as_anon();
select throws_ok(format($$ select public.public_respond_quote(%L, false, 'Pirate') $$, :'token'),
                 '42501', null, 'Un visiteur ne peut pas répondre sans passer par la fonction');
select is(public.public_get_document(:'token') ->> 'status', 'sent', 'Le client lit son devis avec le lien');

reset role;
select throws_ok(format($$ select public.public_respond_quote(%L, true, 'M. Dupont', null) $$, :'token'),
                 '22023', 'Nom et signature obligatoires pour accepter le devis',
                 'Accepter demande une signature');
select is(public.public_respond_quote(:'token', false, '  ') ->> 'status', 'refused', 'Le refus est enregistré sans nom');
select throws_ok(format($$ select public.public_respond_quote(%L, true, 'M. Dupont', %L) $$, :'token',
                        pg_temp.fake_file('signature')),
                 'P0001', 'Ce devis a déjà reçu une réponse', 'Une seule réponse par devis');
select is((select count(*) from public.notifications
           where type = 'quote_response' and dedupe_key like 'quote-response-' || :'quote_id' || '-%'), 2::bigint,
          'La direction et la réception sont prévenues de la réponse');

select * from finish();
rollback;
