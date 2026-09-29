import { describe, expect, it, vi } from 'vitest';
import { downloadFile } from '@/lib/csv';
import {
  backupAge,
  backupFileName,
  backupIsDue,
  backupRowCount,
  downloadBackup,
  type BackupFile,
} from './backup';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/lib/csv', () => ({ downloadFile: vi.fn() }));

const file: BackupFile = {
  app: 'RTS Atelier',
  format: 1,
  exported_at: '2026-09-29T08:00:00Z',
  schema_version: '20261019090000',
  tables: { clients: [{ id: 1 }, { id: 2 }], invoices: [{ id: 3 }], quotes: [] },
};

describe('sauvegarde', () => {
  it('nom du fichier daté du jour à Paris', () => {
    expect(backupFileName(new Date('2026-09-29T23:30:00Z'))).toBe('sauvegarde_rts_atelier_2026-09-30.json');
  });

  it('compte les lignes sauvegardées', () => {
    expect(backupRowCount(file)).toBe(3);
  });

  it('ancienneté de la dernière sauvegarde', () => {
    const now = new Date('2026-09-29T10:00:00Z');
    expect(backupAge(null, now)).toBe('Aucune sauvegarde pour l’instant');
    expect(backupAge('2026-09-29T07:00:00Z', now)).toMatch(/^Dernière sauvegarde aujourd’hui \(29\/09\/2026/);
    expect(backupAge('2026-09-28T07:00:00Z', now)).toMatch(/^Dernière sauvegarde hier/);
    expect(backupAge('2026-09-20T07:00:00Z', now)).toMatch(/^Dernière sauvegarde il y a 9 jours/);
  });

  it('à refaire après 7 jours', () => {
    const now = new Date('2026-09-29T10:00:00Z');
    expect(backupIsDue(null, now)).toBe(true);
    expect(backupIsDue('2026-09-25T10:00:00Z', now)).toBe(false);
    expect(backupIsDue('2026-09-21T10:00:00Z', now)).toBe(true);
  });

  it('télécharge le fichier JSON renvoyé par la base', async () => {
    rpc.mockResolvedValue({ data: file, error: null });
    await expect(downloadBackup()).resolves.toEqual(file);
    expect(rpc).toHaveBeenCalledWith('export_backup');
    const [content, name, type] = vi.mocked(downloadFile).mock.calls[0]!;
    expect(JSON.parse(content)).toEqual(file);
    expect(name).toMatch(/^sauvegarde_rts_atelier_\d{4}-\d{2}-\d{2}\.json$/);
    expect(type).toBe('application/json');
  });

  it('refus de la base : rien n’est téléchargé', async () => {
    vi.mocked(downloadFile).mockClear();
    rpc.mockResolvedValue({ data: null, error: new Error('Accès refusé') });
    await expect(downloadBackup()).rejects.toThrow('Accès refusé');
    expect(downloadFile).not.toHaveBeenCalled();
  });
});
