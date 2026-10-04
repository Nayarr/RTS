-- =============================================================================
-- Aucun tiret cadratin dans les textes fabriqués par la base
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc like '%' || chr(8212) || '%'),
  0, 'Aucune fonction ne produit de tiret cadratin');
select is(
  (select count(*)::int from pg_views where schemaname = 'public' and definition like '%' || chr(8212) || '%'),
  0, 'Aucune vue ne produit de tiret cadratin');

select * from finish();
rollback;
