-- =============================================================================
-- Location : tacite reconduction d'une unité à la fois, e-mail de fin de contrat
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

insert into public.fleet_vehicles (id, plate, brand, model, category, daily_rate, mileage, license_category)
values ('60000000-0000-0000-0000-000000000068', 'GE-781-UV', 'Renault', 'Master', 'van', 95, 48210, 'B');

-- Location au jour partie il y a 5 jours, retour prévu hier à 18 h, pas rendue
select (now() - interval '5 days') as dep, (now() - interval '20 hours') as planned \gset
insert into public.rentals (id, client_id, fleet_vehicle_id, departure_at, planned_return_at, unit_price, periods,
                            rate_period)
values ('a0000000-0000-0000-0000-000000000068', '20000000-0000-0000-0000-000000000001',
        '60000000-0000-0000-0000-000000000068', :'dep', :'planned', 95, 4, 'day');
select set_config('rts.rental_transition', 'on', true);
update public.rentals set status = 'active', departed_at = :'dep' where id = 'a0000000-0000-0000-0000-000000000068';
select set_config('rts.rental_transition', '', true);

select is(public.renew_overdue_rentals(), 1, 'Location au jour non rendue : prolongée d''un jour');
select results_eq(
  $$ select planned_return_at, periods, renewals from public.rentals where id = 'a0000000-0000-0000-0000-000000000068' $$,
  format($$ values (%L::timestamptz + interval '1 day', 5.00::numeric, 1) $$, :'planned'),
  'Fin prévue décalée d''un jour, une période de plus à facturer');
select is(public.renew_overdue_rentals(), 0, 'Fin désormais à venir : rien de plus');
select is((select count(*) from public.notifications where type = 'rental_renewed'), 2::bigint,
          'Direction et réception prévenues');

-- Contrat au mois en retard de 40 jours : deux mois d'un coup, un mois à la fois
select set_config('rts.rental_transition', 'on', true);
update public.rentals set status = 'returned', returned_at = now() where id = 'a0000000-0000-0000-0000-000000000068';
select set_config('rts.rental_transition', '', true);
insert into public.rentals (id, client_id, fleet_vehicle_id, departure_at, planned_return_at, unit_price, periods,
                            rate_period)
values ('a0000000-0000-0000-0000-000000000069', '20000000-0000-0000-0000-000000000001',
        '60000000-0000-0000-0000-000000000068', now() - interval '200 days', now() - interval '140 days', 1200, 2,
        'month');
select set_config('rts.rental_transition', 'on', true);
update public.rentals set status = 'active', departed_at = now() - interval '200 days',
       planned_return_at = now() - interval '40 days'
 where id = 'a0000000-0000-0000-0000-000000000069';
select set_config('rts.rental_transition', '', true);
select is(public.renew_overdue_rentals(), 2, 'Contrat au mois en retard de 40 jours : deux mois de plus');

-- Sans tacite reconduction : rien ne bouge
update public.rentals set tacit_renewal = false, planned_return_at = now() - interval '1 hour'
 where id = 'a0000000-0000-0000-0000-000000000069';
select is(public.renew_overdue_rentals(), 0, 'Sans tacite reconduction : contrat inchangé');

-- E-mail de fin de contrat (48 h avant pour un contrat au mois), à 10 h à Paris
select ((current_date::timestamp + interval '10 hours') at time zone 'Europe/Paris') as now10 \gset
update public.rentals set tacit_renewal = true, planned_return_at = :'now10'::timestamptz + interval '30 hours'
 where id = 'a0000000-0000-0000-0000-000000000069';
select is((select i ->> 'unit' from jsonb_array_elements(public.prepare_rental_mails(:'now10')) i
           where i ->> 'rental_id' = 'a0000000-0000-0000-0000-000000000069'),
          'un mois', 'Fin de contrat dans 30 h : e-mail préparé, reconduction d''un mois annoncée');
select is(jsonb_array_length(public.prepare_rental_mails(:'now10'::timestamptz + interval '12 hours')), 0,
          'Pas d''envoi à 22 h');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.renew_overdue_rentals() $$, '42501', null, 'Reconduction réservée à la tâche planifiée');

select * from finish();
rollback;
