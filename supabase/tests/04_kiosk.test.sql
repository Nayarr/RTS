-- =============================================================================
-- Borne de pointage : PIN, anti force brute, anciens PIN, code de sortie, congés
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Direction : codes PIN
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');

select lives_ok($$ select public.set_technician_pin('10000000-0000-0000-0000-0000000000a1', '1234') $$,
                'La direction définit le PIN d''Alice');
select throws_like($$ select public.set_technician_pin('10000000-0000-0000-0000-0000000000b1', '1234') $$,
                   '%déjà utilisé%', 'Deux techniciens ne peuvent pas avoir le même PIN');
select throws_like($$ select public.set_technician_pin('10000000-0000-0000-0000-0000000000b1', '12') $$,
                   '%4 à 6 chiffres%', 'Le PIN fait 4 à 6 chiffres');
select lives_ok($$ select public.set_kiosk_exit_code('9999') $$, 'La direction définit le code de sortie de la borne');

-- Ancien PIN de l'appli Firestore (SHA-256 de « rts:email:pin ») pour Bruno
reset role;
insert into public.technician_pins (technician_id, pin_hash, algorithm)
values ('10000000-0000-0000-0000-0000000000b1',
        encode(extensions.digest('rts:tech.bruno@test.fr:5678', 'sha256'), 'hex'), 'legacy_sha256');

-- ---------------------------------------------------------------- Borne
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');

select is(public.kiosk_clock('1234', null) ->> 'ok', 'false', 'Pointage refusé sans photo');
select is(public.kiosk_clock('0000', pg_temp.fake_file('clock_photo')) ->> 'message', 'Code incorrect', 'Mauvais code refusé');

select results_eq(
  $$ select r ->> 'ok', r ->> 'technician_name', r ->> 'event_type'
     from (select public.kiosk_clock('1234', pg_temp.fake_file('clock_photo')) as r) x $$,
  $$ values ('true'::text, 'Alice'::text, 'in'::text) $$,
  'Alice pointe son arrivée');
select alike(public.kiosk_clock('1234', pg_temp.fake_file('clock_photo')) ->> 'message', 'Déjà pointé%',
            'Double pointage dans la minute refusé');

reset role;
update public.clock_events set occurred_at = occurred_at - interval '4 hours';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.kiosk_clock('1234', pg_temp.fake_file('clock_photo')) ->> 'event_type', 'out',
          'Le pointage suivant est un départ');

select is(public.kiosk_clock('5678', pg_temp.fake_file('clock_photo')) ->> 'technician_name', 'Bruno',
          'Un ancien PIN (appli Firestore) fonctionne toujours');
reset role;
select is((select algorithm from public.technician_pins where technician_id = '10000000-0000-0000-0000-0000000000b1'),
          'bcrypt', 'L''ancien PIN est re-haché en bcrypt au premier usage');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.verify_kiosk_exit_code('9999'), true, 'Le bon code de sortie est accepté');
select is(public.verify_kiosk_exit_code('0001'), false, 'Un mauvais code de sortie est refusé');

-- Anti force brute : après 5 erreurs dans la minute, même le bon code est bloqué
select lives_ok($$ select public.kiosk_clock('0000', pg_temp.fake_file('clock_photo')) from generate_series(1, 4) $$,
                'Quatre codes erronés de plus');
select alike(public.kiosk_clock('1234', pg_temp.fake_file('clock_photo')) ->> 'message', 'Trop de tentatives%',
            'Blocage après 5 erreurs en une minute');

-- ---------------------------------------------------------------- Technicien
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_like($$ select public.kiosk_clock('1234', null) $$, '%compte borne%',
                   'Un technicien ne peut pas pointer depuis son téléphone');

select * from finish();
rollback;
