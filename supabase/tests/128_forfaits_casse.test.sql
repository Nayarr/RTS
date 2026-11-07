-- =============================================================================
-- Noms des forfaits : majuscule au début, le reste en minuscules (sigles, marques, références gardés)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

\ir helpers/fixtures.psql

-- Règle d'écriture
select is(public.package_name_case('FORFAIT VIDANGE PL'), 'Forfait vidange PL', 'Sigle PL gardé');
select is(public.package_name_case('FORFAIT REMPLACEMENT PLAQUETTE AR'), 'Forfait remplacement plaquette AR',
          'Sigle AR gardé');
select is(public.package_name_case('REMPLACEMENT POMPE HP'), 'Remplacement pompe HP', 'Sigle HP gardé');
select is(public.package_name_case('CT PTAC 19T'), 'CT PTAC 19T', 'Sigles en tête et mot avec chiffres gardés');
select is(public.package_name_case('FORFAIT DISQUES ET PLAQUETTE AR 002103'), 'Forfait disques et plaquette AR 002103',
          'Référence gardée');
select is(public.package_name_case('DÉPOSE/REPOSE PNEUMATIQUE'), 'Dépose/repose pneumatique', 'Accents et barre');
select is(public.package_name_case('ÉQUILIBRAGE X2'), 'Équilibrage X2', 'Majuscule accentuée au début, X2 gardé');
select is(public.package_name_case('NETTOYAGE FAP + ADBLUE VOLVO'), 'Nettoyage FAP + AdBlue Volvo',
          'Marques à leur écriture d''usage');
select is(public.package_name_case('REMPLACEMENT BARRE D''ACCOUPLEMENT'), 'Remplacement barre d''accouplement',
          'Apostrophe');
select is(public.package_name_case('Forfait vidange VUL Iveco'), 'Forfait vidange VUL Iveco',
          'Nom déjà en minuscules : inchangé');
select is(public.package_name_case('Contrôle HAYON'), 'Contrôle HAYON', 'Nom mélangé : inchangé');

-- Forfaits des pneus créés par les migrations : renommés
select is((select name from public.service_packages where legacy_id = 'pneus:pl:roue'), 'Dépose/repose roue',
          'Forfait pneus renommé');
select is((select name from public.service_packages where legacy_id = 'pneus:pl:equilibrage'), 'Équilibrage',
          'Majuscule accentuée gardée au début');
select is((select count(*)::int from public.service_packages where public.package_name_case(name) <> name), 0,
          'Plus aucun forfait écrit en majuscules');

-- Pneus reconnus quelle que soit l'écriture (anciens devis en majuscules compris)
select is(public.tyre_package_kind('Dépose/repose roue (avant)'), 'roue', 'Nouveau libellé reconnu');
select is(public.tyre_package_kind('DÉPOSE/REPOSE ROUE X4 (arrière)'), 'roue', 'Ancien libellé reconnu');
select is(public.tyre_package_for('Recyclage pneumatique (arrière)', 'pl'),
          (select id from public.service_packages where legacy_id = 'pneus:pl:recyclage'), 'Forfait pneus retrouvé');

-- Reprise : forfait en majuscules, tâches prévues d'un OR ouvert ; devis et OR facturé laissés tels quels
set local session_replication_role = replica;
insert into public.service_packages (id, name, category, standard_hours, price) values
  ('70000000-0000-0000-0000-000000001281', 'FORFAIT VIDANGE PL', 'pl', 1, 120),
  ('70000000-0000-0000-0000-000000001282', 'FORFAIT DISQUES ARRIÈRE', 'pl', 2, 300);
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000001281', 'OR91281', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Vidange', 'assigned'),
  ('50000000-0000-0000-0000-000000001282', 'OR91282', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Vidange', 'invoiced');
insert into public.ro_lines (id, repair_order_id, kind, position, line_type, description, package_id) values
  ('51000000-0000-0000-0000-000000001281', '50000000-0000-0000-0000-000000001281', 'planned', 0, 'package',
   E'FORFAIT VIDANGE PL\nHuile 15W40', '70000000-0000-0000-0000-000000001281'),
  ('51000000-0000-0000-0000-000000001282', '50000000-0000-0000-0000-000000001281', 'planned', 1, 'package',
   'FORFAIT DISQUES essieu 2', '70000000-0000-0000-0000-000000001282'),
  ('51000000-0000-0000-0000-000000001283', '50000000-0000-0000-0000-000000001282', 'planned', 0, 'package',
   'FORFAIT VIDANGE PL', '70000000-0000-0000-0000-000000001281');
insert into public.quotes (id, number, status, client_id, vehicle_id) values
  ('60000000-0000-0000-0000-000000001281', 'DV91281', 'draft', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001');
insert into public.quote_lines (id, quote_id, line_type, description, unit_price, package_id) values
  ('61000000-0000-0000-0000-000000001281', '60000000-0000-0000-0000-000000001281', 'package', 'FORFAIT VIDANGE PL',
   120, '70000000-0000-0000-0000-000000001281');
set local session_replication_role = origin;

select is(public.package_names_to_case(), 2, 'Deux forfaits renommés');
select is((select name from public.service_packages where id = '70000000-0000-0000-0000-000000001281'),
          'Forfait vidange PL', 'Forfait renommé');
select is((select description from public.ro_lines where id = '51000000-0000-0000-0000-000000001281'),
          E'Forfait vidange PL\nHuile 15W40', 'OR ouvert : tâche prévue au nouveau nom, détails gardés');
select is((select description from public.ro_lines where id = '51000000-0000-0000-0000-000000001282'),
          'Forfait disques essieu 2', 'OR ouvert : forfait d''un essieu de remorque au nouveau nom');
select results_eq(
  $$ select (select description from public.ro_lines where id = '51000000-0000-0000-0000-000000001283'),
            (select description from public.quote_lines where id = '61000000-0000-0000-0000-000000001281') $$,
  $$ values ('FORFAIT VIDANGE PL'::text, 'FORFAIT VIDANGE PL'::text) $$,
  'OR facturé et devis : lignes laissées telles quelles');

-- Forfait saisi en majuscules par la direction : même écriture
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
insert into public.service_packages (id, name, category, standard_hours, price)
values ('70000000-0000-0000-0000-000000001283', 'FORFAIT GRAISSAGE SAF', 'pl', 0.5, 40);
select is((select name from public.service_packages where id = '70000000-0000-0000-0000-000000001283'),
          'Forfait graissage SAF', 'Nouveau forfait en majuscules : enregistré en minuscules');

select * from finish();
rollback;
