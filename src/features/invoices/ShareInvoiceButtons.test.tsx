import { screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchClientContact } from '@/features/documents/client-contact';
import { fetchSettings, type Settings } from '@/features/settings/api';
import { fetchMailSettings, sendMail, type MailSettings } from '@/lib/mail';
import { renderRoutes } from '@/test/render';
import { shareInvoice, type InvoiceOverview } from './api';
import { ShareInvoiceButtons } from './ShareInvoiceButtons';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  shareInvoice: vi.fn(),
  recordInvoiceReminder: vi.fn(),
}));
vi.mock('./invoice-attachment', () => ({
  invoicePdfFile: vi.fn().mockResolvedValue({ blob: new Blob(['pdf']), fileName: 'Facture F1.pdf' }),
}));
vi.mock('@/features/settings/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSettings: vi.fn(),
}));
vi.mock('@/features/documents/client-contact', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchClientContact: vi.fn(),
  updateClientContact: vi.fn(),
}));
vi.mock('@/lib/mail', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMailSettings: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const invoice = {
  id: 'i1',
  client_id: 'c1',
  number: 'F1',
  status: 'issued',
  issued_at: '2026-10-17T10:00:00Z',
  due_date: '2026-11-16',
  vehicle_label: 'AB-123-CD',
  total_ttc: 0,
  balance_due: 0,
} as InvoiceOverview;

const mail = (enabled: boolean) =>
  ({
    enabled,
    domain: null,
    locals: { billing: 'facturation', workshop: 'atelier', signature: 'signature' },
    companyName: 'RTS',
    companyEmail: null,
  }) as MailSettings;

const renderAutoSend = () =>
  renderRoutes([{ path: '/', element: <ShareInvoiceButtons invoice={invoice} autoSend /> }]);

beforeEach(() => {
  vi.mocked(shareInvoice).mockResolvedValue('jeton');
  vi.mocked(fetchSettings).mockResolvedValue({
    company: {
      legal_name: 'RTS',
      address_line: '1 rue',
      postal_code: '95190',
      city: 'Goussainville',
      email: 'atelier@rts.fr',
    },
  } as Settings);
  vi.mocked(fetchClientContact).mockResolvedValue({ email: 'compta@client.fr', phone: null });
  vi.mocked(sendMail).mockResolvedValue({ id: 'm1' });
});

describe('facture émise après les travaux avant devis : envoi automatique', () => {
  it('envoi par l’appli activé : la facture part tout de suite au client, PDF joint', async () => {
    vi.mocked(fetchMailSettings).mockResolvedValue(mail(true));
    renderAutoSend();
    await waitFor(() =>
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'billing',
          to: 'compta@client.fr',
          subject: 'Facture F1 · RTS',
          idempotencyKey: 'invoice-auto-i1',
          attachments: [expect.objectContaining({ fileName: 'Facture F1.pdf' })],
        }),
      ),
    );
    expect(vi.mocked(sendMail).mock.calls[0]?.[0].text).toContain('rien à régler');
    expect(toast.success).toHaveBeenCalledWith('Facture F1 envoyée à compta@client.fr');
  });

  it('sans envoi par l’appli : la fenêtre d’envoi s’ouvre, message prêt', async () => {
    vi.mocked(fetchMailSettings).mockResolvedValue(mail(false));
    renderAutoSend();
    expect(await screen.findByRole('dialog', { name: 'Envoyer la facture F1' })).toBeInTheDocument();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
