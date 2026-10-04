import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMailSendEnabled, sendMail } from '@/lib/mail';
import { SendLinkDialog } from './SendLinkDialog';

vi.mock('@/lib/mail', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMailSendEnabled: vi.fn(),
  sendMail: vi.fn(),
}));

const cleanups: (() => void)[] = [];
const PDF = { blob: new Blob(['%PDF']), fileName: 'F00012.pdf' };

const renderDialog = (
  email: string,
  onSend = vi.fn(),
  {
    attachments,
    onClose = vi.fn(),
  }: { attachments?: () => Promise<(typeof PDF)[]>; onClose?: () => void } = {},
) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SendLinkDialog
        title="Véhicule prêt"
        intro="Message pré-rédigé."
        message={{ subject: 'Véhicule prêt', body: 'Bonjour', sms: 'Bonjour' }}
        senderEmail="atelier@rapidtruckservice.fr"
        contact={{ email, phone: '' }}
        onContactSave={vi.fn()}
        onSend={onSend}
        attachments={attachments && { label: 'la facture F00012 (PDF)', load: attachments }}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  const link = screen.getByRole('link', { name: /messagerie de l’ordinateur/ });
  // Écouté sur le document, donc après le gestionnaire de l'appli (délégation React) ;
  // le lien « mailto: » n'est jamais suivi dans le test.
  const opened = vi.fn();
  const listener = (event: MouseEvent) => {
    if (event.target instanceof Node && link.contains(event.target)) {
      opened(!event.defaultPrevented);
      event.preventDefault();
    }
  };
  document.addEventListener('click', listener);
  cleanups.push(() => document.removeEventListener('click', listener));
  return { link, onSend, opened, onClose };
};

beforeEach(() => {
  vi.mocked(fetchMailSendEnabled).mockResolvedValue(false);
  vi.mocked(sendMail).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe('fenêtre d’envoi', () => {
  it('Gmail s’ouvre sur le compte de l’atelier', () => {
    renderDialog('client@exemple.fr');
    expect(screen.getByRole('link', { name: 'Ouvrir dans Gmail' }).getAttribute('href')).toContain(
      'authuser=atelier%40rapidtruckservice.fr',
    );
  });

  it('sans e-mail du client : confirmation ; « Annuler » n’ouvre rien et ne trace rien', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { link, onSend, opened } = renderDialog('');
    await userEvent.click(link);
    expect(confirm).toHaveBeenCalledWith('Aucun e-mail client renseigné. Ouvrir quand même la messagerie ?');
    expect(opened).toHaveBeenCalledWith(false);
    expect(onSend).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(link);
    expect(opened).toHaveBeenLastCalledWith(true);
    expect(onSend).toHaveBeenCalledWith('email', { email: '', phone: '' });
  });

  it('avec un e-mail : pas de confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { link, onSend, opened } = renderDialog('client@exemple.fr');
    await userEvent.click(link);
    expect(confirm).not.toHaveBeenCalled();
    expect(opened).toHaveBeenCalledWith(true);
    expect(onSend).toHaveBeenCalledWith('email', { email: 'client@exemple.fr', phone: '' });
  });

  it('envoi par l’appli désactivé : seulement la messagerie', async () => {
    renderDialog('client@exemple.fr');
    await waitFor(() => expect(fetchMailSendEnabled).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Envoyer l’e-mail maintenant/ })).toBeNull();
    expect(screen.getByText(/vérifie que c’est bien le compte expéditeur/)).toBeInTheDocument();
  });
});

describe('envoi par l’appli (Resend)', () => {
  beforeEach(() => vi.mocked(fetchMailSendEnabled).mockResolvedValue(true));

  it('envoie l’e-mail avec le PDF joint, trace l’envoi et ferme la fenêtre', async () => {
    vi.mocked(sendMail).mockResolvedValue({ id: 're_123' });
    const load = vi.fn().mockResolvedValue([PDF]);
    const { onSend, onClose } = renderDialog('client@exemple.fr', vi.fn(), { attachments: load });
    expect(await screen.findByText(/les réponses du client arrivent sur/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Joindre la facture F00012 \(PDF\)/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /Envoyer l’e-mail maintenant/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const sent = vi.mocked(sendMail).mock.calls[0]?.[0];
    expect(sent?.to).toBe('client@exemple.fr');
    expect(sent?.message).toEqual({ subject: 'Véhicule prêt', body: 'Bonjour', sms: 'Bonjour' });
    expect(sent?.attachments).toEqual([PDF]);
    expect(sent?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(onSend).toHaveBeenCalledWith('email', { email: 'client@exemple.fr', phone: '' }, 're_123');
  });

  it('pièce jointe décochée : le PDF n’est pas généré', async () => {
    vi.mocked(sendMail).mockResolvedValue({ id: 're_456' });
    const load = vi.fn().mockResolvedValue([PDF]);
    renderDialog('client@exemple.fr', vi.fn(), { attachments: load });
    await userEvent.click(await screen.findByRole('checkbox', { name: /Joindre la facture/ }));
    await userEvent.click(screen.getByRole('button', { name: /Envoyer l’e-mail maintenant/ }));
    await waitFor(() => expect(sendMail).toHaveBeenCalled());
    expect(load).not.toHaveBeenCalled();
    expect(vi.mocked(sendMail).mock.calls[0]?.[0].attachments).toEqual([]);
  });

  it('échec : même clé au nouvel essai (pas de double envoi), fenêtre gardée ouverte', async () => {
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('Service d’envoi indisponible'));
    vi.mocked(sendMail).mockResolvedValueOnce({ id: 're_789' });
    const { onClose } = renderDialog('client@exemple.fr');
    const button = await screen.findByRole('button', { name: /Envoyer l’e-mail maintenant/ });
    await userEvent.click(button);
    await waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(button);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [first, second] = vi.mocked(sendMail).mock.calls;
    expect(second?.[0].idempotencyKey).toBe(first?.[0].idempotencyKey);
  });

  it('sans e-mail valide : envoi impossible', async () => {
    renderDialog('client@');
    expect(await screen.findByRole('button', { name: /Envoyer l’e-mail maintenant/ })).toBeDisabled();
    expect(screen.getByText('Renseigne l’e-mail du client pour l’envoyer.')).toBeInTheDocument();
  });
});
