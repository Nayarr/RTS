import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fetchFileUrls, uploadFile } from './api';
import type * as FilesApi from './api';
import { ImageUploadButton } from './ImageUploadButton';
import { StoredImage } from './StoredImage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  fetchFileUrls: vi.fn(),
  uploadFile: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const renderWithQuery = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );

describe('StoredImage', () => {
  it('affiche l’image via son URL signée', async () => {
    vi.mocked(fetchFileUrls).mockResolvedValue({ f1: 'https://r2.example/f1.jpg' });
    renderWithQuery(<StoredImage fileId="f1" alt="Logo" />);
    expect(await screen.findByRole('img', { name: 'Logo' })).toHaveAttribute(
      'src',
      'https://r2.example/f1.jpg',
    );
  });

  it('indique une image indisponible (fichier non autorisé ou supprimé)', async () => {
    vi.mocked(fetchFileUrls).mockResolvedValue({});
    renderWithQuery(<StoredImage fileId="f1" alt="Logo" />);
    expect(await screen.findByRole('img', { name: 'Logo (indisponible)' })).toBeInTheDocument();
  });

  it('sans fichier : pas d’appel, emplacement vide', () => {
    renderWithQuery(<StoredImage fileId={null} alt="Logo" />);
    expect(screen.getByRole('img', { name: 'Logo (indisponible)' })).toBeInTheDocument();
    expect(fetchFileUrls).not.toHaveBeenCalled();
  });
});

describe('ImageUploadButton', () => {
  it('envoie la photo choisie et renvoie son identifiant', async () => {
    vi.mocked(uploadFile).mockResolvedValue('f9');
    const onUploaded = vi.fn();
    renderWithQuery(<ImageUploadButton category="logo" onUploaded={onUploaded} />);

    const photo = new File(['abc'], 'logo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByTestId('upload-logo'), photo);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('f9'));
    expect(uploadFile).toHaveBeenCalledWith(photo, { category: 'logo' });
  });
});
