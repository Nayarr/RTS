-- =============================================================================
-- Agent Direction : mail préparé, envoyé seulement par la fonction d'envoi après validation
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$
  insert into public.agent_actions (id, kind, payload, summary) values
    ('70000000-0000-0000-0000-000000000081', 'send_mail',
     '{"to": "compta@dupont.fr", "subject": "Relance", "text": "Bonjour", "category": "billing", "invoice_ids": []}',
     'Relance à Transports Dupont')
$$, 'La direction garde le mail préparé par l''agent');
select throws_like($$ select public.execute_agent_action('70000000-0000-0000-0000-000000000081') $$,
                   '%par l''envoi des e-mails%', 'Le mail ne part pas par l''exécution des actions');
select is((select status from public.agent_actions where id = '70000000-0000-0000-0000-000000000081'), 'proposed',
          'Il reste à envoyer');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_like($$
  insert into public.agent_actions (kind, payload, summary)
  values ('send_mail', '{"to": "x@y.fr"}', 'Mail')
$$, '%row-level security%', 'La réception ne prépare pas de mail pour l''agent');

select * from finish();
rollback;
