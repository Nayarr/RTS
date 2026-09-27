import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import type { Profile } from '@/features/auth/roles';
import { fakeSession, renderRoutes } from '@/test/render';
import { AppLayout } from './AppLayout';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
// Cloche du bureau : aucune alerte.
vi.mock('@/features/alerts/api', () => ({
  fetchMyNotifications: vi.fn().mockResolvedValue([]),
  markNotificationsRead: vi.fn(),
  subscribeToNotifications: () => () => {},
}));

const profile = (role: Profile['role']): Profile => ({
  id: '00000000-0000-0000-0000-0000000000d1',
  email: 'direction@test.fr',
  full_name: 'Direction',
  role,
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
});

const routes = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <p>Accueil</p> },
      { path: '/equipe', element: <p>Écran Équipe</p> },
    ],
  },
];

describe('AppLayout', () => {
  it('affiche le lien Équipe à la direction', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('direction'));
    renderRoutes(routes, { auth: { session: fakeSession() } });
    expect(await screen.findByRole('link', { name: 'Équipe' })).toHaveAttribute('href', '/equipe');
  });

  it('masque le lien Équipe aux autres rôles', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('reception'));
    renderRoutes(routes, { auth: { session: fakeSession() } });
    expect(await screen.findByText('Réception')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Équipe' })).not.toBeInTheDocument();
  });
});
