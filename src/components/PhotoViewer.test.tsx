import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileSlug, photoFileName, wrapIndex, type ViewerPhoto } from './photo-viewer';
import { PhotoViewer } from './PhotoViewer';

const photos: ViewerPhoto[] = [
  { id: 'a', url: 'https://r2/a.jpg', label: 'Face avant', takenAt: '2026-09-30T12:12:00Z', author: 'Mouaz' },
  { id: 'b', url: 'https://r2/b.jpg', label: 'Pièces', takenAt: '2026-09-30T13:00:00Z' },
  { id: 'c', url: 'https://r2/c.jpg', label: 'Pièces', takenAt: '2026-09-30T13:05:00Z' },
];

afterEach(() => vi.restoreAllMocks());

describe('nom du fichier téléchargé', () => {
  it('plaque_libellé.jpg, sans accents ; numéroté quand le libellé se répète', () => {
    expect(fileSlug('Rapport diagnostique valise')).toBe('rapport-diagnostique-valise');
    expect(photoFileName('fq-289-fj', photos, 0)).toBe('FQ-289-FJ_face-avant.jpg');
    expect(photoFileName('FQ-289-FJ', photos, 2)).toBe('FQ-289-FJ_pieces-2.jpg');
    expect(photoFileName(null, photos, 1)).toBe('pieces-1.jpg');
  });

  it('navigation en boucle', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(0, 0)).toBe(0);
  });
});

describe('visionneuse', () => {
  const setup = (startIndex = 0) =>
    render(
      <PhotoViewer
        photos={photos}
        startIndex={startIndex}
        plate="FQ-289-FJ"
        title="Photos de l’OR"
        reference="OR00007"
        onClose={vi.fn()}
      />,
    );

  it('photo en grand, compteur, libellé, date et auteur', () => {
    setup();
    expect(screen.getByRole('dialog', { name: /Photos de l’OR/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Face avant' })).toHaveAttribute('src', 'https://r2/a.jpg');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText('Photo 1 sur 3 · prise le 30/09/2026 à 14:12 par Mouaz')).toBeInTheDocument();
  });

  it('flèches, clavier et vignettes', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Photo suivante' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pièces (2 sur 3)' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pièces (2 sur 3)' })).toHaveAttribute('aria-current', 'true');
  });

  it('télécharger : fichier nommé plaque_libellé.jpg', async () => {
    const blob = new Blob(['jpeg']);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    } as Response);
    const createUrl = vi.fn(() => 'blob:photo');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('FQ-289-FJ_pieces-2.jpg');
      expect(this.href).toBe('blob:photo');
    });
    setup(2);
    await userEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('https://r2/c.jpg');
    expect(revoke).toHaveBeenCalledWith('blob:photo');
  });
});
