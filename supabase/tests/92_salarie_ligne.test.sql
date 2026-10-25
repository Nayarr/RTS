-- =============================================================================
-- Qui a fait chaque ligne : OR passé d'un technicien à l'autre, salarié des lignes de facture
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir helpers/fixtures.psql

-- OR de deux tâches, assigné à Alice, badgeage d'Alice en cours
insert into public.repair_orders (id, vehicle_id, client_id, requested_work, technician_id, mileage)
values ('50000000-0000-0000-0000-000000000921', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Freins et vidange', '10000000-0000-0000-0000-0000000000a1', 1000);
select set_config('rts.system', 'on', true);
insert into public.ro_lines (id, repair_order_id, kind, line_type, description) values
  ('60000000-0000-0000-0000-00000000092a', '50000000-0000-0000-0000-000000000921', 'done', 'labor', 'Tâche A'),
  ('60000000-0000-0000-0000-00000000092b', '50000000-0000-0000-0000-000000000921', 'done', 'labor', 'Tâche B');
insert into public.time_entries (repair_order_id, technician_id, started_at)
values ('50000000-0000-0000-0000-000000000921', '10000000-0000-0000-0000-0000000000a1', now() - interval '1 hour');
select set_config('rts.system', '', true);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice
update public.ro_lines set estimated_hours = 2 where id = '60000000-0000-0000-0000-00000000092a';
reset role;
select is((select technician_id from public.ro_lines where id = '60000000-0000-0000-0000-00000000092a'),
          '10000000-0000-0000-0000-0000000000a1'::uuid, 'Temps réel saisi par Alice : tâche A notée à Alice');

-- La réception passe l'OR à Bruno : le badgeage resté ouvert d'Alice s'arrête
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
update public.repair_orders set technician_id = '10000000-0000-0000-0000-0000000000b1'
 where id = '50000000-0000-0000-0000-000000000921';
reset role;
select is((select count(*)::int from public.time_entries
           where repair_order_id = '50000000-0000-0000-0000-000000000921' and ended_at is null), 0,
          'OR réassigné : badgeage d''Alice arrêté');
select is((select stopped_by from public.time_entries where repair_order_id = '50000000-0000-0000-0000-000000000921'),
          '00000000-0000-0000-0000-0000000000e1'::uuid, 'Arrêt fait au nom de qui a réassigné');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');  -- Bruno
update public.ro_lines set estimated_hours = 1 where id = '60000000-0000-0000-0000-00000000092b';
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000921', 'done', 'labor', 'Tâche C ajoutée', 0.5);
reset role;
select is((select string_agg(t.display_name, ', ' order by l.description) from public.ro_lines l
           join public.technicians t on t.id = l.technician_id
           where l.repair_order_id = '50000000-0000-0000-0000-000000000921'),
          'Alice, Bruno, Bruno', 'Tâche A à Alice, tâches B et C (ajoutée) à Bruno');

-- Charge de travail : chacun ses heures
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.workshop_workload(public.paris_date(now()), public.paris_date(now())) as w \gset
select results_eq(
  format($$ select t ->> 'technician_id', (t ->> 'declared_hours')::numeric
            from jsonb_array_elements(%L::jsonb -> 'technicians') t
            where (t ->> 'declared_hours')::numeric > 0 order by 1 $$, :'w'),
  $$ values ('10000000-0000-0000-0000-0000000000a1', 2::numeric), ('10000000-0000-0000-0000-0000000000b1', 1.5::numeric) $$,
  'Temps déclaré : 2 h pour Alice, 1,5 h pour Bruno');

-- Facture : salarié prérempli depuis l'OR, réservé à la direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000921'::uuid]) as invoice \gset
select is((select string_agg(public.employee_name(e.technician_id, e.profile_id), ', ' order by il.description)
           from public.invoice_lines il join public.invoice_line_employees e on e.invoice_line_id = il.id
           where il.invoice_id = :'invoice' and il.line_type = 'labor'),
          'Alice, Bruno, Bruno', 'Lignes de la facture : salarié repris de chaque ligne d''OR');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select is((select count(*)::int from public.invoice_line_employees), 0, 'La réception ne voit pas les salariés');
select throws_ok(format($$ select public.set_invoice_line_employee(
                            (select id from public.invoice_lines where invoice_id = %L limit 1),
                            null, '00000000-0000-0000-0000-0000000000e1') $$, :'invoice'),
                 '42501', null, 'La réception ne change pas le salarié');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select id as line from public.invoice_lines where invoice_id = :'invoice' and description = 'Tâche A' \gset
select lives_ok(format($$ select public.set_invoice_line_employee(%L, null, '00000000-0000-0000-0000-0000000000e1') $$, :'line'),
                'La direction met la réception sur la tâche A');
select is((select old_name || ' → ' || new_name || ' (' || line_description || ')'
           from public.invoice_line_employee_changes where invoice_id = :'invoice'),
          'Alice → Réception (Tâche A)', 'Changement gardé dans l''historique de la facture');
select throws_ok(format($$ select public.set_invoice_line_employee(%L, null, '00000000-0000-0000-0000-0000000000a1') $$, :'line'),
                 '22023', null, 'Compte du bureau seulement pour un salarié du bureau');

select pg_temp.act_as_anon();
select throws_ok($$ select count(*) from public.invoice_line_employee_changes $$, '42501', null,
                 'Historique fermé à un visiteur anonyme');

select * from finish();
rollback;
