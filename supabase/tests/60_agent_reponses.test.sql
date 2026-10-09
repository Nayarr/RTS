-- =============================================================================
-- Réponses préparées par l'Agent Direction : statuts contrôlés, « plus tard » réservé à la
-- direction, réponse jamais écrite depuis l'appli, abandon après 3 essais, point du jour en phrases
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir helpers/fixtures.psql

insert into public.inbox_emails (id, provider_id, from_address, subject, received_at, triage_status, category,
                                 needs_reply, reply_status, reply_request, reply_subject, reply_body, reply_attempts,
                                 created_at) values
  ('1c000000-0000-0000-0000-000000000001', 're_1', 'jean@exemple.fr', 'Devis', now(), 'done', 'devis', true,
   'ready', 'Il veut un devis.', 'Re: Devis', 'Bonjour,\nCordialement,\nRTS', 1, now()),
  ('1c000000-0000-0000-0000-000000000002', 're_2', 'x@exemple.fr', 'Panne', now(), 'done', 'rendez_vous', true,
   'pending', null, null, null, 3, now());

select throws_ok(
  $$update public.inbox_emails set reply_status = 'envoyée' where provider_id = 're_1'$$,
  '23514', null, 'Statut de la réponse contrôlé');
select is((select phrases from public.agent_briefings limit 1), null, 'Aucun point du jour au départ');
select throws_ok(
  $$insert into public.agent_briefings (profile_id, day, text, phrases)
    values ('00000000-0000-0000-0000-0000000000d1', current_date, 'x', '{}')$$,
  '23514', null, 'Phrases du point toujours rangées en liste');

-- ---------------------------------------------------------------- Direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select reply_body from public.inbox_emails where provider_id = 're_1'), 'Bonjour,\nCordialement,\nRTS',
          'Direction : réponse préparée lisible');
select ok(public.postpone_inbox_reply('1c000000-0000-0000-0000-000000000001'), 'Direction : réponse remise à plus tard');
select is((select reply_status from public.inbox_emails where provider_id = 're_1'), 'postponed', 'Statut « plus tard »');
select ok(not public.postpone_inbox_reply('1c000000-0000-0000-0000-000000000002'),
          'Réponse pas encore prête : rien ne change');
select throws_ok($$update public.inbox_emails set reply_body = 'x'$$, '42501', null,
                 'Réponse jamais réécrite depuis l''appli');

-- ---------------------------------------------------------------- Réception
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$select public.postpone_inbox_reply('1c000000-0000-0000-0000-000000000001')$$, '42501', null,
                 'Réception : ne peut rien remettre à plus tard');
reset role;

-- ---------------------------------------------------------------- Tâche de secours
select public.retry_inbox_triage();
select is((select reply_status from public.inbox_emails where provider_id = 're_2'), 'failed',
          'Réponse abandonnée après 3 essais (le mail reste lisible)');

select * from finish();
rollback;
