-- =============================================================================
-- Deux comptes de borne : badgeage (pointage seulement) et signature (liste des demandes en cours)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work) values
  ('50000000-0000-0000-0000-000000001401', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Freins avant'),
  ('50000000-0000-0000-0000-000000001402', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Diagnostic');

-- Deux clients au comptoir : deux demandes envoyées sur la borne
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.request_repair_order_signature('50000000-0000-0000-0000-000000001401', 'kiosk') as first \gset
select public.request_repair_order_signature('50000000-0000-0000-0000-000000001402', 'kiosk') as second \gset

-- Borne de signature : les deux demandes, de la plus ancienne à la plus récente
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select ok(jsonb_array_length(public.kiosk_pending_signatures()) >= 2, 'Toutes les demandes en cours sont listées');
select results_eq(
  format($$ select x ->> 'vehicle_plate', (x ->> 'seconds_left')::int between 55 and 60
            from jsonb_array_elements(public.kiosk_pending_signatures()) x
            where x ->> 'id' in (%L, %L) order by x ->> 'created_at' $$,
         :'first'::jsonb ->> 'id', :'second'::jsonb ->> 'id'),
  $$ values ('AB-123-CD', true), ('IJ-789-KL', true) $$,
  'Chaque demande avec son véhicule et sa minute');
select pg_temp.fake_file('signature') as sig \gset
select lives_ok(format($$ select public.kiosk_sign_repair_order(%L, 'Client 2', %L) $$, :'second'::jsonb ->> 'id', :'sig'),
  'Le deuxième client signe le sien sans attendre le premier');
select ok(not exists (select 1 from jsonb_array_elements(public.kiosk_pending_signatures()) x
                      where x ->> 'id' = :'second'::jsonb ->> 'id'),
          'Document signé : retiré de la liste');
select ok(exists (select 1 from jsonb_array_elements(public.kiosk_pending_signatures()) x
                  where x ->> 'id' = :'first'::jsonb ->> 'id'),
          'L''autre demande reste affichée');
select throws_ok($$ select public.kiosk_clock('1234', null) $$, '42501', null,
                 'La borne de signature ne sert pas au pointage');

-- Borne de badgeage : plus de signature
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select public.kiosk_pending_signatures() $$, '42501', null, 'Borne de badgeage : pas de liste');
select throws_ok(format($$ select public.kiosk_sign_repair_order(%L, '', null) $$, :'first'::jsonb ->> 'id'),
  '42501', null, 'Borne de badgeage : pas de signature');
select is(public.can_upload_file('signature'), false, 'Borne de badgeage : pas d''image de signature');

-- Présence : seule la borne de signature compte pour « borne en ligne »
reset role;
delete from public.kiosk_presence;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select public.kiosk_ping();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is(public.kiosk_status() ->> 'last_seen_at', null, 'Badgeage allumé seul : borne de signature hors ligne');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');
select public.kiosk_ping();
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select ok((public.kiosk_status() ->> 'seconds_ago')::integer between 0 and 5, 'Borne de signature en ligne');

select * from finish();
rollback;
