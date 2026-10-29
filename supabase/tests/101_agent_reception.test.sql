-- =============================================================================
-- Agent Direction pour la réception : conversations à soi, mails seulement en écriture
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- Mail préparé par l'agent (Edge Function, droits de la réception) : accepté
select lives_ok($$
  insert into public.agent_actions (id, kind, payload, summary) values
    ('a1010000-0000-0000-0000-000000000001', 'send_mail',
     '{"to": "compta@dupont.fr", "subject": "Contrôle technique", "text": "Bonjour", "client_name": "Transports Dupont"}',
     'Mail à Transports Dupont') $$, 'Réception : mail préparé par l''agent');
-- Toute autre action : refusée
select throws_ok($$
  insert into public.agent_actions (kind, payload, summary) values
    ('vehicle_deadline', '{"vehicle_id": "30000000-0000-0000-0000-000000000001", "field": "ct_due_date", "date": "2027-01-01"}',
     'Échéance') $$, '42501', null, 'Réception : aucune autre action préparée');

select results_eq($$ select (public.edit_agent_mail('a1010000-0000-0000-0000-000000000001', 'flotte@dupont.fr',
                             'Contrôle technique à prévoir', 'Bonjour, votre contrôle approche.')).payload ->> 'to' $$,
  $$ values ('flotte@dupont.fr') $$, 'Réception : relit et modifie son mail');
select is((select count(*)::integer from public.agent_actions), 1, 'Réception : voit ses actions préparées');
select throws_ok($$ select public.execute_agent_action('a1010000-0000-0000-0000-000000000001') $$,
                 '42501', null, 'Validation des autres actions : direction seulement');
select lives_ok($$ select public.cancel_agent_action('a1010000-0000-0000-0000-000000000001') $$,
                'Réception : écarte son mail');
select is((select status from public.agent_actions where id = 'a1010000-0000-0000-0000-000000000001'),
          'cancelled', 'Mail écarté');

-- Technicien : aucun accès à l'agent
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.edit_agent_mail('a1010000-0000-0000-0000-000000000001', 'a@b.fr', 'x', 'y') $$,
                 '42501', null, 'Technicien : aucun accès à l''agent');

select * from finish();
rollback;
