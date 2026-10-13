import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { addDocument, askDiagnostic, fetchDocuments } from './api';
import { DiagnosticHelp } from './DiagnosticHelp';
import { KnowledgePage } from './KnowledgePage';

vi.mock('./api', () => ({
  fetchDocuments: vi.fn(),
  addDocument: vi.fn(),
  deleteDocument: vi.fn(),
  askDiagnostic: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('documentation technique', () => {
  it('liste les documents et leur état, ajoute un PDF', async () => {
    vi.mocked(fetchDocuments).mockResolvedValue([
      {
        id: 'd1',
        title: 'Manuel Volvo FH',
        status: 'ready',
        pages: 320,
        chunks: 812,
        error: null,
        created_at: '',
      },
      {
        id: 'd2',
        title: 'Scan garantie',
        status: 'failed',
        pages: 4,
        chunks: 0,
        error: 'Aucun texte : PDF scanné à passer en reconnaissance de texte',
        created_at: '',
      },
    ]);
    vi.mocked(addDocument).mockResolvedValue({ pages: 12, chunks: 30 });
    renderRoutes([{ path: '/', element: <KnowledgePage /> }]);
    const volvo = await screen.findByRole('row', { name: 'Manuel Volvo FH' });
    expect(volvo).toHaveTextContent('Prêt');
    expect(volvo).toHaveTextContent('812');
    expect(screen.getByRole('row', { name: 'Scan garantie' })).toHaveTextContent('PDF scanné');

    await userEvent.type(screen.getByLabelText('Titre (facultatif)'), 'Freins Knorr');
    const pdf = new File(['%PDF-1.4'], 'freins.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Fichier PDF'), pdf);
    await waitFor(() => expect(addDocument).toHaveBeenCalledWith(pdf, 'Freins Knorr'));
  });
});

describe('aide au diagnostic', () => {
  it('symptômes envoyés, pistes et sources affichées', async () => {
    vi.mocked(askDiagnostic).mockResolvedValue({
      answer: '1. Vérifier le niveau d’huile [1]\n2. Contrôler le capteur de pression',
      sources: [{ n: 1, title: 'Manuel Volvo FH', page: 12 }],
    });
    renderRoutes([{ path: '/', element: <DiagnosticHelp repairOrderId="ro1" /> }]);
    await userEvent.click(screen.getByRole('button', { name: /Aide au diagnostic/ }));
    const dialog = screen.getByRole('dialog', { name: 'Aide au diagnostic' });
    const send = within(dialog).getByRole('button', { name: /Demander des pistes/ });
    expect(send).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Symptômes'), 'Voyant huile au ralenti');
    await userEvent.click(send);
    await waitFor(() => expect(askDiagnostic).toHaveBeenCalledWith('ro1', 'Voyant huile au ralenti'));
    const answer = await within(dialog).findByRole('region', { name: 'Pistes de diagnostic' });
    expect(answer).toHaveTextContent('Vérifier le niveau d’huile [1]');
    expect(within(answer).getByRole('list', { name: 'Sources' })).toHaveTextContent(
      '[1] Manuel Volvo FH, page 12',
    );
  });
});
