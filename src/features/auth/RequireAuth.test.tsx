import { screen } from '@testing-library/react';
import { useLocation } from 'react-router';
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

function LoginScreen() {
  const { state } = useLocation() as { state: { from?: string } | null };
  return <p>Écran de connexion{state?.from && ` (retour vers ${state.from})`}</p>;
}

const routes = [
  { path: '/connexion', element: <LoginScreen /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <p>Contenu protégé</p> },
      { path: '/equipe', element: <p>Écran Équipe</p> },
    ],
  },
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
    expect(await screen.findByText(/^Écran de connexion/)).toBeInTheDocument();
  });

  it('mémorise la page demandée pour y revenir après connexion', async () => {
    renderRoutes(routes, { initialPath: '/equipe' });
    expect(await screen.findByText('Écran de connexion (retour vers /equipe)')).toBeInTheDocument();
  });

  it('ne mémorise pas la page quittée après une déconnexion', async () => {
    renderRoutes(routes, { initialPath: '/equipe', auth: { signedOut: true } });
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
