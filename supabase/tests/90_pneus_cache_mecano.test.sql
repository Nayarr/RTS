-- =============================================================================
-- Forfaits des pneus cachés au technicien même sans lien vers leur forfait
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

select is(public.tyre_package_kind('DÉPOSE/REPOSE PNEUMATIQUE X4 (arrière)'), 'pneu', 'Ancien forfait X4 reconnu');
select is(public.tyre_package_kind('RECYCLAGE PNEUMATIQUE (avant)'), 'recyclage', 'Forfait unitaire reconnu');
select is(public.tyre_package_kind('Remplacement Pneus arrière'), null, 'Tâche du technicien : pas un forfait');
select is(public.tyre_package_for('DÉPOSE/REPOSE ROUE X4 (arrière)', 'vul'),
          (select id from public.service_packages where legacy_id = 'pneus:vul:roue'),
          'Forfait unitaire de l’utilitaire');

-- Devis d'avant les forfaits en quantité : lignes de l'arrière sans lien vers un forfait
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select id as quote from public.create_quote('Transports Dupont', 'ab 123 cd', 'pl') \gset
insert into public.quote_lines (quote_id, position, line_type, description, unit_price, quantity)
values (:'quote', 0, 'package', 'DÉPOSE/REPOSE PNEUMATIQUE X4 (arrière)', 72, 1),
       (:'quote', 1, 'package', 'DÉPOSE/REPOSE ROUE X4 (arrière)', 72, 1),
       (:'quote', 2, 'package', 'RECYCLAGE PNEUMATIQUE X4 (arrière)', 32, 1),
       (:'quote', 3, 'labor', 'Vidange moteur', 90, 1);
select public.set_quote_response(:'quote', 'accepted');
select public.create_repair_order_from_quote(:'quote', null) as ro \gset

select is((select requested_work from public.repair_orders where id = :'ro'), 'Vidange moteur',
          'Résumé de l’OR sans les forfaits des pneus');
select is((select count(*)::int from public.ro_lines
           where repair_order_id = :'ro' and line_type = 'package' and visibility = 'quote' and package_id is not null),
          3, 'Forfaits des pneus rattachés et cachés au technicien');
select is((select string_agg(description || ' ' || standard_hours, ', ') from public.ro_lines
           where repair_order_id = :'ro' and visibility = 'workshop'),
          'Remplacement Pneus arrière 1.00', 'Tâche « Remplacement Pneus arrière » du technicien (1 h)');
select is((select sum(unit_price * quantity) from public.ro_lines
           where repair_order_id = :'ro' and visibility = 'quote'),
          176.00, 'Prix du devis gardés pour la facture');

-- Devis repris dans un OR existant : forfaits sans lien cachés aussi
select id as standalone from public.create_quote('Transports Dupont', 'ab 123 cd', 'pl') \gset
insert into public.quote_lines (quote_id, position, line_type, description, unit_price, quantity)
values (:'standalone', 0, 'package', 'DÉPOSE/REPOSE PNEUMATIQUE X2 (avant)', 36, 1);
select public.merge_quote_into_repair_order(:'standalone', :'ro');
select is((select visibility from public.ro_lines
           where repair_order_id = :'ro' and description = 'DÉPOSE/REPOSE PNEUMATIQUE X2 (avant)'),
          'quote', 'Forfait sans lien repris dans un OR : caché au technicien');

select * from finish();
rollback;
