import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RoPhoto } from '../api';
import { PhotosCard } from './PhotosCard';

vi.mock('@/features/files/hooks', () => ({
  useFileUrls: () => ({
    data: { f1: 'https://fichiers.test/face.jpg', f2: 'https://fichiers.test/ct.pdf' },
    isPending: false,
  }),
}));

const photo = (overrides: Partial<RoPhoto>): RoPhoto => ({
  id: 'p1',
  repair_order_id: 'ro1',
  file_id: 'f1',
  label: 'Face avant',
  taken_at: '2026-11-02T08:00:00Z',
  created_by: null,
  author_name: 'Alice',
  is_pdf: false,
  ...overrides,
});

describe('photos de l’OR', () => {
  it('contrôle technique en PDF : vignette qui ouvre le document, visionneuse pour les photos seulement', async () => {
    render(
      <PhotosCard
        photos={[photo({}), photo({ id: 'p2', file_id: 'f2', label: 'Contrôle technique', is_pdf: true })]}
        missingLabels={[]}
      />,
    );
    const pdf = screen.getByRole('link', { name: 'Ouvrir le PDF « Contrôle technique »' });
    expect(pdf).toHaveAttribute('href', 'https://fichiers.test/ct.pdf');
    expect(pdf).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('button', { name: /Voir la photo « Contrôle technique »/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Voir la photo « Face avant » en grand' }));
    const viewer = screen.getByRole('dialog');
    expect(within(viewer).getByRole('img', { name: 'Face avant' })).toBeInTheDocument();
  });
});
