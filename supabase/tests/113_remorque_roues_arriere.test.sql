-- =============================================================================
-- Remorques : forfaits de l'arrière d'un poids lourd sur tous les essieux, essieu à 4 roues (jumelées)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir helpers/fixtures.psql

insert into public.service_packages (id, name, category, standard_hours, price, trigger_fields, keywords) values
  ('81130000-0000-0000-0000-000000000001', 'Plaquettes avant', 'pl', 1, 100, array['plaquettes_avant'], '{}'),
  ('81130000-0000-0000-0000-000000000002', 'Plaquettes arrière', 'pl', 1, 120, array['plaquettes_arriere'], '{}');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select id as ro from public.create_repair_order('EF-456-GH', 'remorque', null, 'Freinage', null,
  '10000000-0000-0000-0000-0000000000a1', null, null, null, null, true) \gset
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

-- Essieu 1 : plaquettes à 50 %, pneus HS sur 4 roues ; essieu 2 : pneus HS sur 2 roues
insert into public.inspections (repair_order_id, data) values (:'ro', '{"remorque_essieux": [
  {"plaquettes": "50", "pneus_etat": "HS", "pneus_taille": "385/65/22.5", "roues": 4},
  {"pneus_etat": "HS", "pneus_taille": "385/65/22.5"}]}');

select is((select string_agg(description || ' = ' || unit_price::numeric(12,2)::text, ' | ' order by description)
           from public.ro_lines where repair_order_id = :'ro' and line_type = 'package' and description like 'Plaquettes%'),
          'Plaquettes essieu 1 = 120.00', 'Essieu 1 : forfait des plaquettes de l''arrière d''un poids lourd');
select is((select string_agg(distinct quantity::integer::text, ',') from public.ro_lines
           where repair_order_id = :'ro' and line_type = 'package' and description like '% (essieu 1)%'),
          '4', 'Essieu à 4 roues : forfaits des pneus par 4');
select is((select string_agg(distinct quantity::integer::text, ',') from public.ro_lines
           where repair_order_id = :'ro' and line_type = 'package' and description like '% (essieu 2)%'),
          '2', 'Essieu à 2 roues : forfaits des pneus par 2');

-- Le technicien corrige : essieu 1 à 2 roues, essieu 2 à 4 roues ; forfaits déjà prévus mis à jour
update public.inspections set data = '{"remorque_essieux": [
  {"plaquettes": "50", "pneus_etat": "HS", "pneus_taille": "385/65/22.5"},
  {"pneus_etat": "HS", "pneus_taille": "385/65/22.5", "roues": 4}]}' where repair_order_id = :'ro';
select is((select string_agg(distinct quantity::integer::text, ',') from public.ro_lines
           where repair_order_id = :'ro' and line_type = 'package' and description like '% (essieu 1)%'),
          '2', 'Essieu repassé à 2 roues : forfaits des pneus par 2');
select is((select string_agg(distinct quantity::integer::text, ',') from public.ro_lines
           where repair_order_id = :'ro' and line_type = 'package' and description like '% (essieu 2)%'),
          '4', 'Essieu passé à 4 roues : forfaits des pneus par 4');

select * from finish();
rollback;
