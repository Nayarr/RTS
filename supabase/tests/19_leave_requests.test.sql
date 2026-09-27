-- =============================================================================
-- Congés et absences : demandes du technicien, décisions et saisie de la direction
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Demande du technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice
select (public.save_leave_request('paid_leave', '2026-10-12', '2026-10-16', ' Vacances ')).id as leave_id \gset
select results_eq(
  format($$ select technician_id, status::text, comment, created_by, decided_by from public.leave_requests where id = %L $$,
         :'leave_id'),
  $$ values ('10000000-0000-0000-0000-0000000000a1'::uuid, 'requested', 'Vacances',
             '00000000-0000-0000-0000-0000000000a1'::uuid, null::uuid) $$,
  'Demande du technicien en attente, pour lui-même');

select throws_ok($$ select public.save_leave_request('paid_leave', '2026-10-12', '2026-10-12', p_technician_id => '10000000-0000-0000-0000-0000000000b1') $$,
                 '42501', null, 'Un technicien ne demande pas pour un collègue');
select throws_ok($$ select public.save_leave_request('paid_leave', '2026-10-12', '2026-10-11') $$,
                 '22023', 'Dates invalides : la fin doit être le même jour ou après le début', 'Fin avant le début refusée');
select throws_ok($$ select public.save_leave_request('training', '2026-10-16', '2026-10-20') $$,
                 '23P01', 'Une absence existe déjà sur cette période', 'Pas de chevauchement');
select throws_ok(format($$ select public.decide_leave_request(%L, true) $$, :'leave_id'),
                 '42501', null, 'Le technicien ne valide pas sa demande');

-- Le technicien annule sa demande encore en attente
select (public.save_leave_request('other', '2026-11-02', '2026-11-03')).id as cancel_id \gset
select public.delete_leave_request(:'cancel_id');
select is((select is_deleted from public.leave_requests where id = :'cancel_id'), true,
          'Le technicien annule sa demande en attente');

-- ---------------------------------------------------------------- Direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select results_eq(
  format($$ select status::text, decided_by, decided_at is not null from public.decide_leave_request(%L, true) $$, :'leave_id'),
  $$ values ('approved', '00000000-0000-0000-0000-0000000000d1'::uuid, true) $$,
  'La direction valide la demande');
select throws_ok(format($$ select public.decide_leave_request(%L, false) $$, :'leave_id'),
                 'P0001', 'Cette demande a déjà été traitée', 'Une demande ne se traite qu''une fois');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$ select public.delete_leave_request(%L) $$, :'leave_id'),
                 '42501', null, 'Le technicien ne supprime pas un congé validé');

-- Une demande refusée ne bloque pas une nouvelle demande sur la même période
select (public.save_leave_request('paid_leave', '2026-12-01', '2026-12-02')).id as refused_id \gset
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.decide_leave_request(:'refused_id', false);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.save_leave_request('paid_leave', '2026-12-01', '2026-12-02') $$,
                'Nouvelle demande possible après un refus');

-- Absence saisie par la direction : validée d'office, repérée au pointage
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((public.save_leave_request('sick', '2026-09-14', '2026-09-15', p_technician_id => '10000000-0000-0000-0000-0000000000b1')).status::text,
          'approved', 'Absence saisie par la direction directement validée');
select is((public.add_manual_clock_event('10000000-0000-0000-0000-0000000000b1', 'in', '2026-09-15', '08:00', 'Test')).during_leave_type::text,
          'sick', 'Pointage pendant une absence repéré');
select lives_ok(format($$ select public.delete_leave_request(%L) $$, :'leave_id'), 'La direction supprime un congé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select public.save_leave_request('sick', '2026-10-01', '2026-10-01', p_technician_id => '10000000-0000-0000-0000-0000000000b1') $$,
                 '42501', null, 'La réception ne saisit pas d''absence');

select * from finish();
rollback;
