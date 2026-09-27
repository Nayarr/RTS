-- =============================================================================
-- Borne de pointage (photos) et pointages de la direction (corrections, présence)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select is(public.kiosk_exit_code_is_set(), false, 'Code de sortie pas encore défini');
select public.set_kiosk_exit_code('4321');
select is(public.kiosk_exit_code_is_set(), true, 'Code de sortie défini');
select public.set_technician_pin('10000000-0000-0000-0000-0000000000a1', '1234');

-- ---------------------------------------------------------------- Borne : photos
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');  -- borne
select throws_ok(format($$ select public.kiosk_clock('1234', %L) $$, pg_temp.fake_file('ro_photo')),
                 '22023', null, 'Seule une photo de pointage est acceptée');

select pg_temp.fake_file('clock_photo') as wrong_photo \gset
select is(public.kiosk_clock('0000', :'wrong_photo') ->> 'ok', 'false', 'Mauvais code refusé');
select pg_temp.fake_file('clock_photo') as photo \gset
select is(public.kiosk_clock('1234', :'photo') ->> 'event_type', 'in', 'Arrivée enregistrée');
select pg_temp.fake_file('clock_photo') as twice_photo \gset
select alike(public.kiosk_clock('1234', :'twice_photo') ->> 'message', 'Déjà pointé%', 'Double pointage refusé');

reset role;
select results_eq(
  format($$ select id::text, deleted_at is not null from public.files where id in (%L, %L, %L) order by 1 $$,
         :'wrong_photo', :'photo', :'twice_photo'),
  format($$ select * from (values (%L, true), (%L, false), (%L, true)) v order by 1 $$,
         :'wrong_photo', :'photo', :'twice_photo'),
  'Les photos des tentatives refusées sont supprimées, celle du pointage est gardée');

-- ---------------------------------------------------------------- Direction : corrections
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select (public.add_manual_clock_event('10000000-0000-0000-0000-0000000000b1', 'in', '2026-09-01', '09:20',
                                      ' Oubli de badge ')).id as manual_in \gset
select public.add_manual_clock_event('10000000-0000-0000-0000-0000000000b1', 'out', '2026-09-01', '19:00', 'Oubli');
select results_eq(
  format($$ select occurred_at, work_date, source::text, reason, entered_by from public.clock_events where id = %L $$,
         :'manual_in'),
  $$ values ('2026-09-01 07:20:00+00'::timestamptz, '2026-09-01'::date, 'manual', 'Oubli de badge',
             '00000000-0000-0000-0000-0000000000d1'::uuid) $$,
  'Correction à l''heure de Paris, marquée manuelle, motif et auteur gardés');
select results_eq(
  $$ select worked_seconds, overtime_seconds, late_minutes, anomalies
     from public.v_daily_attendance
     where technician_id = '10000000-0000-0000-0000-0000000000b1' and work_date = '2026-09-01' $$,
  $$ values ((9 * 3600 + 40 * 60)::bigint, 1800::bigint, 20, 0::bigint) $$,
  'Présence : heures, heures supplémentaires après 18h30, retard après 9h05');

select throws_ok($$ select public.add_manual_clock_event('10000000-0000-0000-0000-0000000000b1', 'in', '2026-10-02', '09:00', ' ') $$,
                 '22023', 'Indique le motif de la correction', 'Motif obligatoire');
select throws_ok($$ select public.add_manual_clock_event('10000000-0000-0000-0000-0000000000b1', 'in', current_date + 2, '09:00', 'x') $$,
                 '22023', 'Un pointage ne peut pas être dans le futur', 'Pas de pointage dans le futur');

select lives_ok(format($$ delete from public.clock_events where id = %L $$, :'manual_in'),
                'Une correction manuelle peut être supprimée');
select throws_ok(format($$ delete from public.clock_events where photo_file_id = %L $$, :'photo'),
                 '42501', null, 'Un pointage de la borne ne se supprime pas');
select throws_ok(format($$ update public.clock_events set occurred_at = occurred_at - interval '1 hour'
                           where photo_file_id = %L $$, :'photo'),
                 '42501', null, 'Un pointage de la borne ne se modifie pas');
select lives_ok(format($$ update public.clock_events set photo_purged_at = now() where photo_file_id = %L $$, :'photo'),
                'La purge des photos reste possible');

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select public.add_manual_clock_event('10000000-0000-0000-0000-0000000000b1', 'in', '2026-09-01', '09:00', 'x') $$,
                 '42501', null, 'La réception ne corrige pas les pointages');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select public.kiosk_exit_code_is_set() $$, '42501', null, 'La borne ne lit pas l''état du code de sortie');

select * from finish();
rollback;
