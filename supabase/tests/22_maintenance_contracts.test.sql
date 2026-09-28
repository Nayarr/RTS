-- =============================================================================
-- Contrats d'entretien
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- Kilométrage connu du véhicule existant
insert into public.repair_orders (vehicle_id, requested_work, mileage, created_at)
values ('30000000-0000-0000-0000-000000000001', 'Pneus', 200000, now() - interval '8 months');

-- ---------------------------------------------------------------- Saisie
select (public.save_maintenance_contract(' Transports Dupont ', ' Vidange + contrôle général ',
                                         array['ab-123-cd', 'NEW-001-XX', ' '], 6, 30000, 250, current_date - 200)).id
  as contract_id \gset
select results_eq(
  format($$ select c.name, mc.service_description, mc.frequency_months, mc.frequency_km, mc.monthly_price_ht
            from public.maintenance_contracts mc join public.clients c on c.id = mc.client_id where mc.id = %L $$,
         :'contract_id'),
  $$ values ('Transports Dupont', 'Vidange + contrôle général', 6, 30000, 250.00::numeric) $$,
  'Contrat enregistré pour le client existant');
select results_eq(
  format($$ select v.plate, mcv.start_mileage, v.client_id = '20000000-0000-0000-0000-000000000001'
            from public.maintenance_contract_vehicles mcv join public.vehicles v on v.id = mcv.vehicle_id
            where mcv.contract_id = %L order by v.plate $$, :'contract_id'),
  $$ values ('AB-123-CD', 200000, true), ('NEW-001-XX', null::integer, true) $$,
  'Véhicules retrouvés ou créés, kilométrage de départ = dernier relevé');

select throws_ok($$ select public.save_maintenance_contract('X', '', array['AB-123-CD']) $$,
                 '22023', 'Indique une fréquence (mois ou km)', 'Fréquence obligatoire');
select throws_ok($$ select public.save_maintenance_contract('X', '', array[' '], 6) $$,
                 '22023', 'Indique au moins un véhicule', 'Au moins un véhicule');

-- ---------------------------------------------------------------- État des véhicules
select results_eq(
  format($$ select v ->> 'plate', (v ->> 'service_due')::boolean, (v ->> 'appointment_planned')::boolean
            from public.v_contracts_overview o, jsonb_array_elements(o.vehicles) v
            where o.id = %L order by 1 $$, :'contract_id'),
  $$ values ('AB-123-CD', true, false), ('NEW-001-XX', true, false) $$,
  'Aucun entretien depuis 200 jours pour un contrat de 6 mois : entretien à planifier');

-- Rendez-vous d'entretien rattaché au contrat, puis OR à l'arrivée du véhicule
select (public.save_appointment('Transports Dupont', 'AB-123-CD', 'pl', current_date + 2, '09:00',
                                p_reason => 'Entretien contrat', p_maintenance_contract_id => :'contract_id')).id
  as appt_id \gset
select is((select (v ->> 'appointment_planned')::boolean from public.v_contracts_overview o,
           jsonb_array_elements(o.vehicles) v where o.id = :'contract_id' and v ->> 'plate' = 'AB-123-CD'),
          true, 'Rendez-vous planifié : plus à planifier');
select public.create_repair_order_from_appointment(:'appt_id') as ro_id \gset
select is((select maintenance_contract_id from public.repair_orders where id = :'ro_id'), :'contract_id'::uuid,
          'L''OR créé à l''arrivée du véhicule est rattaché au contrat');
select is((select (v ->> 'service_due')::boolean from public.v_contracts_overview o,
           jsonb_array_elements(o.vehicles) v where o.id = :'contract_id' and v ->> 'plate' = 'AB-123-CD'),
          false, 'Entretien fait aujourd''hui : véhicule à jour');

-- ---------------------------------------------------------------- Modification
select public.save_maintenance_contract('Transports Dupont', 'Vidange', array['AB-123-CD'], 12, null, 250, null,
                                        :'contract_id');
select results_eq(
  format($$ select frequency_months, frequency_km, (select count(*) from public.maintenance_contract_vehicles
                                                     where contract_id = %1$L)
            from public.maintenance_contracts where id = %1$L $$, :'contract_id'),
  $$ values (12, null::integer, 1::bigint) $$,
  'Modification : fréquence, véhicule retiré');

-- ---------------------------------------------------------------- Facturation du mois
select public.build_contract_invoice_draft(:'contract_id', '2026-09-15') as invoice_id \gset
select results_eq(
  format($$ select i.status::text, i.client_id, i.maintenance_contract_id, l.description, l.unit_price, t.total_ttc
            from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
            join public.v_invoice_totals t on t.invoice_id = i.id where i.id = %L $$, :'invoice_id'),
  format($$ values ('draft', '20000000-0000-0000-0000-000000000001'::uuid, %L::uuid,
                    E'Contrat d''entretien — Vidange — septembre 2026\nVéhicules : AB-123-CD', 250.00::numeric,
                    300.00::numeric) $$, :'contract_id'),
  'Brouillon de facture du mois avec la ligne du contrat');
select lives_ok(format($$ select public.issue_invoice(%L) $$, :'invoice_id'), 'La facture du contrat s''émet');

-- ---------------------------------------------------------------- Fin du contrat, droits
update public.maintenance_contracts set is_active = false, ended_on = current_date where id = :'contract_id';
select is((select jsonb_array_length(vehicles) from public.v_contracts_overview where id = :'contract_id'), 1,
          'Contrat terminé : ses véhicules restent listés');
select throws_ok(format($$ select public.save_maintenance_contract('X', '', array['AB-123-CD'], 6, p_id => %L) $$,
                        :'contract_id'),
                 'P0002', 'Contrat introuvable ou terminé', 'Un contrat terminé ne se modifie plus');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok($$ select public.save_maintenance_contract('X', '', array['AB-123-CD'], 6) $$,
                 '42501', null, 'Un technicien ne gère pas les contrats');

select * from finish();
rollback;
