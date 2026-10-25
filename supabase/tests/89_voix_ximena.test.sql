-- =============================================================================
-- Voix Ximena par défaut : voix multilingue lue en français, voix françaises toujours acceptées
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir helpers/fixtures.psql

select is((select tts_voice from public.app_settings), 'es-ES-XimenaMultilingualNeural',
          'Atelier passé de Denise (ancienne voix par défaut) à Ximena');
select col_default_is('public', 'app_settings', 'tts_voice', 'es-ES-XimenaMultilingualNeural'::text,
                      'Ximena par défaut');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ update public.app_settings set tts_voice = 'fr-FR-HenriNeural' $$,
                'Voix française toujours acceptée');
select lives_ok($$ update public.app_settings set tts_voice = 'es-ES-XimenaMultilingualNeural' $$,
                'Voix multilingue d’une autre langue acceptée');
select throws_ok($$ update public.app_settings set tts_voice = 'es-ES-XimenaNeural' $$, '23514', null,
                 'Voix d’une autre langue non multilingue refusée (ne lirait pas le français)');

select * from finish();
rollback;
