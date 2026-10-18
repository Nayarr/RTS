-- =============================================================================
-- Échéance du contrôle hayon : mois et année seulement
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir helpers/fixtures.psql

select ((current_date::timestamp + interval '10 hours') at time zone 'Europe/Paris') as now10 \gset
select date_trunc('month', current_date)::date as this_month \gset

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
update public.vehicles set tailgate_due_date = (date_trunc('month', current_date) + interval '3 months 17 days')::date
where id = '30000000-0000-0000-0000-000000000001';
select is((select tailgate_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000001'),
          (date_trunc('month', current_date) + interval '3 months')::date,
          'Jour saisi ignoré : seul le mois est gardé (1er du mois)');
reset role;

select throws_ok($$ alter table public.vehicles disable trigger vehicles_tailgate_month;
                    update public.vehicles set tailgate_due_date = '2027-05-17'
                    where id = '30000000-0000-0000-0000-000000000001' $$,
                 '23514', null, 'La base refuse un jour autre que le 1er');
alter table public.vehicles enable trigger vehicles_tailgate_month;

-- Mois en cours : échéance à la fin du mois, e-mail au client dès le 1er
update public.vehicles set tailgate_due_date = :'this_month' where id = '30000000-0000-0000-0000-000000000001';
select is((select due_date from public.v_vehicle_deadlines
           where vehicle_id = '30000000-0000-0000-0000-000000000001' and kind = 'tailgate'),
          (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
          'Valable jusqu''à la fin du mois indiqué');
select is((select i ->> 'reason' from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i
           where i ->> 'kind' = 'tailgate'), 'Contrôle hayon', 'Mois d''échéance : e-mail préparé');
select is((select i ->> 'due_date' from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i
           where i ->> 'kind' = 'tailgate'), :'this_month', 'Une seule échéance par mois (clé du mois)');

-- Mois suivant : pas encore d'e-mail
update public.vehicles set tailgate_due_date = (date_trunc('month', current_date) + interval '1 month')::date
where id = '30000000-0000-0000-0000-000000000001';
select is((select count(*) from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i
           where i ->> 'kind' = 'tailgate'), 0::bigint, 'Échéance le mois prochain : rien encore');

select * from finish();
rollback;
