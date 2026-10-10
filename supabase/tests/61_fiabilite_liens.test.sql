-- =============================================================================
-- Liens introuvables notés (début du jeton seulement), borne en ligne vue du bureau
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Visiteur sans compte
select pg_temp.act_as_anon();
select is(public.public_get_document(repeat('f', 64)), null, 'Lien inconnu : aucun document');
select throws_ok($$select public.public_find_document(repeat('f', 64))$$, '42501', null,
                 'La recherche interne n''est pas ouverte aux visiteurs');
reset role;
select is((select token_prefix || ':' || token_length from public.public_link_misses), 'ffffffffffff:64',
          'Lien introuvable noté : 12 premiers caractères et longueur');

-- ---------------------------------------------------------------- Direction, réception, technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::integer from public.public_link_misses), 1, 'Direction : liens introuvables lisibles');
select is(public.kiosk_status() ->> 'last_seen_at', null, 'Borne jamais vue');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((select count(*)::integer from public.public_link_misses), 0, 'Réception : liens introuvables masqués');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.kiosk_ping()$$, '42501', null, 'Seule la borne signale sa présence');
select throws_ok($$select public.kiosk_status()$$, '42501', null, 'Technicien : état de la borne refusé');

-- ---------------------------------------------------------------- Borne
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$select public.kiosk_ping()$$, 'La borne signale sa présence');
select lives_ok($$select public.kiosk_ping()$$, 'Deuxième signal : mise à jour');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select ok((public.kiosk_status() ->> 'seconds_ago')::integer between 0 and 5, 'Réception : borne vue à l''instant');

select * from finish();
rollback;
