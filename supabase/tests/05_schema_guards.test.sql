-- =============================================================================
-- Garde-fous du schéma : empêchent une future migration de réintroduire une faille
-- (table sans RLS, fonction privilégiée mal configurée, accès anonyme involontaire…)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Tables volontairement sans politique (secrets et compteurs, accessibles
-- uniquement par les fonctions métier).
create temporary table locked_tables (name text primary key);
insert into locked_tables values
  ('technician_pins'), ('kiosk_secrets'), ('kiosk_failed_attempts'), ('document_sequences'),
  ('push_outbox');

select is_empty(
  $$ select tablename from pg_tables where schemaname = 'public' and not rowsecurity $$,
  'Toutes les tables du schéma public ont le RLS activé');

select is_empty(
  $$ select t.tablename from pg_tables t
     where t.schemaname = 'public'
       and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)
       and t.tablename not in (select name from locked_tables) $$,
  'Chaque table a au moins une politique d''accès (sauf les tables de secrets listées)');

select is_empty(
  $$ select t.tablename from pg_tables t
     where t.schemaname = 'public'
       and t.tablename in (select name from locked_tables)
       and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename) $$,
  'Les tables de secrets n''ont aucune politique (inaccessibles depuis l''API)');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
       and (has_table_privilege('anon', c.oid, 'SELECT')
            or has_table_privilege('anon', c.oid, 'INSERT')
            or has_table_privilege('anon', c.oid, 'UPDATE')
            or has_table_privilege('anon', c.oid, 'DELETE')) $$,
  'Aucune table ni vue n''est accessible aux visiteurs anonymes');

select is(
  (select string_agg(p.proname::text, ', ' order by p.proname::text)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'public_get_document',
  'Seule public_get_document est exécutable par un visiteur anonyme');

select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%') $$,
  'Toute fonction SECURITY DEFINER fixe son search_path');

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce(c.reloptions @> array['security_invoker=on'], false)
       and not coalesce(c.reloptions @> array['security_invoker=true'], false) $$,
  'Toutes les vues appliquent les droits de l''utilisateur (security_invoker)');

select * from finish();
rollback;
