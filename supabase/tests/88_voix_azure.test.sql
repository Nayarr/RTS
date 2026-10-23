-- =============================================================================
-- Voix Azure : réglages de la direction, caractères comptés par mois sous le plafond
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

select is((select tts_provider || ' ' || tts_voice || ' ' || tts_monthly_limit from public.app_settings),
          'browser fr-FR-DeniseNeural 480000', 'Voix du navigateur par défaut, Denise, 480 000 caractères');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ update public.app_settings set tts_provider = 'azure', tts_voice = 'fr-FR-HenriNeural', tts_monthly_limit = 100 $$,
                'La direction choisit la voix Azure');
select throws_ok($$ update public.app_settings set tts_voice = 'en-US-JennyNeural' $$, '23514', null,
                 'Voix française seulement');
select throws_ok($$ update public.app_settings set tts_monthly_limit = 600000 $$, '23514', null,
                 'Plafond sous le niveau gratuit (500 000)');
select throws_ok($$ select public.tts_reserve(10) $$, '42501', null, 'Compteur réservé à la fonction de lecture');

reset role;
select is(public.tts_reserve(60), 60, 'Lecture de 60 caractères comptée');
select is(public.tts_reserve(50), null, 'Plafond du mois dépassé : refusée (voix du navigateur)');
select public.tts_release(60);
select is((select characters from public.tts_usage), 0, 'Lecture refusée par Azure : caractères rendus');

select * from finish();
rollback;
