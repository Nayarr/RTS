-- =============================================================================
-- Adresses d'envoi par type de message : domaine et débuts d'adresse réglés par la direction
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

select results_eq(
  $$ select mail_domain, mail_billing_local, mail_workshop_local, mail_signature_local from public.app_settings $$,
  $$ values (null::text, 'facturation', 'atelier', 'signature') $$,
  'Par défaut : facturation@, atelier@, signature@, domaine à renseigner');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
update public.app_settings set mail_domain = 'rapidtruckservice.fr', mail_billing_local = 'compta';
select results_eq($$ select mail_domain, mail_billing_local from public.app_settings $$,
  $$ values ('rapidtruckservice.fr', 'compta') $$, 'La direction règle le domaine et les adresses');
select throws_ok($$ update public.app_settings set mail_domain = 'https://rapidtruckservice.fr' $$,
  '23514', null, 'Domaine seul (pas d''adresse web)');
select throws_ok($$ update public.app_settings set mail_signature_local = 'signature@autre.fr' $$,
  '23514', null, 'Début d''adresse seul (le domaine est commun)');
select throws_ok($$ update public.app_settings set mail_workshop_local = '' $$,
  '23514', null, 'Début d''adresse obligatoire');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
update public.app_settings set mail_domain = 'pirate.fr';
reset role;
select is((select mail_domain from public.app_settings), 'rapidtruckservice.fr', 'La réception ne change pas le domaine');

select * from finish();
rollback;
