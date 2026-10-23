-- =============================================================================
-- Forfaits des pneus : au devis seulement, une ligne par prestation en quantité (2 à l'avant et
-- par essieu ajouté, 4 à l'arrière) au prix unitaire ; le technicien garde sa ligne
-- « Remplacement Pneus … » non reprise au devis
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

\ir helpers/fixtures.psql

select results_eq(
  $$ select legacy_id, standard_hours from public.service_packages
     where legacy_id like 'pneus:%' and standard_hours > 0 order by 1 $$,
  $$ values ('pneus:pl:roue', 0.50::numeric), ('pneus:vul:roue', 0.50) $$,
  'Barème de la dépose/repose des roues : 30 min (1 h à l''arrière d''un PL, posé par la fiche)');
select is((select bool_and(quote_only) from public.service_packages where legacy_id like 'pneus:%'), true,
          'Forfaits des pneus : devis et facture seulement');

insert into public.repair_orders (id, vehicle_id, requested_work, technician_id, status) values
  ('50000000-0000-0000-0000-000000000781', '30000000-0000-0000-0000-000000000001', 'Pneus',
   '10000000-0000-0000-0000-0000000000a1', 'assigned'),
  ('50000000-0000-0000-0000-000000000782', '30000000-0000-0000-0000-000000000003', 'Pneus', null, 'assigned'),
  ('50000000-0000-0000-0000-000000000783', '30000000-0000-0000-0000-000000000002', 'Pneus', null, 'assigned');

-- ---------------------------------------------------------------- Poids lourd
insert into public.inspections (repair_order_id, data)
values ('50000000-0000-0000-0000-000000000781', '{"pneus": {"avant_etat": "HS"}}');
select set_eq(
  $$ select description, quantity, unit_price, visibility from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000781' and kind = 'planned' and line_type = 'package' $$,
  $$ values ('DÉPOSE/REPOSE PNEUMATIQUE (avant)', 2::numeric, 18.00::numeric, 'quote'),
            ('DÉPOSE/REPOSE ROUE (avant)', 2, 18.00, 'quote'),
            ('RECYCLAGE PNEUMATIQUE (avant)', 2, 8.00, 'quote'), ('ÉQUILIBRAGE (avant)', 2, 35.00, 'quote') $$,
  'PL, pneus avant HS : roue, pneumatique, recyclage et équilibrage en quantité 2 au prix unitaire, au devis seulement');
select results_eq(
  $$ select description, standard_hours, visibility from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000781' and line_type = 'labor' $$,
  $$ values ('Remplacement Pneus avant', 0.50::numeric, 'workshop') $$,
  'Le technicien a sa ligne « Remplacement Pneus avant » (barème 30 min), non reprise au devis');

update public.inspections set data = '{"pneus": {"avant_etat": "HS", "arriere_etat": "50"}}'
where repair_order_id = '50000000-0000-0000-0000-000000000781';
select results_eq(
  $$ select description, quantity, unit_price, standard_hours from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000781' and description like '%(arrière)' order by description $$,
  $$ values ('DÉPOSE/REPOSE PNEUMATIQUE (arrière)', 4::numeric, 18.00::numeric, 0.00::numeric),
            ('DÉPOSE/REPOSE ROUE (arrière)', 4, 18.00, 1.00), ('RECYCLAGE PNEUMATIQUE (arrière)', 4, 8.00, 0.00) $$,
  'Pneus arrière à 50 % : les mêmes prestations en quantité 4, 1 h de barème pour les roues d''un PL');
select is((select standard_hours from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000781'
           and description = 'Remplacement Pneus arrière'), 1.00::numeric, 'Remplacement Pneus arrière d''un PL : barème 1 h');

-- Le technicien n'estime que ses lignes, pas les forfaits du devis
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice
select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000781') $$,
  '%Temps estimé manquant : 2 tâches à prévoir%', 'Temps à estimer : les 2 lignes « Remplacement Pneus » seulement');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------- Devis puis OR issu du devis
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000000781') as quote \gset
select is((select count(*)::integer from public.quote_lines where quote_id = :'quote' and description like 'Remplacement Pneus%'),
          0, 'Devis : pas de ligne « Remplacement Pneus »');
select is((select sum(net_ht) from public.quote_lines where quote_id = :'quote' and line_type = 'package'),
          334.00::numeric, 'Devis : les 7 forfaits des pneus (158 € HT à l''avant, 176 € HT à l''arrière)');
select public.set_quote_response(:'quote', 'accepted');
select public.create_repair_order_from_quote(:'quote') as ro2 \gset
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::integer from public.ro_lines where repair_order_id = :'ro2' and visibility = 'quote'), 7,
          'OR du devis : les forfaits des pneus restent au devis et à la facture, cachés au technicien');
select set_eq(
  format($$ select description, standard_hours from public.ro_lines where repair_order_id = %L and visibility = 'workshop' $$, :'ro2'),
  $$ values ('Remplacement Pneus avant', 0.50::numeric), ('Remplacement Pneus arrière', 1.00) $$,
  'OR du devis : une tâche « Remplacement Pneus … » par position pour le technicien');
select ok((select requested_work not like '%DÉPOSE%' from public.repair_orders where id = :'ro2'),
          'Travaux demandés de l''OR : sans les forfaits du devis');

-- ---------------------------------------------------------------- Essieux, retour à OK
update public.inspections set data = '{"pneus": {"avant_etat": "OK", "arriere_etat": "50",
                                       "essieux": [{"etat": "HS"}, {"etat": "50"}]}}'
where repair_order_id = '50000000-0000-0000-0000-000000000781';
select is((select count(*)::integer from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000781'
           and line_type = 'package' and description like '%(avant)'), 0, 'Pneus avant redevenus OK : leurs forfaits sont retirés');
select is((select string_agg(description, ' | ' order by description) from public.ro_lines
           where repair_order_id = '50000000-0000-0000-0000-000000000781'
             and (description like 'DÉPOSE/REPOSE ROUE (essieu%' or description like 'Remplacement Pneus essieu%')),
          'DÉPOSE/REPOSE ROUE (essieu 3) | DÉPOSE/REPOSE ROUE (essieu 4) | Remplacement Pneus essieu 3 | Remplacement Pneus essieu 4',
          'Chaque essieu ajouté : son lot de forfaits au devis et sa ligne pour le technicien');

-- ---------------------------------------------------------------- Utilitaire et remorque
insert into public.inspections (repair_order_id, data) values
  ('50000000-0000-0000-0000-000000000782', '{"pneus": {"avant_etat": "50", "arriere_etat": "HS"}}'),
  ('50000000-0000-0000-0000-000000000783', '{"pneus": {"avant_etat": "HS", "arriere_etat": "HS"}}');
select results_eq(
  $$ select sum(unit_price * quantity) filter (where line_type = 'package'),
            max(standard_hours) filter (where description = 'Remplacement Pneus arrière')
     from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000782' $$,
  $$ values (120.00::numeric, 0.50::numeric) $$,
  'Utilitaire : barème VUL (40 € HT avant, 80 € HT arrière), sans équilibrage, 30 min à l''arrière');
select is((select sum(unit_price * quantity) from public.ro_lines where repair_order_id = '50000000-0000-0000-0000-000000000783'
           and line_type = 'package'),
          264.00::numeric, 'Remorque : barème PL (88 € HT à l''avant, 176 € HT à l''arrière), sans équilibrage');

select * from finish();
rollback;
