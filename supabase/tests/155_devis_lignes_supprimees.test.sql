-- =============================================================================
-- Devis repris depuis l'OR : une ligne supprimée du devis ne revient pas, une nouvelle ligne de l'OR arrive
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work) values
  ('50000000-0000-0000-0000-000000000155', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Freins');
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000155', 'planned', 1, 'labor', 'Disques avant', 2),
  ('50000000-0000-0000-0000-000000000155', 'planned', 2, 'labor', 'Plaquettes arrière', 1);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000000155') as quote_id \gset
select is((select count(*)::int from public.quote_lines where quote_id = :'quote_id' and line_type = 'labor'), 2,
          'Devis préparé avec les deux travaux de l''OR');

delete from public.quote_lines where quote_id = :'quote_id' and description = 'Plaquettes arrière';
select is(public.build_quote_from_repair_order('50000000-0000-0000-0000-000000000155'), :'quote_id'::uuid,
          'Reprendre le devis : même devis');
select results_eq(
  format($$ select description from public.quote_lines where quote_id = %L and line_type = 'labor' order by description $$,
         :'quote_id'),
  $$ values ('Disques avant'::text) $$,
  'La ligne supprimée du devis ne revient pas');

-- L'atelier ajoute un travail sur l'OR : il arrive à la reprise
reset role;
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours) values
  ('50000000-0000-0000-0000-000000000155', 'planned', 3, 'labor', 'Flexible de frein', 1);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000000155');
select results_eq(
  format($$ select description from public.quote_lines where quote_id = %L and line_type = 'labor' order by description $$,
         :'quote_id'),
  $$ values ('Disques avant'::text), ('Flexible de frein') $$,
  'Nouveau travail de l''OR ajouté, la ligne retirée toujours absente');

-- Ligne ajoutée à la main au devis puis supprimée : rien de noté
insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity)
values (:'quote_id', 'planned', 9, 'labor', 'Main d''œuvre libre', 90, 1);
delete from public.quote_lines where quote_id = :'quote_id' and description = 'Main d''œuvre libre';
reset role;
select is((select cardinality(removed_ro_line_ids) from public.quotes where id = :'quote_id'), 1,
          'Seules les lignes venues de l''OR sont retenues');

select * from finish();
rollback;
