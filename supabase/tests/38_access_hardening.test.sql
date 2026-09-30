-- =============================================================================
-- Durcissement des accès : taux négociés réservés au bureau, borne sans lecture
-- directe des données, blocage de la borne après 20 codes faux dans l'heure
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

update public.clients set hourly_rate = 82.5 where id = '20000000-0000-0000-0000-000000000001';
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000001', 'OR90001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Freins', '10000000-0000-0000-0000-0000000000a1', 'assigned');
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Taux négociés
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is(public.labor_rate_for('20000000-0000-0000-0000-000000000001', 'pl'), 82.50, 'Bureau : taux négocié du client');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.labor_rate_for('20000000-0000-0000-0000-000000000001', 'pl') $$, '42501', null,
                 'Technicien : taux négociés inaccessibles');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select public.labor_rate_for('20000000-0000-0000-0000-000000000001', 'pl') $$, '42501', null,
                 'Borne : taux négociés inaccessibles');

-- ---------------------------------------------------------------- Borne : plus de lecture directe
select is((select count(*)::integer from public.repair_orders), 0, 'Borne : OR illisibles');
select is((select count(*)::integer from public.vehicles), 0, 'Borne : véhicules illisibles');
select is((select count(*)::integer from public.clients), 0, 'Borne : clients illisibles');
select ok(jsonb_typeof(public.workshop_board()) = 'object', 'Borne : l''écran télé fonctionne toujours');

-- Le technicien garde l'accès à ses OR, véhicules et clients
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::integer from public.repair_orders), 1, 'Technicien : son OR reste lisible');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------- Borne : 20 codes faux dans l'heure
insert into public.kiosk_failed_attempts (attempted_by, attempted_at)
select '00000000-0000-0000-0000-0000000000c1', now() - (n * interval '2 minutes') - interval '2 minutes'
from generate_series(1, 20) n;
select ok(public.kiosk_too_many_attempts(), '20 codes faux dans l''heure : borne bloquée');
select is((select count(*)::integer from public.notifications where type = 'kiosk_lockout'), 1,
          'Alerte envoyée à la direction');
update public.kiosk_failed_attempts set attempted_at = attempted_at - interval '16 minutes';
select ok(not public.kiosk_too_many_attempts(), 'Débloquée 15 minutes après le dernier code faux');

select * from finish();
rollback;
