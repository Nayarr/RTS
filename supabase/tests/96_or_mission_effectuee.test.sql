-- =============================================================================
-- Mission donnée à la création de l'OR : une tâche des travaux effectués par ligne
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

select results_eq(
  $$ select ord, description from public.mission_lines(E'- Contrôle complet\n\n  Vidange  \nRendez-vous') $$,
  $$ values (0, 'Contrôle complet'), (1, 'Vidange') $$,
  'Une tâche par ligne : puces et lignes vides retirées, « Rendez-vous » ignoré');

-- ---------------------------------------------------------------- Création au bureau
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select id as ro from public.create_repair_order('AB-123-CD', 'pl', null, E'Contrôle complet\nVidange', null,
  '10000000-0000-0000-0000-0000000000a1') \gset
select results_eq(
  format($$ select kind::text, line_type::text, description, estimated_hours from public.ro_lines
            where repair_order_id = %L order by position $$, :'ro'),
  $$ values ('done', 'labor', 'Contrôle complet', null::numeric), ('done', 'labor', 'Vidange', null) $$,
  'OR créé au bureau : la mission est dans les travaux effectués, temps à donner par le technicien');

-- Le technicien ne termine pas sans son temps sur la mission
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice
insert into public.ro_photos (repair_order_id, file_id, label)
values (:'ro', pg_temp.fake_file('ro_photo'), 'Contrôle technique');
select throws_like(format($$ select public.complete_repair_order(%L) $$, :'ro'),
  '%Temps estimé manquant : 2 tâches des travaux effectués%', 'Mission sans temps : clôture refusée');
update public.ro_lines set estimated_hours = 1.5 where repair_order_id = :'ro';
select is((public.complete_repair_order(:'ro')).status::text, 'work_done', 'Temps donné : OR terminé');

-- Facture : la mission au temps du technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.build_invoice_draft(array[:'ro'::uuid]) as inv \gset
select results_eq(
  format($$ select description, quantity from public.invoice_lines where invoice_id = %L and line_type = 'labor'
            order by position $$, :'inv'),
  $$ values ('Contrôle complet', 2.00::numeric), ('Vidange', 2.00) $$,
  'Facture de l''OR : la mission facturée au temps du technicien (arrondi à l''heure)');

-- ---------------------------------------------------------------- Rendez-vous et OR dupliqué
insert into public.appointments (id, client_id, vehicle_id, vehicle_type, scheduled_date, start_time, reason)
values ('60000000-0000-0000-0000-000000000961', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 'pl', current_date, '08:00', 'Freins avant');
select public.create_repair_order_from_appointment('60000000-0000-0000-0000-000000000961') as from_appt \gset
select results_eq(
  format($$ select description from public.ro_lines where repair_order_id = %L and kind = 'done' $$, :'from_appt'),
  $$ values ('Freins avant') $$,
  'OR créé depuis un rendez-vous : le motif dans les travaux effectués');

select public.duplicate_repair_order(:'ro') as copy \gset
select is((select count(*)::integer from public.ro_lines where repair_order_id = :'copy' and kind = 'done'), 2,
          'OR dupliqué : la mission, sans le temps de l''original');

-- ---------------------------------------------------------------- OR créé depuis un devis
select (public.create_quote(p_client_name => 'Transports Dupont', p_plate => 'AB-123-CD', p_vehicle_type => 'pl')).id as quote \gset
insert into public.quote_lines (quote_id, position, line_type, description, estimated_hours, unit_price, quantity)
values (:'quote', 0, 'labor', 'Embrayage', 3, 85, 3);
select public.create_repair_order_from_quote(:'quote') as from_quote \gset
select results_eq(
  format($$ select description from public.ro_lines where repair_order_id = %L and kind = 'done' $$, :'from_quote'),
  $$ values ('Embrayage') $$,
  'OR depuis un devis : les lignes du devis seules, sans mission en double');

select * from finish();
rollback;
