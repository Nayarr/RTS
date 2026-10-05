-- =============================================================================
-- Sauvegarde : plus d'export de la base depuis l'appli, plus de rappel dans la cloche
-- (sauvegarde automatique chiffrée chaque nuit, voir docs/sauvegarde.md)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select hasnt_function('public', 'export_backup', 'Export de toute la base retiré');
select hasnt_function('public', 'backup_reminder', 'Rappel de sauvegarde retiré');
select hasnt_function('public', 'backup_excluded_tables', 'Liste des tables exclues retirée');
select hasnt_column('public', 'app_settings', 'last_backup_at', 'Date du dernier export retirée');
select is((select count(*)::int from cron.job where jobname = 'rts-backup-reminder'), 0,
          'Rappel quotidien déprogrammé');

select * from finish();
rollback;
