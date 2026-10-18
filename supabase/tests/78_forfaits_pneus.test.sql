-- =============================================================================
-- Forfaits des pneus : déclenchés par la fiche, x2 à l'avant et par essieu ajouté, x4 à l'arrière
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

select is((select count(*)::integer from public.service_packages where legacy_id like 'pneus:%' and standard_hours = 0), 12,
          'Forfaits des pneus PL et VUL créés, temps de barème à 0 h');

-- ---------------------------------------------------------------- Poids lourd
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000781', '30000000-0000-0000-0000-000000000001', 'Pneus', null, 'assigned'),
  ('50000000-0000-0000-0000-000000000782', '30000000-0000-0000-0000-000000000003', 'Pneus', null, 'assigned'),
  ('50000000-0000-0000-0000-000000000783', '30000000-0000-0000-0000-000000000002', 'Pneus', null, 'assigned');

insert into public.inspections (repair_order_id, data)
values ('50000000-0000-0000-0000-000000000781', '{"pneus": {"avant_etat": "HS"}}');
select results_eq(
  $$ select description, unit_price from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000781' and kind = 'planned' order by position $$,
  $$ values ('DÉPOSE/REPOSE PNEUMATIQUE X2 (avant)', 36.00::numeric), ('DÉPOSE/REPOSE ROUE X2 (avant)', 36.00),
            ('RECYCLAGE PNEUMATIQUE X2 (avant)', 16.00) $$,
  'PL, pneus avant HS : dépose/repose roue et pneumatique x2, recyclage x2 (barème PL), sans ligne « Remplacement »');

update public.inspections set data = '{"pneus": {"avant_etat": "HS", "arriere_etat": "50"}}'
where repair_order_id = '50000000-0000-0000-0000-000000000781';
select results_eq(
  $$ select description, unit_price from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000781' and description like '%(arrière)' order by description $$,
  $$ values ('DÉPOSE/REPOSE PNEUMATIQUE X4 (arrière)', 72.00::numeric), ('DÉPOSE/REPOSE ROUE X4 (arrière)', 72.00),
            ('RECYCLAGE PNEUMATIQUE X4 (arrière)', 32.00) $$,
  'Pneus arrière à 50 % : les mêmes forfaits x4');
select is((select count(*)::integer from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000781'
           and kind = 'planned'), 6, 'Avant et arrière : 6 forfaits, pas de doublon');

update public.inspections set data = '{"pneus": {"avant_etat": "OK", "arriere_etat": "HS",
                                       "essieux": [{"etat": "HS"}, {"etat": "50"}]}}'
where repair_order_id = '50000000-0000-0000-0000-000000000781';
select is((select count(*)::integer from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000781'
           and description like '%(avant)'), 0, 'Pneus avant redevenus OK : leurs forfaits sont retirés');
select is((select string_agg(description, ' | ' order by description) from public.ro_lines
           where repair_order_id = '50000000-0000-0000-0000-000000000781' and description like 'DÉPOSE/REPOSE ROUE X2%'),
          'DÉPOSE/REPOSE ROUE X2 (essieu 3) | DÉPOSE/REPOSE ROUE X2 (essieu 4)', 'Un lot x2 par essieu ajouté');
select is((select count(*)::integer from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000781'
           and description like 'Remplacement Pneus%'), 0, 'Pas de ligne « Remplacement Pneus » en plus');

-- ---------------------------------------------------------------- Utilitaire et remorque
insert into public.inspections (repair_order_id, data) values
  ('50000000-0000-0000-0000-000000000782', '{"pneus": {"avant_etat": "50"}}'),
  ('50000000-0000-0000-0000-000000000783', '{"pneus": {"arriere_etat": "HS"}}');
select results_eq(
  $$ select unit_price from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000782' order by position $$,
  $$ values (16.00::numeric), (16.00), (8.00) $$,
  'Utilitaire : barème VUL 8 / 8 / 4 € HT par pneu');
select is((select sum(unit_price) from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000783'),
          176.00::numeric, 'Remorque : barème PL (72 + 72 + 32 € HT à l''arrière)');

select * from finish();
rollback;
