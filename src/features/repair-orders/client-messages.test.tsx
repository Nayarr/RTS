import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchClientContact } from '@/features/documents/client-contact';
import type * as ClientContact from '@/features/documents/client-contact';
import { fetchRepairOrderQuotes, type QuoteOverview } from '@/features/quotes/api';
import type * as QuotesApi from '@/features/quotes/api';
import { fetchSettings, type Settings } from '@/features/settings/api';
import type * as SettingsApi from '@/features/settings/api';
import { renderRoutes } from '@/test/render';
import type { RepairOrderOverview } from './api';
import {
  clientMessage,
  fetchSentClientMessages,
  recordClientMessage,
  suggestedMessage,
  type SentClientMessage,
} from './client-messages';
import type * as ClientMessages from './client-messages';
import { ClientMessagesCard } from './detail/ClientMessagesCard';

vi.mock('./client-messages', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientMessages>()),
  fetchSentClientMessages: vi.fn(),
  recordClientMessage: vi.fn(),
}));
vi.mock('@/features/quotes/api', async (importOriginal) => ({
  ...(await importOriginal<typeof QuotesApi>()),
  fetchRepairOrderQuotes: vi.fn(),
}));
vi.mock('@/features/settings/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SettingsApi>()),
  fetchSettings: vi.fn(),
}));
vi.mock('@/features/documents/client-contact', async (importOriginal) => ({
  ...(await importOriginal<typeof ClientContact>()),
  fetchClientContact: vi.fn(),
  updateClientContact: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const company = {
  legal_name: 'RAPID TRUCK SERVICE',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
  email: 'atelier@rapidtruckservice.fr',
};

const order = (overrides: Partial<RepairOrderOverview> = {}) =>
  ({
    id: 'ro1',
    number: 'OR00012',
    status: 'in_progress',
    client_id: 'c1',
    plate: 'AB-123-CD',
    ...overrides,
  }) as RepairOrderOverview;

const sent = (type: SentClientMessage['message_type']): SentClientMessage => ({
  message_type: type,
  channel: 'sms',
  sent_at: '2026-09-29T08:00:00Z',
});

beforeEach(() => {
  vi.mocked(fetchSentClientMessages).mockResolvedValue([]);
  vi.mocked(recordClientMessage).mockResolvedValue(undefined);
  vi.mocked(fetchRepairOrderQuotes).mockResolvedValue([]);
  vi.mocked(fetchSettings).mockResolvedValue({ company } as unknown as Settings);
  vi.mocked(fetchClientContact).mockResolvedValue({ email: 'compta@dupont.fr', phone: '06 12 34 56 78' });
});

describe('messages au client : règles', () => {
  it('suggestion selon l’avancement, jamais un message déjà envoyé', () => {
    expect(suggestedMessage('assigned', false, [])).toBe('vehicle_received');
    expect(suggestedMessage('in_progress', false, [sent('vehicle_received')])).toBeNull();
    expect(suggestedMessage('in_progress', true, [sent('vehicle_received')])).toBe('quote_available');
    expect(suggestedMessage('work_done', true, [])).toBe('vehicle_ready');
    expect(suggestedMessage('invoiced', false, [sent('vehicle_ready')])).toBeNull();
    expect(suggestedMessage('quote_pending', false, [])).toBeNull();
  });

  it('textes : prise en charge, devis avec ou sans lien, véhicule prêt (SMS sur une ligne)', () => {
    const ready = clientMessage('vehicle_ready', { plate: 'AB-123-CD', quoteLink: null }, company);
    expect(ready.subject).toBe('Véhicule prêt — AB-123-CD — RAPID TRUCK SERVICE');
    expect(ready.body).toContain(
      'Votre véhicule AB-123-CD est prêt, vous pouvez venir le récupérer à l’atelier (19 rue Gaston Monmousseau, 95190 Goussainville)',
    );
    expect(ready.body).toMatch(/Cordialement,\nRAPID TRUCK SERVICE\natelier@rapidtruckservice\.fr$/);
    expect(ready.sms).not.toContain('\n');
    expect(
      clientMessage('quote_available', { plate: 'AB-123-CD', quoteLink: 'https://rts/d/abc' }, company).body,
    ).toContain('est disponible ici : https://rts/d/abc');
    expect(clientMessage('quote_available', { plate: 'AB-123-CD', quoteLink: null }, company).body).toContain(
      'est disponible.',
    );
    expect(
      clientMessage('vehicle_received', { plate: 'AB-123-CD', quoteLink: null }, company).body,
    ).toContain('Nous vous confirmons la prise en charge de votre véhicule AB-123-CD');
  });
});

const renderCard = (overrides: Partial<RepairOrderOverview> = {}) =>
  renderRoutes([{ path: '/', element: <ClientMessagesCard order={order(overrides)} /> }]);

describe('messages au client : fiche OR', () => {
  it('suggestion en vert, message prêt, envoi SMS tracé', async () => {
    renderCard();
    const received = await screen.findByRole('button', { name: 'Véhicule pris en charge' });
    await waitFor(() => expect(received).toHaveAttribute('data-variant', 'default'));
    expect(screen.getByRole('button', { name: 'Véhicule prêt' })).toHaveAttribute('data-variant', 'outline');

    await userEvent.click(received);
    const dialog = await screen.findByRole('dialog', { name: 'Véhicule pris en charge' });
    expect(within(dialog).getByLabelText('Téléphone du client')).toHaveValue('06 12 34 56 78');
    const sms = within(dialog).getByRole('link', { name: /Envoyer par SMS/ });
    expect(sms.getAttribute('href')).toMatch(/^sms:0612345678\?body=Bonjour%2C%20Nous%20vous%20confirmons/);
    sms.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(sms);
    await waitFor(() =>
      expect(recordClientMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          repairOrderId: 'ro1',
          type: 'vehicle_received',
          channel: 'sms',
          recipient: '06 12 34 56 78',
        }),
      ),
    );
  });

  it('devis envoyé : lien du devis dans le message ; messages déjà envoyés cochés', async () => {
    vi.mocked(fetchSentClientMessages).mockResolvedValue([sent('vehicle_received')]);
    vi.mocked(fetchRepairOrderQuotes).mockResolvedValue([
      { id: 'q1', status: 'sent', public_token: 'tok123' } as QuoteOverview,
    ]);
    renderCard();
    const quote = await screen.findByRole('button', { name: 'Devis disponible' });
    await waitFor(() => expect(quote).toHaveAttribute('data-variant', 'default'));
    expect(
      await screen.findByRole('button', { name: /^Véhicule pris en charge\s*\(déjà envoyé\)$/ }),
    ).toBeInTheDocument();

    await userEvent.click(quote);
    const dialog = await screen.findByRole('dialog', { name: 'Devis disponible' });
    const mail = within(dialog).getByRole('link', { name: /Envoyer par e-mail/ });
    expect(decodeURIComponent(mail.getAttribute('href') ?? '')).toContain('/d/tok123');
  });
});
