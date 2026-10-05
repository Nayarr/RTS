-- =============================================================================
-- RTS Atelier : plus d'export de la base depuis l'appli, plus de rappel de sauvegarde
--
-- La sauvegarde est désormais automatique, chaque nuit, chiffrée chez o2switch
-- (docs/sauvegarde.md). Le bouton « Télécharger la sauvegarde » mettait toute la
-- base en clair sur un ordinateur : il disparaît, avec le rappel dans la cloche.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'rts-backup-reminder') then
    perform cron.unschedule('rts-backup-reminder');
  end if;
end;
$$;

drop function public.backup_reminder();
drop function public.export_backup();
drop function public.backup_excluded_tables();

-- Rappels déjà dans la cloche : ils renvoient vers un onglet qui n'existe plus.
delete from public.notifications where type = 'backup_due';

alter table public.app_settings drop column last_backup_at;
