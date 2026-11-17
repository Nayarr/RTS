-- =============================================================================
-- Badgeage modifiable par la direction : heure et sens, motif, heure d'origine gardée
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

update public.app_settings set expected_arrival = '09:00', late_tolerance = '09:05';
select (public.paris_date(now()) - 1) as day \gset

-- Arrivée badgée à la borne à 09:32 (oubli : le technicien était là à 08:58)
insert into public.clock_events (id, technician_id, event_type, occurred_at, work_date, source) values
  ('70000000-0000-0000-0000-000000000154', '10000000-0000-0000-0000-0000000000a1', 'in',
   (:'day'::date + time '09:32') at time zone 'Europe/Paris', :'day', 'kiosk');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select public.update_clock_event('70000000-0000-0000-0000-000000000154', '08:58', 'in', 'Oubli') $$,
                 '42501', null, 'Réservé à la direction');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select throws_ok($$ select public.update_clock_event('70000000-0000-0000-0000-000000000154', '08:58', 'in', '  ') $$,
                 '22023', null, 'Motif obligatoire');
select is((select late_minutes from public.v_daily_attendance
           where technician_id = '10000000-0000-0000-0000-0000000000a1' and work_date = :'day'), 32,
          'Avant : 32 min de retard');

select lives_ok($$ select public.update_clock_event('70000000-0000-0000-0000-000000000154', '08:58', 'in',
                                                   'Badge oublié, arrivé à l''heure') $$,
                'La direction rectifie l''heure du badgeage de la borne');
select results_eq(
  format($$ select (occurred_at at time zone 'Europe/Paris')::time, (original_occurred_at at time zone 'Europe/Paris')::time,
                   source, edit_reason, edited_by
            from public.clock_events where id = %L $$, '70000000-0000-0000-0000-000000000154'),
  $$ values ('08:58'::time, '09:32'::time, 'kiosk'::public.clock_source, 'Badge oublié, arrivé à l''heure'::text,
             '00000000-0000-0000-0000-0000000000d1'::uuid) $$,
  'Nouvelle heure, heure d''origine et motif gardés, toujours un badgeage de la borne');
select is((select late_minutes from public.v_daily_attendance
           where technician_id = '10000000-0000-0000-0000-0000000000a1' and work_date = :'day'), 0,
          'Retard recalculé : plus de retard');

-- Deuxième modification : l'heure d'origine reste la première
select public.update_clock_event('70000000-0000-0000-0000-000000000154', '09:01', 'in', 'Précision');
select is((select (original_occurred_at at time zone 'Europe/Paris')::time from public.clock_events
           where id = '70000000-0000-0000-0000-000000000154'), '09:32'::time,
          'L''heure d''origine reste celle de la borne');

-- Directement dans la table : toujours refusé pour un badgeage de la borne
select throws_ok($$ update public.clock_events set edit_reason = 'autre' where id = '70000000-0000-0000-0000-000000000154' $$,
                 '42501', null, 'Historique de la modification protégé');
select throws_ok($$ update public.clock_events set occurred_at = now() - interval '1 hour'
                    where id = '70000000-0000-0000-0000-000000000154' $$,
                 '42501', null, 'Heure d''un badgeage de la borne non modifiable hors de la fenêtre de la direction');

select * from finish();
rollback;
