import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSettings, type Settings } from '@/features/settings/api';
import type * as SettingsApi from '@/features/settings/api';
import { fetchMailSettings, sendMail, type MailSettings } from '@/lib/mail';
import type * as MailLib from '@/lib/mail';
import { renderRoutes } from '@/test/render';
import { fetchClientEmails, recordInvoiceReminder, shareInvoice, type InvoiceOverview } from './api';
import type * as InvoicesApi from './api';
import { overdueByClient, overdueReminderMessage } from './domain';
import { OverdueRemindersDialog } from './OverdueRemindersDialog';

vi.mock('@/features/settings/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SettingsApi>()),
  fetchSettings: vi.fn(),
}));
vi.mock('@/lib/mail', async (importOriginal) => ({
  ...(await importOriginal<typeof MailLib>()),
  fetchMailSettings: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof InvoicesApi>()),
  fetchClientEmails: vi.fn(),
  shareInvoice: vi.fn(),
  recordInvoiceReminder: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COMPANY = {
  legal_name: 'RAPID TRUCK SERVICE',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
  email: 'atelier@rapidtruckservice.fr',
};

const invoice = (overrides: Partial<InvoiceOverview>): InvoiceOverview =>
  ({
    id: 'i1',
    number: 'F11887',
    status: 'issued',
    client_id: 'c1',
    client_name: 'Transports Martin',
    vehicle_label: 'GH-512-RT',
    issued_at: '2026-08-01T10:00:00Z',
    due_date: '2026-09-01',
    total_ttc: 720,
    paid_ttc: 400,
    balance_due: 320,
    payment_status: 'overdue',
    repair_order_ids: [],
    repair_order_numbers: [],
    ...overrides,
  }) as InvoiceOverview;

const INVOICES = [
  invoice({}),
  invoice({
    id: 'i2',
    number: 'F11890',
    due_date: '2026-08-15',
    balance_due: 180,
    issued_at: '2026-07-15T10:00:00Z',
  }),
  invoice({ id: 'i3', number: 'F11895', client_id: 'c2', client_name: 'Dupont', balance_due: 900 }),
  invoice({ id: 'i4', number: 'F11899', client_id: 'c3', client_name: 'Sans Mail', balance_due: 50 }),
  // Pas encore échue, réglée : pas relancées
  invoice({ id: 'i5', number: 'F11900', due_date: '2099-01-01' }),
  invoice({ id: 'i6', number: 'F11901', balance_due: 0, payment_status: 'paid' }),
];

describe('relance des retards', () => {
  it('un groupe par client, factures dues seulement, plus gros retard d’abord', () => {
    const groups = overdueByClient(INVOICES, '2026-10-23');
    expect(
      groups.map((group) => [group.clientName, group.invoices.map((item) => item.number), group.balance]),
    ).toEqual([
      ['Dupont', ['F11895'], 900],
      ['Transports Martin', ['F11890', 'F11887'], 500],
      ['Sans Mail', ['F11899'], 50],
    ]);
    const message = overdueReminderMessage(groups[1]!, { i1: 'https://rts.test/d/abc' }, COMPANY);
    expect(message.subject).toBe('Relance · Factures en attente de règlement · RAPID TRUCK SERVICE');
    expect(message.body).toContain('les factures suivantes restent impayées après leur échéance :');
    expect(message.body).toContain(
      '- Facture F11887 du 01/08/2026 (véhicule GH-512-RT), échue le 01/09/2026 : 320,00 € TTC\n  https://rts.test/d/abc',
    );
    expect(message.body).toContain('Total restant dû : 500,00 € TTC.');
  });

  describe('fenêtre', () => {
    beforeEach(() => {
      vi.mocked(fetchSettings).mockResolvedValue({ company: COMPANY } as Settings);
      vi.mocked(fetchMailSettings).mockResolvedValue({ enabled: true } as MailSettings);
      vi.mocked(fetchClientEmails).mockResolvedValue({
        c1: 'compta@martin.fr',
        c2: 'dupont@exemple.fr',
        c3: null,
      });
      vi.mocked(shareInvoice).mockImplementation((id) => Promise.resolve(`jeton-${id}`));
      vi.mocked(recordInvoiceReminder).mockResolvedValue();
      vi.mocked(sendMail).mockResolvedValue({ id: 'm1' });
    });

    it('un mail par client coché, relance notée sur chaque facture, client sans e-mail signalé', async () => {
      renderRoutes([
        { path: '/', element: <OverdueRemindersDialog invoices={INVOICES} onClose={vi.fn()} /> },
      ]);
      const dialog = await screen.findByRole('dialog', { name: 'Relancer les retards' });
      const list = within(dialog).getByRole('list', { name: 'Clients à relancer' });
      expect(await within(list).findByText('dupont@exemple.fr')).toBeInTheDocument();
      expect(
        within(list).getByText('Pas d’e-mail sur la fiche : relance depuis la facture'),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('checkbox', { name: 'Relancer Sans Mail' })).toBeDisabled();

      await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Relancer Dupont' }));
      await userEvent.click(within(dialog).getByRole('button', { name: /Envoyer 1 relance/ }));
      await waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'billing',
          to: 'compta@martin.fr',
          subject: 'Relance · Factures en attente de règlement · RAPID TRUCK SERVICE',
        }),
      );
      expect(vi.mocked(recordInvoiceReminder).mock.calls.map(([id]) => id)).toEqual(['i2', 'i1']);
      expect(await within(list).findByText('Relancé (compta@martin.fr)')).toBeInTheDocument();
    });

    it('envoi par l’appli coupé : message prêt dans la messagerie', async () => {
      vi.mocked(fetchMailSettings).mockResolvedValue({ enabled: false } as MailSettings);
      renderRoutes([
        { path: '/', element: <OverdueRemindersDialog invoices={INVOICES.slice(2, 3)} onClose={vi.fn()} /> },
      ]);
      const dialog = await screen.findByRole('dialog', { name: 'Relancer les retards' });
      await userEvent.click(await within(dialog).findByRole('button', { name: /Préparer 1 relance/ }));
      const link = await within(dialog).findByRole('link', { name: /Ouvrir dans la messagerie/ });
      expect(link.getAttribute('href')).toMatch(/^mailto:dupont@exemple\.fr\?subject=Relance/);
      expect(sendMail).not.toHaveBeenCalled();
    });
  });
});
