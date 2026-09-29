import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchClientContact } from '@/features/documents/client-contact';
import type * as ClientContact from '@/features/documents/client-contact';
import { fetchSettings, type Settings } from '@/features/settings/api';
import type * as SettingsApi from '@/features/settings/api';
import { renderRoutes } from '@/test/render';
import { ClientPortalButtons } from './ClientPortalButtons';
import {
  hasClientPortal,
  portalMessage,
  recordPortalMessage,
  resetClientPortal,
  shareClientPortal,
} from './portal';
import type * as Portal from './portal';

vi.mock('./portal', async (importOriginal) => ({
  ...(await importOriginal<typeof Portal>()),
  shareClientPortal: vi.fn(),
  resetClientPortal: vi.fn(),
  hasClientPortal: vi.fn(),
  recordPortalMessage: vi.fn(),
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

const company = { legal_name: 'RAPID TRUCK SERVICE', email: 'atelier@rapidtruckservice.fr' };

beforeEach(() => {
  vi.mocked(shareClientPortal).mockResolvedValue('t'.repeat(40));
  vi.mocked(resetClientPortal).mockResolvedValue('n'.repeat(40));
  vi.mocked(hasClientPortal).mockResolvedValue(false);
  vi.mocked(recordPortalMessage).mockResolvedValue(undefined);
  vi.mocked(fetchSettings).mockResolvedValue({ company } as unknown as Settings);
  vi.mocked(fetchClientContact).mockResolvedValue({ email: 'compta@dupont.fr', phone: null });
});

const renderButtons = () =>
  renderRoutes([
    { path: '/', element: <ClientPortalButtons clientId="c1" clientName="Transports Dupont" /> },
  ]);

describe('espace client : envoi du lien', () => {
  it('message de l’ancienne appli', () => {
    const message = portalMessage('https://rts/d/abc', company);
    expect(message.subject).toBe('Votre espace client — RAPID TRUCK SERVICE');
    expect(message.body).toContain('vos devis, vos factures et les échéances de contrôle technique');
    expect(message.body).toContain('https://rts/d/abc');
    expect(message.sms).toBe('Votre espace client RAPID TRUCK SERVICE : https://rts/d/abc');
  });

  it('préparation du lien, envoi par e-mail tracé ; pas de « Changer le lien » sans lien', async () => {
    renderButtons();
    await waitFor(() => expect(hasClientPortal).toHaveBeenCalledWith('c1'));
    expect(screen.queryByRole('button', { name: 'Changer le lien' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Espace client en ligne' }));
    const dialog = await screen.findByRole('dialog', { name: 'Espace client — Transports Dupont' });
    expect(shareClientPortal).toHaveBeenCalledWith('c1');
    expect(within(dialog).getByLabelText('Lien')).toHaveValue(
      `${window.location.origin}/d/${'t'.repeat(40)}`,
    );

    const gmail = within(dialog).getByRole('link', { name: 'Ouvrir dans Gmail' });
    gmail.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(gmail);
    await waitFor(() =>
      expect(recordPortalMessage).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: 'c1', channel: 'email', recipient: 'compta@dupont.fr' }),
      ),
    );
  });

  it('changer le lien : confirmation puis nouveau lien', async () => {
    vi.mocked(hasClientPortal).mockResolvedValue(true);
    renderButtons();
    await userEvent.click(await screen.findByRole('button', { name: 'Changer le lien' }));
    const confirm = screen.getByRole('dialog', { name: 'Changer le lien de l’espace client ?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Changer le lien' }));
    const dialog = await screen.findByRole('dialog', { name: 'Espace client — Transports Dupont' });
    expect(resetClientPortal).toHaveBeenCalledWith('c1');
    expect(within(dialog).getByLabelText('Lien')).toHaveValue(
      `${window.location.origin}/d/${'n'.repeat(40)}`,
    );
  });
});
