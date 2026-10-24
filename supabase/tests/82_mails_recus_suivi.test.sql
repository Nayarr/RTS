-- =============================================================================
-- Mails reçus : dernier appel de Resend, lisible par la direction seule
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

insert into public.inbox_webhook_status (result, recipients, domain)
values ('not_atelier', array['tri@abc.resend.app'], 'rapidtruckservice.fr');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select result from public.inbox_webhook_status), 'not_atelier', 'La direction lit le dernier appel');
select throws_ok($$ update public.inbox_webhook_status set result = 'stored' $$, '42501', null,
                 'Personne ne le modifie depuis l''appli');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is_empty($$ select 1 from public.inbox_webhook_status $$, 'La réception ne le voit pas');

reset role;
select throws_ok($$ insert into public.inbox_webhook_status (id, result) values (false, 'stored') $$, '23514',
                 null, 'Une seule ligne');

select * from finish();
rollback;
