-- =============================================================================
-- Jours travaillés par compte, badgeage facultatif, alternants une semaine sur deux
-- (dates fixes : le test ne dépend pas du jour où il tourne)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

\ir helpers/fixtures.psql

-- Atelier ouvert le samedi ; semaine A = semaine du lundi 2 novembre 2026
update public.app_settings set saturday_hours = 4, rest_reference_monday = '2026-11-02';

-- Alice ne travaille pas le samedi ; Carl alternant semaine A, Dan alternant semaine B
update public.technicians set work_days = '{1,2,3,4,5}' where id = '10000000-0000-0000-0000-0000000000a1';
insert into public.technicians (id, display_name, alternance) values
  ('10000000-0000-0000-0000-000000000c53', 'Carl', 'A'),
  ('10000000-0000-0000-0000-000000000d53', 'Dan', 'B');

select is(public.technician_scheduled('10000000-0000-0000-0000-0000000000a1', '2026-11-13'), true,
          'Vendredi travaillé');
select is(public.technician_scheduled('10000000-0000-0000-0000-0000000000a1', '2026-11-14'), false,
          'Samedi non coché : pas un jour travaillé');
select is(public.technician_scheduled('10000000-0000-0000-0000-0000000000b1', '2026-11-14'), true,
          'Samedi travaillé par défaut');
select is(public.technician_scheduled('10000000-0000-0000-0000-0000000000b1', '2026-11-15'), false,
          'Dimanche : atelier fermé');

select results_eq(
  $$ select public.technician_scheduled('10000000-0000-0000-0000-000000000c53', d),
            public.technician_scheduled('10000000-0000-0000-0000-000000000d53', d)
     from unnest(array['2026-11-04', '2026-11-11', '2026-11-18', '2026-10-28']::date[]) d $$,
  $$ values (true, false), (false, true), (true, false), (false, true) $$,
  'Alternants : semaine A puis semaine B, une sur deux (avant le lundi de référence aussi)');

-- Vacances : Dan présent aussi la semaine A du 16 au 20 novembre
insert into public.technician_schedule_exceptions (technician_id, starts_on, ends_on, note)
values ('10000000-0000-0000-0000-000000000d53', '2026-11-16', '2026-11-20', 'Vacances scolaires');
select is(public.technician_scheduled('10000000-0000-0000-0000-000000000d53', '2026-11-18'), true,
          'Présence en plus : travaillé hors de sa semaine');
select is(public.technician_scheduled('10000000-0000-0000-0000-000000000d53', '2026-11-22'), false,
          'Présence en plus : jamais le dimanche');

-- Samedi fermé : personne
update public.app_settings set saturday_hours = 0;
select is(public.technician_scheduled('10000000-0000-0000-0000-0000000000b1', '2026-11-14'), false,
          'Samedi réglé à 0 h : atelier fermé');
update public.app_settings set saturday_hours = 4;

-- Alertes de pointage : rien un jour non travaillé, rien pour un compte qui ne badge pas
select is(public.attendance_day_off('10000000-0000-0000-0000-0000000000a1', '2026-11-14'), true,
          'Pas d''alerte un samedi non travaillé');
select is(public.attendance_day_off('10000000-0000-0000-0000-0000000000b1', '2026-11-13'), false,
          'Jour travaillé : alertes actives');
update public.technicians set clock_required = false where id = '10000000-0000-0000-0000-0000000000b1';
select is(public.attendance_day_off('10000000-0000-0000-0000-0000000000b1', '2026-11-13'), true,
          'Compte qui ne badge pas : jamais d''alerte');

-- Charge de l'atelier : samedi non travaillé = repos, pas d'heure disponible
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select results_eq(
  $$ select (x ->> 'available_hours')::numeric, x ->> 'absence'
     from jsonb_array_elements(public.workshop_workload('2026-11-14', '2026-11-14') -> 'technicians') x
     where x ->> 'technician_id' = '10000000-0000-0000-0000-0000000000a1' $$,
  $$ values (0::numeric, 'rest'::text) $$,
  'Charge : samedi non travaillé compté en repos');

-- Jours travaillés de la période pour la page Pointages et le relevé (fiches créées avant la période)
reset role;
update public.technicians set created_at = '2026-01-05' where id = '10000000-0000-0000-0000-0000000000a1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select results_eq(
  $$ select scheduled, clock_required from public.technician_schedule('2026-11-13', '2026-11-14')
     where technician_id = '10000000-0000-0000-0000-0000000000a1' order by day $$,
  $$ values (true, true), (false, true) $$,
  'Jours travaillés de la période');
-- Avant la création de la fiche : pas un jour travaillé, donc pas d'absence au relevé
reset role;
update public.technicians set created_at = '2026-11-14 10:00+01' where id = '10000000-0000-0000-0000-0000000000a1';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select results_eq(
  $$ select scheduled from public.technician_schedule('2026-11-12', '2026-11-13')
     where technician_id = '10000000-0000-0000-0000-0000000000a1' order by day $$,
  $$ values (false), (false) $$,
  'Avant la création de la fiche : pas d''absence');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select throws_ok($$ select * from public.technician_schedule('2026-11-13', '2026-11-14') $$, '42501', null,
                 'Réservé au bureau et au comptable');

select * from finish();
rollback;
