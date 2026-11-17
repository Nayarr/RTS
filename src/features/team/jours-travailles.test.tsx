import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { RequireRole } from '@/features/auth/RequireRole';
import type { Profile } from '@/features/auth/roles';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  fetchRestReferenceMonday,
  fetchScheduleExceptions,
  fetchTeam,
  saveTechnician,
  updateProfile,
} from './api';
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
  fetchScheduleExceptions: vi.fn(),
  saveTechnician: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const direction: Profile = {
  id: '00000000-0000-0000-0000-0000000000d1',
  email: 'direction@test.fr',
  full_name: 'Direction',
  role: 'direction',
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
};

const nicolas: TeamMember = {
  ...direction,
  id: 'n1',
  email: 'nicolas@test.fr',
  full_name: 'Nicolas Martin',
  role: 'technician',
  technician: {
    id: 't1',
    profile_id: 'n1',
    display_name: 'Nicolas',
    color: '#2A6B52',
    exclude_from_planning: false,
    rest_group: null,
    work_days: [1, 2, 3, 4, 5, 6],
    alternance: null,
    clock_required: true,
    is_active: true,
    sort_order: 0,
    legacy_email: null,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  },
  pinSetAt: '2026-10-01T00:00:00Z',
};

describe('compte : jours travaillés et badgeage', () => {
  it('samedi décoché et badgeage coupé : enregistrés sur la fiche', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(direction);
    vi.mocked(fetchTeam).mockResolvedValue([{ ...direction, technician: null, pinSetAt: null }, nicolas]);
    vi.mocked(fetchRestReferenceMonday).mockResolvedValue('2026-11-02');
    vi.mocked(fetchScheduleExceptions).mockResolvedValue([
      {
        id: 'x1',
        technician_id: 't1',
        starts_on: '2026-12-21',
        ends_on: '2026-12-24',
        note: 'Vacances scolaires',
        created_by: null,
        created_at: '2026-11-16T00:00:00Z',
      },
    ]);
    vi.mocked(updateProfile).mockResolvedValue();
    vi.mocked(saveTechnician).mockResolvedValue();
    renderRoutes(
      [
        {
          element: <RequireRole roles={['direction']} />,
          children: [{ path: '/equipe', element: <TeamPage /> }],
        },
      ],
      { initialPath: '/equipe', auth: { session: fakeSession() } },
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Actions pour Nicolas Martin' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Modifier/ }));
    const dialog = await screen.findByRole('dialog');
    const days = within(dialog).getByRole('group', { name: 'Jours travaillés' });
    await userEvent.click(within(days).getByRole('checkbox', { name: 'Sam' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Badge à la borne' }));
    expect(await within(dialog).findByText(/Du 21\/12\/2026 au 24\/12\/2026/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(saveTechnician).toHaveBeenCalledWith(
        'n1',
        't1',
        expect.objectContaining({ work_days: [1, 2, 3, 4, 5], clock_required: false, alternance: null }),
      ),
    );
  });
});
