-- =============================================================================
-- Relance des échéances : une relance par véhicule et contrôle tous les 3 mois au plus
-- (page Échéances, Agent Direction, rappel automatique)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir helpers/fixtures.psql

select ((current_date::timestamp + interval '10 hours') at time zone 'Europe/Paris') as now10 \gset

-- Deux poids lourds de Transports Dupont, contrôle technique demain
reset role;
update public.vehicles set ct_due_date = current_date + 1
 where id in ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------- Page Échéances
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select is(public.record_deadline_reminders('[{"vehicle_id": "30000000-0000-0000-0000-000000000001", "kind": "ct"}]'),
          1, 'Relance notée par la réception');
select isnt((select reminded_at from public.v_vehicle_deadlines
             where vehicle_id = '30000000-0000-0000-0000-000000000001' and kind = 'ct'), null,
            'Page Échéances : date de la relance');
select throws_like($$ select public.record_deadline_reminders('[{"vehicle_id": "30000000-0000-0000-0000-000000000001", "kind": "ct"}]') $$,
                   'AB-123-CD déjà relancé depuis moins de 3 mois', 'Pas de deuxième relance avant 3 mois');
select is(public.deadline_recently_reminded('30000000-0000-0000-0000-000000000001', 'tailgate'), false,
          'Un autre contrôle du même véhicule reste à relancer');

-- ---------------------------------------------------------------- Rappels automatiques
reset role;
select is((select array_agg(i ->> 'vehicle_id' order by i ->> 'vehicle_id')
           from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i where i ->> 'kind' = 'ct'),
          array['30000000-0000-0000-0000-000000000002'],
          'Rappel automatique : le véhicule relancé à la main est écarté');
select public.record_auto_mail('ct:30000000-0000-0000-0000-000000000002', 'ct', 'compta@dupont.fr',
                               '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
                               null, 're_1', null);
select is((select source from public.deadline_reminders where vehicle_id = '30000000-0000-0000-0000-000000000002'),
          'auto', 'Rappel automatique parti : noté comme relance');

-- Il y a plus de 3 mois : de nouveau relançable
update public.deadline_reminders set sent_at = now() - interval '3 months 1 day'
 where vehicle_id = '30000000-0000-0000-0000-000000000001';
select is(public.deadline_recently_reminded('30000000-0000-0000-0000-000000000001', 'ct'), false,
          'Relance de plus de 3 mois : relançable');

-- ---------------------------------------------------------------- Agent Direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is(public.record_deadline_reminders('[{"vehicle_id": "30000000-0000-0000-0000-000000000001", "kind": "ct"}]', 'agent'),
          1, 'Mail de l''agent envoyé : relance notée');
select throws_like($$ select public.record_deadline_reminders('[]', 'auto') $$, '%Origine de relance inconnue%',
                   'Le bureau ne note pas un rappel automatique');

-- ---------------------------------------------------------------- Technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.record_deadline_reminders('[]') $$, '42501', null,
                 'Technicien : pas de relance');

select * from finish();
rollback;
