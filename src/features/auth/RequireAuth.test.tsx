import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeSession, renderRoutes } from '@/test/render';
import { fetchProfile } from './api';
import type * as ApiModule from './api';
import { RequireAuth } from './RequireAuth';
import type { Profile } from './roles';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  fetchProfile: vi.fn(),
  signOut: vi.fn(),
}));

const routes = [
  { path: '/connexion', element: <p>Écran de connexion</p> },
  { element: <RequireAuth />, children: [{ path: '/', element: <p>Contenu protégé</p> }] },
];

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: '00000000-0000-0000-0000-0000000000d1',
  email: 'direction@test.fr',
  full_name: 'Direction',
  role: 'direction',
  is_active: true,
  created_at: '2026-09-26T00:00:00Z',
  updated_at: '2026-09-26T00:00:00Z',
  ...overrides,
});

describe('RequireAuth', () => {
  it('redirige vers la connexion sans session', async () => {
    renderRoutes(routes);
    expect(await screen.findByText('Écran de connexion')).toBeInTheDocument();
  });

  it('affiche la page pour un compte actif', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile());
    renderRoutes(routes, { auth: { session: fakeSession() } });
    expect(await screen.findByText('Contenu protégé')).toBeInTheDocument();
  });

  it('bloque un compte désactivé', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile({ is_active: false }));
    renderRoutes(routes, { auth: { session: fakeSession() } });
    expect(await screen.findByText('Compte non autorisé')).toBeInTheDocument();
    expect(screen.queryByText('Contenu protégé')).not.toBeInTheDocument();
  });

  it('bloque un compte sans profil applicatif', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(null);
    renderRoutes(routes, { auth: { session: fakeSession() } });
    expect(await screen.findByText('Compte non autorisé')).toBeInTheDocument();
  });

  it('propose de réessayer si le profil ne se charge pas', async () => {
    vi.mocked(fetchProfile).mockRejectedValue(new TypeError('Failed to fetch'));
    renderRoutes(routes, { auth: { session: fakeSession() } });
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
