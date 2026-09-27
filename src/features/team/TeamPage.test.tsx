import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { RequireRole } from '@/features/auth/RequireRole';
import type { Profile } from '@/features/auth/roles';
import { fakeSession, renderRoutes } from '@/test/render';
import { createAccount, fetchRestReferenceMonday, fetchTeam } from './api';
import type * as TeamApi from './api';
import { TeamPage } from './TeamPage';
import type { TeamMember } from './types';

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

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: '00000000-0000-0000-0000-0000000000d1',
  email: 'direction@test.fr',
  full_name: 'Direction',
  role: 'direction',
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
  ...overrides,
});

const alice: TeamMember = {
  ...profile({ id: 'a1', email: 'alice@test.fr', full_name: 'Alice Martin', role: 'technician' }),
  technician: {
    id: 't1',
    profile_id: 'a1',
    display_name: 'Alice',
    color: '#2A6B52',
    exclude_from_planning: false,
    rest_group: 'A',
    is_active: true,
    sort_order: 0,
    legacy_email: null,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  },
  pinSetAt: null,
};

const routes = [
  { element: <RequireRole roles={['direction']} />, children: [{ path: '/equipe', element: <TeamPage /> }] },
];

const renderTeam = (role: Profile['role'] = 'direction') => {
  vi.mocked(fetchProfile).mockResolvedValue(profile({ role }));
  vi.mocked(fetchTeam).mockResolvedValue([{ ...profile(), technician: null, pinSetAt: null }, alice]);
  vi.mocked(fetchRestReferenceMonday).mockResolvedValue(null);
  return renderRoutes(routes, { initialPath: '/equipe', auth: { session: fakeSession() } });
};

describe('TeamPage', () => {
  it('liste l’équipe avec rôle, planning et PIN manquant', async () => {
    renderTeam();
    const table = await screen.findByRole('table');
    const aliceRow = within(table).getByText('Alice Martin').closest('tr')!;
    expect(within(aliceRow).getByText('Technicien')).toBeInTheDocument();
    expect(within(aliceRow).getByText('Sans PIN')).toBeInTheDocument();
    expect(within(aliceRow).getByText('Repos A')).toBeInTheDocument();
  });

  it('valide le formulaire de création avant tout appel', async () => {
    renderTeam();
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau compte' }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer le compte' }));

    expect(await screen.findByText('Indique le nom')).toBeInTheDocument();
    expect(screen.getByText('Adresse e-mail invalide')).toBeInTheDocument();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('crée un technicien par invitation', async () => {
    vi.mocked(createAccount).mockResolvedValue({ user_id: 'new', invited: true });
    renderTeam();
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau compte' }));
    await userEvent.type(screen.getByLabelText('Nom complet'), 'Karim Benali');
    await userEvent.type(screen.getByLabelText('E-mail de connexion'), 'karim@test.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le compte' }));

    expect(vi.mocked(createAccount).mock.calls[0]?.[0]).toEqual({
      email: 'karim@test.fr',
      full_name: 'Karim Benali',
      role: 'technician',
      technician: { display_name: 'Karim', color: '#2A6B52' },
    });
  });

  it('refuse l’écran à un autre rôle que la direction', async () => {
    renderTeam('reception');
    expect(await screen.findByText('Accès refusé')).toBeInTheDocument();
    expect(fetchTeam).not.toHaveBeenCalled();
  });
});
