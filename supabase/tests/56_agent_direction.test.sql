-- =============================================================================
-- Assistant de la direction : réglage, conversations lues par leur auteur seulement,
-- contenu brut des échanges jamais lisible, écriture réservée à l'Edge Function, purge 90 jours
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir helpers/fixtures.psql

select is((select agent_enabled from public.app_settings), false, 'Assistant désactivé par défaut');

-- Conversations écrites par l'Edge Function (rôle de service)
insert into public.agent_conversations (id, profile_id, title, transcript, updated_at) values
  ('a6e00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'CA du mois ?',
   '[{"role": "user", "content": "CA du mois ?"}]', now()),
  ('a6e00000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'Ancienne',
   '[]', now() - interval '91 days'),
  ('a6e00000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', 'Réception',
   '[]', now());
insert into public.agent_turns (conversation_id, profile_id, question, answer, spoken) values
  ('a6e00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1',
   'CA du mois ?', '12 450 euros.', true);

select throws_ok(
  $$insert into public.agent_conversations (profile_id, title, transcript)
    values ('00000000-0000-0000-0000-0000000000d1', 'x', '{}')$$,
  '23514', null, 'Échanges toujours enregistrés comme une liste');

-- ---------------------------------------------------------------- Direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.agent_conversations), 2, 'Direction : ses conversations seulement');
select is((select answer from public.agent_turns), '12 450 euros.', 'Direction : ses questions et réponses');
select throws_ok('select transcript from public.agent_conversations', '42501', null,
                 'Contenu brut des échanges jamais lisible depuis l''appli');
select throws_ok(
  $$insert into public.agent_conversations (profile_id, title) values ('00000000-0000-0000-0000-0000000000d1', 'x')$$,
  '42501', null, 'Création réservée à l''Edge Function');
select throws_ok(
  $$insert into public.agent_turns (conversation_id, profile_id, question, answer)
    values ('a6e00000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'q', 'r')$$,
  '42501', null, 'Journal des questions écrit par l''Edge Function seulement');
select throws_ok($$update public.agent_conversations set title = 'x'$$, '42501', null, 'Pas de modification');
delete from public.agent_conversations where id = 'a6e00000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.agent_turns), 0, 'Conversation effacée avec ses questions');

-- ---------------------------------------------------------------- Autres rôles
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select results_eq($$select title from public.agent_conversations$$, $$values ('Réception')$$,
                  'Réception : ses conversations seulement, jamais celles de la direction');
select pg_temp.act_as_anon();
select throws_ok('select id from public.agent_conversations', '42501', null, 'Visiteur : refusé');
select throws_ok('select public.purge_agent_conversations()', '42501', null, 'Visiteur : purge interdite');
reset role;

-- ---------------------------------------------------------------- Purge
select is(public.purge_agent_conversations(), 1, 'Conversation sans échange depuis 90 jours effacée');
select is((select count(*)::int from cron.job where jobname = 'rts-purge-agent'), 1, 'Purge planifiée chaque nuit');

select * from finish();
rollback;
