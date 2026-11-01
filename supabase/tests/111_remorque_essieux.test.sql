-- =============================================================================
-- Remorques : fiche de contrôle par essieu (freins et pneus), essieu vide inexistant,
-- mêmes forfaits nommés par essieu
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

insert into public.service_packages (id, name, category, standard_hours, price, trigger_fields, keywords) values
  ('81100000-0000-0000-0000-000000000001', 'Disque et plaquette avant', 'pl', 3, 300, array['disques_avant', 'plaquettes_avant'], '{}'),
  ('81100000-0000-0000-0000-000000000002', 'Plaquettes arrière', 'pl', 1, 120, array['plaquettes_arriere'], '{}'),
  ('81100000-0000-0000-0000-000000000003', 'Disque et plaquette arrière', 'pl', 3, 320, array['disques_arriere', 'plaquettes_arriere'], '{}');

-- Remorque : 3 essieux, le troisième laissé vide
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select id as ro from public.create_repair_order('EF-456-GH', 'remorque', null, 'Freinage', null,
  '10000000-0000-0000-0000-0000000000a1', null, null, null, null, true) \gset
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.inspections (repair_order_id, data) values (:'ro', '{"remorque_essieux": [
  {"disques": "HS", "plaquettes": "HS", "pneus_etat": "OK"},
  {"plaquettes": "50", "pneus_etat": "HS"},
  {}]}');

select is(public.inspection_missing_points((select data from public.inspections where repair_order_id = :'ro'), 'remorque'),
          7, 'Fiche complète : disques de l''essieu 2 et les 6 contrôles, l''essieu 3 vide ne compte pas');
select is(public.inspection_missing_points('{}'::jsonb, 'remorque'), 9,
          'Fiche vide : le premier essieu (3 points) et les contrôles');

select is((select string_agg(description || ' = ' || (unit_price * quantity)::numeric(12,2)::text, ' | ' order by description)
           from public.ro_lines where repair_order_id = :'ro' and line_type = 'package'),
          'DÉPOSE/REPOSE PNEUMATIQUE (essieu 2) = 36.00 | DÉPOSE/REPOSE ROUE (essieu 2) = 36.00 | '
          || 'Disque et plaquette essieu 1 = 300.00 | Plaquettes essieu 2 = 120.00 | RECYCLAGE PNEUMATIQUE (essieu 2) = 16.00',
          'Mêmes forfaits nommés par essieu : freins (essieu 1 : avant, suivants : arrière), pneus 2 par essieu sans équilibrage');
select is((select string_agg(description, ' | ' order by description) from public.ro_lines
           where repair_order_id = :'ro' and line_type = 'labor' and kind = 'planned'),
          'Remplacement Pneus essieu 2', 'Pneus HS : ligne du technicien pour l''essieu');

select throws_like(format($$ select public.complete_repair_order(%L) $$, :'ro'),
  '%Taille des pneus essieu 2 obligatoire (HS)%', 'Pneus HS : taille de l''essieu obligatoire');

-- Essieu 1 réparé, essieu 2 retiré : forfaits retirés, essieu 3 rempli
update public.inspections set data = '{"remorque_essieux": [
  {"disques": "OK", "plaquettes": "OK", "pneus_etat": "OK"},
  {"disques": "OK", "plaquettes": "OK", "pneus_etat": "OK"}]}' where repair_order_id = :'ro';
select is((select count(*)::integer from public.ro_lines where repair_order_id = :'ro' and line_type = 'package'), 0,
          'Plus rien à refaire : les forfaits des essieux sont retirés');

update public.inspections set data = '{"remorque_essieux": [
  {"disques": "OK", "plaquettes": "OK", "pneus_etat": "OK"},
  {"disques": "OK", "plaquettes": "OK", "pneus_etat": "OK"},
  {"disques": "50", "plaquettes": "OK", "pneus_etat": "OK"}]}' where repair_order_id = :'ro';
select is((select string_agg(description, ' | ' order by description) from public.ro_lines
           where repair_order_id = :'ro' and line_type = 'package'),
          'Disque et plaquette essieu 3', 'Essieu 3 : forfait de l''arrière, nommé « essieu 3 »');

-- Sans forfait des disques : ligne « Remplacement … essieu N »
reset role;
update public.service_packages set is_active = false where id = '81100000-0000-0000-0000-000000000003';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.inspections set data = jsonb_set(data, '{remorque_essieux,1,disques}', '"HS"') where repair_order_id = :'ro';
select is((select count(*)::integer from public.ro_lines
           where repair_order_id = :'ro' and description = 'Remplacement Disques de frein essieu 2'), 1,
          'Disques HS sans forfait : ligne de remplacement de l''essieu');

-- Nom d'un forfait pour un essieu
reset role;
select is(public.trailer_axle_label('Disque et plaquette avant', 2), 'Disque et plaquette essieu 2',
          '« avant » remplacé par l''essieu');
select is(public.trailer_axle_label('FREINAGE ARRIÈRE', 3), 'FREINAGE essieu 3', '« arrière » remplacé, majuscules comprises');
select is(public.trailer_axle_label('Freinage complet', 1), 'Freinage complet essieu 1', 'Sinon l''essieu est ajouté');

select * from finish();
rollback;
