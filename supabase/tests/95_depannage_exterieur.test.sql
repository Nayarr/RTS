-- =============================================================================
-- Dépannage extérieur : déplacement par zone, temps de trajet au-delà, prix à la main au-delà de 40 km
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

select results_eq($$ select zone, price from public.roadside_travel(8, 25, null) $$, $$ values (1, 60.00) $$,
                  'Zone 1 (moins de 10 km aller-retour), 25 min : forfait de proximité 60 €');
select results_eq($$ select zone, price from public.roadside_travel(8, 31, null) $$, $$ values (1, 90.00) $$,
                  'Zone 1 au-delà de 30 min, sans tolérance : 1 h de trajet, 90 €');
select results_eq($$ select price from public.roadside_travel(8, 80, null) $$, $$ values (120.00) $$,
                  'Zone 1 en 1 h 20 : 90 € + 20 min au prorata');
select results_eq($$ select zone, price from public.roadside_travel(10, 65, null) $$, $$ values (2, 90.00) $$,
                  'Zone 2 dès 10 km ; 1 h 05 : dans la tolérance, forfait 90 €');
select results_eq($$ select price from public.roadside_travel(15, 70, null) $$, $$ values (105.00) $$,
                  'Zone 2 en 1 h 10 : 90 € + 10 min au prorata');
select results_eq($$ select zone, price from public.roadside_travel(40, 97, null) $$, $$ values (3, 130.00) $$,
                  'Zone 3 jusqu''à 40 km ; 1 h 37 : dans la tolérance, forfait 130 €');
select results_eq($$ select price from public.roadside_travel(30, 100, null) $$, $$ values (150.00) $$,
                  'Zone 3 en 1 h 40 : temps de trajet 150 €');
select results_eq($$ select zone, price from public.roadside_travel(52.4, 80, null) $$, $$ values (4, null::numeric) $$,
                  'Au-delà de 40 km : prix à saisir');
select results_eq($$ select price from public.roadside_travel(52.4, 80, 210) $$, $$ values (210::numeric) $$,
                  'Prix saisi à la main');

-- Brouillon de facture : une ligne de déplacement, avec le lieu d'intervention
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
insert into public.repair_orders (id, vehicle_id, requested_work, intervention_type, roadside_address, roadside_km,
                                  roadside_minutes)
values ('50000000-0000-0000-0000-000000000951', '30000000-0000-0000-0000-000000000001', 'Crevaison', 'roadside',
        'Aire de Roissy, 95700 Roissy-en-France', 15, 70);
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000951', 'done', 'labor', 'Réparation crevaison', 1);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000951'::uuid]) as invoice \gset
select results_eq(format($$ select description, unit_price from public.invoice_lines
                            where invoice_id = %L and line_type = 'travel' $$, :'invoice'),
                  $$ values ('Déplacement zone 2 : 1 h 10 de trajet aller-retour · Aire de Roissy, 95700 Roissy-en-France',
                             105.00::numeric) $$,
                  'Une seule ligne de déplacement : temps de trajet de la zone 2, lieu d''intervention');
select is((select count(*)::int from public.invoice_lines where invoice_id = :'invoice' and line_type = 'travel'), 1,
          'Plus de frais kilométriques ni de temps de trajet séparés');

select * from finish();
rollback;
