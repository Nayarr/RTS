-- =============================================================================
-- Mails reçus triés par l'Agent Direction : lus et marqués traités par la direction seulement,
-- écrits par l'Edge Function seulement, gardés une fois, tri de secours, purge 90 jours
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

\ir helpers/fixtures.psql

-- Mails écrits par l'Edge Function (rôle de service)
insert into public.inbox_emails (id, provider_id, message_id, mailbox, from_address, subject, received_at,
                                 triage_status, category, urgency, summary, needs_reply, created_at) values
  ('1b000000-0000-0000-0000-000000000001', 're_1', '<a@exemple.fr>', 'atelier@rapidtruckservice.fr',
   'jean@exemple.fr', 'Devis embrayage', now(), 'done', 'devis', 'normale', 'Devis embrayage AB-123-CD', true, now()),
  ('1b000000-0000-0000-0000-000000000002', 're_2', null, 'atelier@rapidtruckservice.fr',
   'promo@exemple.fr', 'Promo', now() - interval '91 days', 'done', 'publicite', 'faible', 'Promo', false, now()),
  ('1b000000-0000-0000-0000-000000000003', 're_3', null, 'atelier@rapidtruckservice.fr',
   'x@exemple.fr', 'En attente', now(), 'pending', null, null, null, null, now() - interval '10 minutes'),
  ('1b000000-0000-0000-0000-000000000004', 're_4', null, 'atelier@rapidtruckservice.fr',
   'y@exemple.fr', 'Trop essayé', now(), 'pending', null, null, null, null, now());
update public.inbox_emails set triage_attempts = 3 where provider_id = 're_4';

select throws_ok(
  $$insert into public.inbox_emails (provider_id, from_address, received_at) values ('re_1', 'a@b.fr', now())$$,
  '23505', null, 'Webhook rejoué : mail gardé une seule fois');
select throws_ok(
  $$insert into public.inbox_emails (provider_id, message_id, from_address, received_at)
    values ('re_9', '<a@exemple.fr>', 'a@b.fr', now())$$,
  '23505', null, 'Même mail reçu par deux boîtes : gardé une seule fois');
select throws_ok(
  $$insert into public.inbox_emails (provider_id, from_address, received_at, category)
    values ('re_8', 'a@b.fr', now(), 'inconnue')$$,
  '23514', null, 'Catégorie du tri contrôlée');

-- ---------------------------------------------------------------- Direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.inbox_emails), 4, 'Direction : mails lisibles');
select is(public.set_inbox_emails_handled(array['1b000000-0000-0000-0000-000000000001']::uuid[], true), 1,
          'Direction : mail marqué traité');
select is((select handled_by from public.inbox_emails where provider_id = 're_1'),
          '00000000-0000-0000-0000-0000000000d1'::uuid, 'Traité par la personne connectée');
select is(public.set_inbox_emails_handled(array['1b000000-0000-0000-0000-000000000001']::uuid[], true), 0,
          'Déjà traité : rien ne change');
select is(public.set_inbox_emails_handled(array['1b000000-0000-0000-0000-000000000001']::uuid[], false), 1,
          'Remis à traiter');
select throws_ok($$update public.inbox_emails set summary = 'x'$$, '42501', null, 'Tri jamais modifiable depuis l''appli');
select throws_ok($$delete from public.inbox_emails$$, '42501', null, 'Pas de suppression depuis l''appli');

-- ---------------------------------------------------------------- Autres rôles
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select ok((select count(*)::int from public.inbox_emails) > 0, 'Réception : voit les mails reçus');
select is(public.set_inbox_emails_handled(array['1b000000-0000-0000-0000-000000000001']::uuid[], true), 1,
          'Réception : coche un mail traité');
select is(public.set_inbox_emails_handled(array['1b000000-0000-0000-0000-000000000001']::uuid[], false), 1,
          'Réception : remet un mail à traiter');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.inbox_emails), 0, 'Technicien : aucun mail visible');
select throws_ok($$select public.set_inbox_emails_handled(array['1b000000-0000-0000-0000-000000000001']::uuid[], true)$$,
                 '42501', null, 'Technicien : ne peut rien marquer');
select pg_temp.act_as_anon();
select throws_ok('select id from public.inbox_emails', '42501', null, 'Visiteur : refusé');
reset role;

-- ---------------------------------------------------------------- Tri de secours et purge
select public.retry_inbox_triage();
select is((select triage_status from public.inbox_emails where provider_id = 're_4'), 'failed',
          'Abandon du tri après 3 essais (mail toujours lisible)');
select public.purge_agent_conversations();
select is((select count(*)::int from public.inbox_emails), 3, 'Copie de plus de 90 jours effacée la nuit');

select * from finish();
rollback;
