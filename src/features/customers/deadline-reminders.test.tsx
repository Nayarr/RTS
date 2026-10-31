import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMailSettings, sendMail } from '@/lib/mail';
import type * as MailApi from '@/lib/mail';
import { renderRoutes } from '@/test/render';
import { recordDeadlineReminders, type VehicleDeadline } from './api';
import type * as CustomersApi from './api';
import { DeadlineRemindersDialog } from './DeadlineRemindersDialog';
import { deadlineReminderMessage, reminderLine, remindersByClient } from './deadline-reminders';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof CustomersApi>()),
  recordDeadlineReminders: vi.fn(),
}));
vi.mock('@/lib/mail', async (importOriginal) => ({
  ...(await importOriginal<typeof MailApi>()),
  fetchMailSettings: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock('@/features/settings/hooks', () => ({
  useSettings: () => ({
    data: {
      company: { legal_name: 'RAPID TRUCK SERVICE', email: 'atelier@rts.fr', phone: '01 23 45 67 89' },
    },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TODAY = '2026-11-02';

const deadline = (patch: Partial<VehicleDeadline>): VehicleDeadline => ({
  vehicle_id: 'v1',
  plate: 'AB-123-CD',
  client_id: 'c1',
  client_name: 'MCE',
  client_email: 'parc@mce.fr',
  kind: 'ct',
  due_date: '2026-10-20',
  days_left: -13,
  reminded_at: null,
  ...patch,
});

const DEADLINES = [
  deadline({}),
  deadline({ vehicle_id: 'v2', plate: 'EF-456-GH', kind: 'tailgate', due_date: '2026-11-30', days_left: 28 }),
  // Déjà relancé depuis moins de 3 mois : écarté
  deadline({ vehicle_id: 'v3', plate: 'IJ-789-KL', reminded_at: '2026-10-01T09:00:00Z' }),
  deadline({
    vehicle_id: 'v4',
    plate: 'MN-012-OP',
    client_id: 'c2',
    client_name: 'Sans mail',
    client_email: null,
  }),
];

describe('relance des échéances', () => {
  it('un groupe par client, véhicules déjà relancés écartés, message du mail', () => {
    const groups = remindersByClient(DEADLINES);
    expect(
      groups.map((group) => [group.clientName, group.email, group.items.map((item) => item.plate)]),
    ).toEqual([
      ['MCE', 'parc@mce.fr', ['AB-123-CD', 'EF-456-GH']],
      ['Sans mail', null, ['MN-012-OP']],
    ]);
    expect(reminderLine(groups[0]!.items[0]!, TODAY)).toBe(
      'AB-123-CD : contrôle technique dépassé depuis le 20/10/2026',
    );
    expect(reminderLine(groups[0]!.items[1]!, TODAY)).toBe(
      'EF-456-GH : contrôle hayon à faire avant fin 11/2026',
    );
    const message = deadlineReminderMessage(groups[0]!, TODAY, {
      legal_name: 'RAPID TRUCK SERVICE',
      email: 'atelier@rts.fr',
      phone: null,
    });
    expect(message.subject).toBe('Contrôles de vos véhicules à prévoir · RAPID TRUCK SERVICE');
    expect(message.body).toContain('les contrôles suivants de vos véhicules sont à faire');
    expect(message.body).toContain('- AB-123-CD : contrôle technique dépassé depuis le 20/10/2026');
  });

  describe('fenêtre de relance', () => {
    beforeEach(() => {
      vi.mocked(fetchMailSettings).mockResolvedValue({
        enabled: true,
        domain: 'rts.fr',
        locals: { billing: 'facturation', workshop: 'atelier', signature: 'signature' },
      } as Awaited<ReturnType<typeof fetchMailSettings>>);
      vi.mocked(sendMail).mockReset().mockResolvedValue({ id: 'm1' });
      vi.mocked(recordDeadlineReminders).mockReset().mockResolvedValue();
    });

    it('un mail par client avec e-mail, relance notée sur chaque véhicule', async () => {
      renderRoutes([
        {
          path: '/',
          element: <DeadlineRemindersDialog deadlines={DEADLINES} today={TODAY} onClose={vi.fn()} />,
        },
      ]);
      const dialog = await screen.findByRole('dialog', { name: 'Relancer les échéances' });
      expect(within(dialog).getByRole('checkbox', { name: 'Relancer Sans mail' })).toBeDisabled();
      await userEvent.click(await within(dialog).findByRole('button', { name: /Envoyer 1 mail/ }));
      await waitFor(() =>
        expect(recordDeadlineReminders).toHaveBeenCalledWith([
          { vehicle_id: 'v1', kind: 'ct' },
          { vehicle_id: 'v2', kind: 'tailgate' },
        ]),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'workshop', to: 'parc@mce.fr' }),
      );
      expect(within(dialog).getByText('Relancé (parc@mce.fr)')).toBeInTheDocument();
    });
  });
});
