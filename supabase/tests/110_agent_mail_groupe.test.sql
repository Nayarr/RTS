-- =============================================================================
-- Agent Direction : mail groupé (même texte pour plusieurs clients), relu puis envoyé par mail-send
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$
  insert into public.agent_actions (id, kind, payload, summary) values
    ('70000000-0000-0000-0000-000000000111', 'send_mailing',
     '{"subject": "Machine à vendre", "text": "Bonjour {client}", "category": "workshop",
       "recipients": [{"client_id": "20000000-0000-0000-0000-000000000001", "name": "Transports Dupont", "to": "compta@dupont.fr"},
                      {"client_id": "20000000-0000-0000-0000-000000000002", "name": "Logistique Martin", "to": "parc@martin.fr"}],
       "without_email": 0}',
     'Mail groupé à 2 clients : « Machine à vendre »')
$$, 'La direction garde le mail groupé préparé par l''agent');
select throws_like($$ select public.execute_agent_action('70000000-0000-0000-0000-000000000111') $$,
                   '%par l''envoi des e-mails%', 'Le mail groupé ne part pas par l''exécution des actions');

-- Relu : texte modifié, un destinataire retiré
select lives_ok($$ select public.edit_agent_mailing('70000000-0000-0000-0000-000000000111', 'Machine de parallélisme à vendre',
                   'Bonjour {client}, notre machine est à vendre.', array['20000000-0000-0000-0000-000000000002'::uuid]) $$,
                'Texte modifié, un destinataire retiré');
select results_eq(
  $$ select payload ->> 'subject', jsonb_array_length(payload -> 'recipients'), payload #>> '{recipients,0,to}', summary
     from public.agent_actions where id = '70000000-0000-0000-0000-000000000111' $$,
  $$ values ('Machine de parallélisme à vendre', 1, 'parc@martin.fr',
             'Mail groupé à 1 client : « Machine de parallélisme à vendre »') $$,
  'Destinataires gardés, résumé à jour');
select throws_like($$ select public.edit_agent_mailing('70000000-0000-0000-0000-000000000111', 'Objet', 'Texte',
                      array['20000000-0000-0000-0000-000000000099'::uuid]) $$,
                   '%au moins un destinataire%', 'Aucune adresse ajoutée : seuls les destinataires préparés restent');
select throws_like($$ select public.edit_agent_mailing('70000000-0000-0000-0000-000000000111', '', 'Texte',
                      array['20000000-0000-0000-0000-000000000002'::uuid]) $$,
                   '%Objet du mail%', 'Objet obligatoire');

-- Réception : pas de mail groupé
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_like($$
  insert into public.agent_actions (kind, payload, summary)
  values ('send_mailing', '{"subject": "Info", "text": "Bonjour", "recipients": []}', 'Mail groupé')
$$, '%row-level security%', 'La réception ne prépare pas de mail groupé');
select throws_ok($$ select public.edit_agent_mailing('70000000-0000-0000-0000-000000000111', 'Objet', 'Texte',
                    array['20000000-0000-0000-0000-000000000002'::uuid]) $$, '42501', null,
                 'La réception ne modifie pas un mail groupé');

select * from finish();
rollback;
