import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from '@/lib/csv';
import { renderRoutes } from '@/test/render';
import {
  ARCHIVE_NOTICE,
  createFiscalArchive,
  fetchFiscalArchiveContent,
  fetchFiscalArchives,
  verifyFiscalJournal,
  type FiscalArchive,
} from './fiscal-api';
import type * as FiscalApi from './fiscal-api';
import { FiscalPanel } from './FiscalPanel';

vi.mock('./fiscal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof FiscalApi>()),
  createFiscalArchive: vi.fn(),
  fetchFiscalArchiveContent: vi.fn(),
  fetchFiscalArchives: vi.fn(),
  verifyFiscalJournal: vi.fn(),
}));
vi.mock('@/lib/csv', () => ({ downloadFile: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const october: FiscalArchive = {
  id: 'a1',
  period_from: '2026-10-01',
  period_to: '2026-10-31',
  entries_count: 12,
  sha256: '5e882940a58844f73bac660eeb8a07e97ded7585c4f3e9e4b7ea33b1ee3e5d96',
  automatic: true,
  created_at: '2026-11-01T03:00:00Z',
};

const render = () => renderRoutes([{ path: '/', element: <FiscalPanel /> }]);

describe('Réglages › Conformité fiscale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchFiscalArchives).mockResolvedValue([october]);
  });

  it('liste les archives avec leur période, leur nombre d’écritures et leur empreinte', async () => {
    render();
    const list = await screen.findByRole('list', { name: 'Archives fiscales' });
    expect(list).toHaveTextContent(/Du 01\/10\/2026 au 31\/10\/2026/);
    expect(list).toHaveTextContent('12 écritures · automatique · créée le 01/11/2026');
    expect(list).toHaveTextContent(`SHA-256 ${october.sha256}`);
  });

  it('aucune archive : le dit', async () => {
    vi.mocked(fetchFiscalArchives).mockResolvedValue([]);
    render();
    expect(await screen.findByText('Aucune archive pour l’instant.')).toBeInTheDocument();
  });

  it('vérification réussie : journal intègre, nombre d’écritures et dernière empreinte', async () => {
    vi.mocked(verifyFiscalJournal).mockResolvedValue({
      ok: true,
      ecritures: 4,
      derniere_empreinte: 'abc123',
      verifie_le: '2026-11-17T12:00:00Z',
      erreurs: [],
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Vérifier le journal' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Journal intègre · 4 écritures vérifiées');
    expect(status).toHaveTextContent('Dernière empreinte : abc123');
  });

  it('anomalies : chacune listée avec son écriture et son document', async () => {
    vi.mocked(verifyFiscalJournal).mockResolvedValue({
      ok: false,
      ecritures: 9,
      derniere_empreinte: 'def456',
      verifie_le: '2026-11-17T12:00:00Z',
      erreurs: [
        { seq: 3, probleme: 'Document modifié', document: 'F11890' },
        { seq: null, probleme: 'Document absent du journal', document: 'AV4' },
      ],
    });
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Vérifier le journal' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Anomalies détectées · 2 sur 9 écritures');
    const items = within(screen.getByRole('list', { name: 'Anomalies du journal' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Écriture 3 · Document modifié (F11890)');
    expect(items[1]).toHaveTextContent(/^Document absent du journal \(AV4\)$/);
  });

  it('téléchargement : le texte de l’archive tel quel, en JSON nommé par sa période', async () => {
    vi.mocked(fetchFiscalArchiveContent).mockResolvedValue('{"format": "rts-archive-fiscale/1"}');
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Télécharger l’archive du 01/10/2026 au 31/10/2026' }),
    );
    await waitFor(() =>
      expect(downloadFile).toHaveBeenCalledWith(
        '{"format": "rts-archive-fiscale/1"}',
        'archive-fiscale-rts-2026-10-01-au-2026-10-31.json',
        'application/json;charset=utf-8',
      ),
    );
    expect(fetchFiscalArchiveContent).toHaveBeenCalledWith('a1');
  });

  it('notice : texte en français avec la formule de contrôle des empreintes', async () => {
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Notice des archives' }));
    expect(downloadFile).toHaveBeenCalledWith(
      ARCHIVE_NOTICE,
      'notice-archives-fiscales-rts.txt',
      'text/plain;charset=utf-8',
    );
    expect(ARCHIVE_NOTICE).toContain(
      'empreinte_precedente|seq|type|document_id|numero|montant_ttc|date|auteur_id|contenu',
    );
  });

  it('archiver une période : l’exercice précédent proposé, la liste se recharge', async () => {
    vi.mocked(createFiscalArchive).mockResolvedValue();
    render();
    const year = new Date().getFullYear() - 1;
    expect(await screen.findByLabelText('Du')).toHaveValue(`${year}-01-01`);
    expect(screen.getByLabelText('Au')).toHaveValue(`${year}-12-31`);
    await userEvent.click(screen.getByRole('button', { name: 'Archiver la période' }));
    await waitFor(() => expect(createFiscalArchive).toHaveBeenCalledWith(`${year}-01-01`, `${year}-12-31`));
    expect(toast.success).toHaveBeenCalledWith('Archive créée');
    await waitFor(() => expect(fetchFiscalArchives).toHaveBeenCalledTimes(2));
  });

  it('période déjà archivée : le refus de la base s’affiche', async () => {
    vi.mocked(createFiscalArchive).mockRejectedValue(new Error('Cette période est déjà archivée'));
    render();
    await userEvent.click(await screen.findByRole('button', { name: 'Archiver la période' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cette période est déjà archivée'));
  });
});
