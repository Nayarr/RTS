import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { RequireRole } from '@/features/auth/RequireRole';
import type { Profile } from '@/features/auth/roles';
import { fakeSession, renderRoutes } from '@/test/render';
import { fetchRestReferenceMonday, fetchTeam } from './api';
import type * as TeamApi from './api';
import { TeamPage } from './TeamPage';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TeamApi>()),
  fetchTeam: vi.fn(),
  fetchRestReferenceMonday: vi.fn(),
  createAccount: vi.fn(),
}));

const direction: Profile = {
  id: '00000000-0000-0000-0000-0000000000d1',
  email: 'direction@test.fr',
  full_name: 'Direction',
  role: 'direction',
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
};

async function openNewAccount() {
  vi.mocked(fetchProfile).mockResolvedValue(direction);
  vi.mocked(fetchTeam).mockResolvedValue([{ ...direction, technician: null, pinSetAt: null }]);
  vi.mocked(fetchRestReferenceMonday).mockResolvedValue(null);
  renderRoutes(
    [
      {
        element: <RequireRole roles={['direction']} />,
        children: [{ path: '/equipe', element: <TeamPage /> }],
      },
    ],
    { initialPath: '/equipe', auth: { session: fakeSession() } },
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Nouveau compte' }));
  return screen.findByRole('dialog');
}

describe('Nouveau compte : rôle au nom long', () => {
  it('le champ fermé ne montre que le nom du rôle, l’explication reste dans la liste', async () => {
    const dialog = await openNewAccount();
    const select = within(dialog).getByRole('combobox', { name: 'Rôle' });
    await userEvent.click(select);
    const option = await screen.findByRole('option', { name: /Borne signature/ });
    expect(option).toHaveTextContent('Tablette de l’accueil : signature des devis et OR par le client');
    await userEvent.click(option);

    expect(select).toHaveTextContent(/^Borne signature$/);
    expect(select).not.toHaveTextContent('Tablette');
  });

  it('compte de borne : pas de fiche technicien proposée', async () => {
    const dialog = await openNewAccount();
    expect(within(dialog).getByText('Intervient à l’atelier (fiche technicien)')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Rôle' }));
    await userEvent.click(await screen.findByRole('option', { name: /Borne signature/ }));
    expect(within(dialog).queryByText('Intervient à l’atelier (fiche technicien)')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Nom affiché au planning')).not.toBeInTheDocument();
  });
});
