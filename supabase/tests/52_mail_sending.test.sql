-- =============================================================================
-- Envoi des e-mails par l'appli : réglage de la direction, journal des envois
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

select is((select mail_send_enabled from public.app_settings), false, 'Désactivé par défaut : messagerie de l''ordinateur');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
update public.app_settings set mail_send_enabled = true;
reset role;
select is((select mail_send_enabled from public.app_settings), false, 'La réception ne change pas le réglage');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
update public.app_settings set mail_send_enabled = true;
reset role;
select is((select mail_send_enabled from public.app_settings), true, 'La direction active l''envoi par l''appli');

-- Journal : écrit par l'Edge Function (clé de service), lu par le bureau
insert into public.email_deliveries (provider_message_id, recipient, subject, attachments, sent_by)
values ('re_123', 'client@exemple.fr', 'Facture F00012 — RTS', '{F00012.pdf}', '00000000-0000-0000-0000-0000000000e1');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select results_eq($$ select recipient, attachments from public.email_deliveries $$,
  $$ values ('client@exemple.fr', '{F00012.pdf}'::text[]) $$, 'Le bureau voit les e-mails envoyés');
select throws_ok($$ insert into public.email_deliveries (recipient, subject) values ('x@y.fr', 'Faux') $$,
  '42501', null, 'Le bureau n''écrit pas dans le journal (seulement l''Edge Function)');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select is((select count(*)::int from public.email_deliveries), 0, 'Le technicien ne voit pas le journal');

select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.email_deliveries $$, '42501', null, 'Un visiteur n''y a pas accès');

select * from finish();
rollback;
