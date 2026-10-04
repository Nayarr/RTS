-- =============================================================================
-- RTS Atelier : Purge des fichiers dans Cloudflare R2
--
-- Chaque nuit :
--   1. mark_orphan_files()     : les fichiers envoyés mais rattachés à rien depuis 7 jours
--                                (photo abandonnée, logo remplacé…) sont marqués supprimés ;
--   2. Edge Function « files-purge » : efface de R2 les objets marqués supprimés
--                                (photos de pointage expirées, envois jamais confirmés,
--                                orphelins…) et note la date de purge.
-- La ligne de la table files est conservée (historique), seul l'objet R2 disparaît.
--
-- Appel de l'Edge Function par pg_cron via pg_net : l'adresse du projet et le secret
-- partagé avec la fonction sont lus dans Vault (project_url, cron_secret). Sans eux
-- (projet pas encore configuré), l'appel est simplement ignoré.
-- =============================================================================

alter table public.files add column purged_at timestamptz;
comment on column public.files.purged_at is 'Objet effacé de R2 (la ligne est conservée pour l''historique).';

create index files_to_purge_idx on public.files (deleted_at) where deleted_at is not null and purged_at is null;

-- ---------------------------------------------------------------------------
-- Fichiers orphelins : confirmés, non supprimés, plus référencés par aucune colonne
-- (toutes les clés étrangères vers files sont lues dans le catalogue : une nouvelle
-- table qui référence files est prise en compte sans modifier cette fonction).
-- ---------------------------------------------------------------------------
create or replace function public.mark_orphan_files(p_grace interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refs text;
  v_count integer;
begin
  select string_agg(
           format('exists (select 1 from %I.%I r where r.%I = f.id)', n.nspname, c.relname, a.attname),
           ' or ')
    into v_refs
  from pg_catalog.pg_constraint k
  join pg_catalog.pg_class c on c.oid = k.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
  where k.contype = 'f' and k.confrelid = 'public.files'::regclass and cardinality(k.conkey) = 1;

  execute format(
    'update public.files f set deleted_at = now()
      where f.deleted_at is null and f.uploaded_at is not null and f.uploaded_at < now() - $1
        and not (%s)',
    coalesce(v_refs, 'false'))
  using p_grace;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Utilisées par l'Edge Function (clé de service) : lot d'objets à effacer, puis confirmation.
-- ---------------------------------------------------------------------------
create or replace function public.files_to_purge(p_limit integer default 100)
returns table (id uuid, bucket text, storage_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.bucket, f.storage_key
  from public.files f
  where f.deleted_at is not null and f.purged_at is null
  order by f.deleted_at
  limit least(greatest(p_limit, 1), 500);
$$;

create or replace function public.mark_files_purged(p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with purged as (
    update public.files set purged_at = now()
    where id = any (p_ids) and deleted_at is not null and purged_at is null
    returning 1
  )
  select count(*)::integer from purged;
$$;

-- ---------------------------------------------------------------------------
-- Appel d'une Edge Function depuis une tâche planifiée (pg_net, asynchrone).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise notice 'pg_net indisponible : les tâches planifiées n''appelleront pas les Edge Functions';
  end if;
end;
$$;

create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request bigint;
begin
  if to_regnamespace('vault') is null or to_regnamespace('net') is null then
    raise notice 'Vault ou pg_net indisponible : % non appelée', p_name;
    return null;
  end if;
  execute 'select max(decrypted_secret) filter (where name = ''project_url''),
                  max(decrypted_secret) filter (where name = ''cron_secret'')
           from vault.decrypted_secrets where name in (''project_url'', ''cron_secret'')'
    into v_url, v_secret;
  if v_url is null or v_secret is null then
    raise notice 'Secrets project_url / cron_secret absents de Vault : % non appelée', p_name;
    return null;
  end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
    into v_request
    using rtrim(v_url, '/') || '/functions/v1/' || p_name, p_body,
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret);
  return v_request;
end;
$$;

-- Tâche de nuit : orphelins, puis effacement dans R2.
create or replace function public.purge_files()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orphans integer;
begin
  v_orphans := public.mark_orphan_files();
  perform public.invoke_edge_function('files-purge');
  return v_orphans;
end;
$$;

revoke execute on function
  public.mark_orphan_files(interval),
  public.files_to_purge(integer),
  public.mark_files_purged(uuid[]),
  public.invoke_edge_function(text, jsonb),
  public.purge_files()
from public, anon, authenticated;

grant execute on function public.files_to_purge(integer), public.mark_files_purged(uuid[]) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Après la purge des photos de pointage (2 h UTC).
    perform cron.schedule('rts-purge-files', '30 2 * * *', 'select public.purge_files()');
  else
    raise notice 'pg_cron indisponible : purge des fichiers non planifiée';
  end if;
end;
$$;
