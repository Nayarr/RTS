import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPdf } from '@/lib/pdf-viewer';
import { PdfPreviewDialog } from './PdfPreviewDialog';

vi.mock('@/lib/pdf-viewer', () => ({ openPdf: vi.fn() }));

const file = { blob: new Blob(['%PDF'], { type: 'application/pdf' }), fileName: 'Devis_D1.pdf' };

function screenWith(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: coarse && query === '(pointer: coarse)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  URL.createObjectURL = vi.fn(() => 'blob:pdf');
  URL.revokeObjectURL = vi.fn();
}

describe('aperçu du PDF', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(openPdf).mockReset();
  });

  it('écran tactile : toutes les pages sont dessinées', async () => {
    screenWith(true);
    const renderPage = vi.fn().mockResolvedValue(undefined);
    vi.mocked(openPdf).mockResolvedValue({ pageCount: 3, renderPage, destroy: vi.fn() });
    render(<PdfPreviewDialog file={file} onClose={vi.fn()} />);
    expect(await screen.findByRole('img', { name: 'Page 3 sur 3' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^Page \d sur 3$/ })).toHaveLength(3);
    // Le dessin part dans un effet, après l'apparition des pages.
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(3));
    expect(screen.queryByTitle('Aperçu du PDF')).toBeNull();
    expect(screen.getByRole('link', { name: 'Télécharger' })).toHaveAttribute('download', 'Devis_D1.pdf');
  });

  it('aperçu impossible : invitation à télécharger', async () => {
    screenWith(true);
    vi.mocked(openPdf).mockRejectedValue(new Error('pdf illisible'));
    render(<PdfPreviewDialog file={file} onClose={vi.fn()} />);
    expect(await screen.findByText(/télécharge le PDF/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Télécharger' })).toBeInTheDocument();
  });

  it('ordinateur : lecteur PDF du navigateur', () => {
    screenWith(false);
    render(<PdfPreviewDialog file={file} onClose={vi.fn()} />);
    expect(screen.getByTitle('Aperçu du PDF')).toHaveAttribute('src', 'blob:pdf');
    expect(openPdf).not.toHaveBeenCalled();
  });
});
