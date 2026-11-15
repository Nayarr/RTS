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
import { mustBeTechnician, toCreateAccountInput } from './schemas';
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

describe('la réception badge', () => {
  it('fiche technicien obligatoire, envoyée hors planning', () => {
    expect(mustBeTechnician('reception')).toBe(true);
    expect(
      toCreateAccountInput({
        email: 'sophie@test.fr',
        full_name: 'Sophie Durand',
        role: 'reception',
        is_technician: true,
        display_name: 'Sophie',
        color: '#2A6B52',
        access: 'invite',
        password: '',
      }).technician,
    ).toEqual({ display_name: 'Sophie', color: '#2A6B52', exclude_from_planning: true });
  });

  it('nouveau compte réception : case verrouillée, badge expliqué, compte créé avec sa fiche', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(direction);
    vi.mocked(fetchTeam).mockResolvedValue([{ ...direction, technician: null, pinSetAt: null }]);
    vi.mocked(fetchRestReferenceMonday).mockResolvedValue(null);
    vi.mocked(createAccount).mockResolvedValue({ user_id: 'new', invited: true });
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
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nom complet'), 'Sophie Durand');
    await userEvent.type(within(dialog).getByLabelText('E-mail de connexion'), 'sophie@test.fr');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Rôle' }));
    await userEvent.click(await screen.findByRole('option', { name: /Réception/ }));

    expect(within(dialog).getByRole('checkbox', { name: /Intervient à l’atelier/ })).toBeDisabled();
    expect(
      within(dialog).getByText(/Obligatoire : pointe sur la borne avec son code PIN/),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));
    expect(vi.mocked(createAccount).mock.calls[0]?.[0]).toMatchObject({
      role: 'reception',
      technician: { display_name: 'Sophie', exclude_from_planning: true },
    });
  });
});
