-- =============================================================================
-- OR créé depuis un devis : travaux effectués facturés au temps du devis, début prévu,
-- temps réel saisi par le technicien (forfaits compris), travail retiré
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir helpers/fixtures.psql

-- Appareil d'Alice abonné aux notifications
insert into public.push_subscriptions (id, profile_id, endpoint, p256dh, auth_key) values
  ('70000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'https://push.test/alice', 'p', 'a');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select id as quote from public.create_quote('Transports Dupont', 'ab 123 cd', 'pl') \gset
insert into public.quote_lines (quote_id, position, line_type, description, estimated_hours, billed_hours,
                                standard_hours, unit_price, quantity) values
  (:'quote', 0, 'labor', 'Remplacement disques de frein avant', 3, null, null, 85, 3),
  (:'quote', 1, 'package', 'Forfait vidange PL', null, null, 1.5, 180, 1),
  (:'quote', 2, 'labor', 'Remplacement Extincteur 6 kg camion', 0.3, null, null, 85, 0.3),
  (:'quote', 3, 'labor', 'Remplacement Étiquettes angles morts', 0.5, null, null, 85, 0.5),
  (:'quote', 4, 'labor', 'Diagnostic électrique', null, 1, null, 85, 1),
  (:'quote', 5, 'text', 'Véhicule à rendre lavé', null, null, null, 0, 1),
  (:'quote', 6, 'part', 'Disques avant (x2)', null, null, null, 240, 1);
select public.set_quote_response(:'quote', 'accepted');

select throws_ok(format($$ select public.create_repair_order_from_quote(%L, null, '2026-10-05', '08:00', '07:00') $$,
                        :'quote'),
  '22023', 'L''heure de fin doit être après l''heure de début', 'Fin avant le début refusée');

select public.create_repair_order_from_quote(:'quote', '10000000-0000-0000-0000-0000000000a1',
                                             '2026-10-05', '08:00', '12:00') as ro \gset

select results_eq(
  format($$ select technician_id, planned_date, planned_start, planned_end from public.repair_orders where id = %L $$, :'ro'),
  $$ values ('10000000-0000-0000-0000-0000000000a1'::uuid, '2026-10-05'::date, '08:00'::time, '12:00'::time) $$,
  'Technicien et début prévu posés à la création');
reset role;  -- file d'envoi des notifications : lue hors des droits de l'appli
select ok((select body from public.push_outbox where profile_id = '00000000-0000-0000-0000-0000000000a1'
           order by created_at desc limit 1) like '%Prévu le 05/10 à 08h00%',
          'La notification au technicien annonce le début prévu');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

select results_eq(
  format($$ select line_type::text, estimated_hours, billed_hours from public.ro_lines
            where repair_order_id = %L and kind = 'done' order by position $$, :'ro'),
  $$ values ('labor', null::numeric, 3.00::numeric), ('package', null, 1.50), ('labor', null, 0.30),
            ('labor', null, 0.50), ('labor', null, 1.00), ('text', null, null) $$,
  'Travaux du devis -> travaux effectués facturés au temps du devis ; temps réel à saisir');
select results_eq(
  format($$ select kind::text, order_status::text from public.ro_lines where repair_order_id = %L and line_type = 'part' $$, :'ro'),
  $$ values ('planned', 'to_order') $$,
  'Les pièces restent à commander');
select is((select count(*)::int from public.ro_lines where repair_order_id = :'ro' and kind = 'planned' and line_type <> 'part'), 0,
          'Plus de travaux « à prévoir » : tout est à faire');

-- ---------------------------------------------------------------- Technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$ update public.ro_lines set estimated_hours = 4.5 where repair_order_id = %L and position = 0 $$, :'ro'),
  'Temps réel saisi sur une réparation du devis');
select lives_ok(format($$ update public.ro_lines set estimated_hours = 2 where repair_order_id = %L and position = 1 $$, :'ro'),
  'Temps réel saisi sur un forfait');
select is((select row(estimated_hours, billed_hours) from public.ro_lines where repair_order_id = :'ro' and position = 0 and kind = 'done'),
          row(4.50::numeric(5,2), 3.00::numeric(6,2)), 'Le temps réel ne change pas le temps facturé (devis)');
select throws_ok(format($$ update public.ro_lines set billed_hours = 5 where repair_order_id = %L and position = 0 $$, :'ro'),
  '42501', 'Modification non autorisée pour un technicien', 'Le temps facturé reste réservé au bureau');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((select declared_hours from public.v_repair_orders_overview where id = :'ro'), 6.50::numeric,
          'Charge déclarée : temps réels des travaux effectués');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(format($$ delete from public.ro_lines where repair_order_id = %L and position = 1 and kind = 'done' $$, :'ro'),
  'Forfait finalement non fait : le technicien le retire');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select ok(exists (select 1 from public.ro_events where repair_order_id = :'ro'
                  and label = 'Travail retiré par le technicien (non fait) : Forfait vidange PL'),
          'Le bureau le voit dans l''historique');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$ delete from public.ro_lines where repair_order_id = %L and line_type = 'part' $$, :'ro'),
  '42501', 'Cette ligne ne peut pas être supprimée par un technicien', 'Une pièce ne se retire pas');

select * from finish();
rollback;
