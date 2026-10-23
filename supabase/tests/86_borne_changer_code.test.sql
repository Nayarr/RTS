-- =============================================================================
-- Borne : le technicien change lui-même son code PIN
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.set_technician_pin('10000000-0000-0000-0000-0000000000a1', '1234');
select public.set_technician_pin('10000000-0000-0000-0000-0000000000b1', '5678');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');  -- borne
select is(public.kiosk_change_pin('0000', '2468') ->> 'message', 'Code actuel incorrect', 'Code actuel faux : refusé');
reset role;
select is((select count(*) from public.kiosk_failed_attempts), 1::bigint, 'Tentative comptée (anti force brute)');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.kiosk_change_pin('1234', '5678') ->> 'message', 'Ce code n''est pas disponible, choisis-en un autre',
          'Code d''un autre technicien : refusé, sans dire à qui il est');
select is(public.kiosk_change_pin('1234', '12') ->> 'message', 'Le nouveau code doit contenir 4 à 6 chiffres',
          'Nouveau code de 4 à 6 chiffres');
select is(public.kiosk_change_pin('1234', '2468'), '{"ok": true, "technician_name": "Alice"}'::jsonb, 'Code changé');
reset role;
select is(public.technician_by_pin('2468'), '10000000-0000-0000-0000-0000000000a1'::uuid, 'Le nouveau code désigne Alice');
select is(public.technician_by_pin('1234'), null, 'L''ancien code ne sert plus');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.kiosk_change_pin('2468', '1357') $$, '42501', null,
                 'Seule la borne (ou la direction) change un code');

select * from finish();
rollback;
