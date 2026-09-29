-- =============================================================================
-- RTS Atelier — Sauvegarde téléchargeable par la direction
--
-- Reprise du bouton « Sauvegarde » de l'ancienne appli : toute la base dans un
-- fichier JSON, en plus des sauvegardes automatiques de Supabase. La date de la
-- dernière sauvegarde est retenue ; la cloche la rappelle après 7 jours.
-- =============================================================================

alter table public.app_settings add column last_backup_at timestamptz;
comment on column public.app_settings.last_backup_at is 'Dernière sauvegarde téléchargée par la direction.';

-- Tables jamais exportées : secrets (PIN, code de sortie de la borne), données techniques.
create or replace function public.backup_excluded_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['technician_pins', 'kiosk_secrets', 'kiosk_failed_attempts', 'push_subscriptions',
               'notification_reads', 'repair_order_seen'];
$$;

-- Toutes les autres tables du schéma public, ligne par ligne (réservé à la direction).
create or replace function public.export_backup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_version text;
begin
  if not public.is_direction() then
    raise exception 'Accès refusé : sauvegarde réservée à la direction' using errcode = '42501';
  end if;

  for v_table in
    select c.relname::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname::text <> all (public.backup_excluded_tables())
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_table)
      into v_rows;
    v_tables := v_tables || jsonb_build_object(v_table, v_rows);
  end loop;

  -- Version du schéma : indispensable pour recharger la sauvegarde dans la bonne structure.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version) from supabase_migrations.schema_migrations' into v_version;
  end if;

  update public.app_settings set last_backup_at = now() where id;

  return jsonb_build_object(
    'app', 'RTS Atelier',
    'format', 1,
    'exported_at', now(),
    'schema_version', v_version,
    'tables', v_tables
  );
end;
$$;

-- Rappel dans la cloche : aucune sauvegarde depuis 7 jours (une alerte par semaine au plus).
create or replace function public.backup_reminder()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
  v_count integer;
begin
  select last_backup_at into v_last from public.app_settings;
  if v_last is not null and v_last > now() - interval '7 days' then
    return 0;
  end if;

  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  values ('direction', 'backup_due', 'Sauvegarde à faire',
          case when v_last is null then 'Aucune sauvegarde téléchargée pour l''instant.'
               else 'Dernière sauvegarde le ' || to_char(v_last at time zone 'Europe/Paris', 'DD/MM/YYYY') || '.' end
            || ' Réglages, onglet « Sauvegarde ».',
          '/reglages?onglet=sauvegarde',
          'backup-due-' || to_char(public.paris_date(now()), 'IYYY-IW'))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.backup_excluded_tables(), public.export_backup(), public.backup_reminder()
  from public, anon, authenticated;
grant execute on function public.export_backup() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-backup-reminder', '0 7 * * *', 'select public.backup_reminder()');
  else
    raise notice 'pg_cron indisponible : rappel de sauvegarde non planifié';
  end if;
end;
$$;
