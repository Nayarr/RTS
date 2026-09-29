import { downloadFile } from '@/lib/csv';
import { supabase } from '@/lib/supabase';

export interface BackupFile {
  app: string;
  format: number;
  exported_at: string;
  schema_version: string | null;
  tables: Record<string, unknown[]>;
}

/** Nom du fichier, comme dans l'ancienne appli (date du jour à Paris). */
export const backupFileName = (date = new Date()) =>
  `sauvegarde_rts_atelier_${date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })}.json`;

/** Nombre total de lignes sauvegardées (affiché dans la confirmation). */
export const backupRowCount = (backup: BackupFile) =>
  Object.values(backup.tables).reduce((total, rows) => total + rows.length, 0);

/** Toute la base (direction) dans un fichier JSON téléchargé sur l'appareil. */
export async function downloadBackup(): Promise<BackupFile> {
  const { data, error } = await supabase.rpc('export_backup');
  if (error) throw error;
  const backup = data as unknown as BackupFile;
  downloadFile(JSON.stringify(backup), backupFileName(), 'application/json');
  return backup;
}

/** « il y a 3 jours », « aujourd'hui »… pour la dernière sauvegarde. */
export function backupAge(lastBackupAt: string | null, now = new Date()): string {
  if (!lastBackupAt) return 'Aucune sauvegarde pour l’instant';
  const date = new Date(lastBackupAt);
  const day = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const days = Math.round((Date.parse(day(now)) - Date.parse(day(date))) / 86_400_000);
  const when = days <= 0 ? 'aujourd’hui' : days === 1 ? 'hier' : `il y a ${days} jours`;
  return `Dernière sauvegarde ${when} (${date.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  })})`;
}

export const backupIsDue = (lastBackupAt: string | null, now = new Date()) =>
  !lastBackupAt || now.getTime() - new Date(lastBackupAt).getTime() > 7 * 86_400_000;
