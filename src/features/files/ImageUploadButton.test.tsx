import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { IMAGE_OR_PDF, ImageUploadButton } from './ImageUploadButton';

vi.mock('./hooks', () => ({ useUploadFile: () => ({ mutate: vi.fn(), isPending: false }) }));

describe('bouton d’envoi de fichier', () => {
  it('photos par défaut, PDF accepté pour une carte grise', () => {
    renderRoutes([
      {
        path: '/',
        element: (
          <>
            <ImageUploadButton category="ro_photo" onUploaded={vi.fn()} />
            <ImageUploadButton category="registration_doc" accept={IMAGE_OR_PDF} onUploaded={vi.fn()} />
          </>
        ),
      },
    ]);
    expect(screen.getByTestId('upload-ro_photo')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );
    expect(screen.getByTestId('upload-registration_doc')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp,application/pdf',
    );
  });
});
