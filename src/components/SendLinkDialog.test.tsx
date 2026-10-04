import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMailSettings, sendMail, type MailSettings } from '@/lib/mail';
import { SendLinkDialog } from './SendLinkDialog';

vi.mock('@/lib/mail', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMailSettings: vi.fn(),
  sendMail: vi.fn(),
}));

const cleanups: (() => void)[] = [];
const settings = (overrides: Partial<MailSettings> = {}): MailSettings => ({
  enabled: false,
  domain: null,
  locals: { billing: 'facturation', workshop: 'atelier', signature: 'signature' },
  companyName: 'RAPID TRUCK SERVICE',
  companyEmail: 'atelier@rapidtruckservice.fr',
  ...overrides,
});
const PDF = { blob: new Blob(['%PDF']), fileName: 'F00012.pdf' };
const LINK = 'https://atelier.rapidtruckservice.fr/d/abc';
const INVOICE = {
  subject: 'Facture F00012 · RAPID TRUCK SERVICE',
  body: `Bonjour,\n\nVeuillez trouver ci-dessous le lien vers votre facture F00012 :\n\n${LINK}\n\nCordialement,\nRAPID TRUCK SERVICE`,
  sms: `Facture F00012 : ${LINK}`,
};

const renderDialog = (
  email: string,
  {
    onSend = vi.fn(),
    attachments,
    onClose = vi.fn(),
    link,
  }: {
    onSend?: (channel: 'email' | 'sms', contact: { email: string; phone: string }, id?: string) => void;
    attachments?: () => Promise<(typeof PDF)[]>;
    onClose?: () => void;
    link?: string;
  } = {},
) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SendLinkDialog
        title="Envoyer la facture F00012"
        intro="Message pré-rédigé."
        link={link}
        linkLabel="Consulter la facture"
        message={link ? INVOICE : { subject: 'Véhicule prêt', body: 'Bonjour', sms: 'Bonjour' }}
        senderEmail="atelier@rapidtruckservice.fr"
        mailCategory="billing"
        contact={{ email, phone: '' }}
        onContactSave={vi.fn()}
        onSend={onSend}
        attachments={attachments && { label: 'la facture F00012 (PDF)', load: attachments }}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onSend, onClose };
};

/** Clic sur le lien « mailto: » sans le suivre (écouté après le gestionnaire de l'appli). */
function watchLink(link: HTMLElement) {
  const opened = vi.fn();
  const listener = (event: MouseEvent) => {
    if (event.target instanceof Node && link.contains(event.target)) {
      opened(!event.defaultPrevented);
      event.preventDefault();
    }
  };
  document.addEventListener('click', listener);
  cleanups.push(() => document.removeEventListener('click', listener));
  return opened;
}

beforeEach(() => {
  vi.mocked(fetchMailSettings).mockResolvedValue(settings());
  vi.mocked(sendMail).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe('envoi par la messagerie (envoi par l’appli désactivé)', () => {
  it('Gmail s’ouvre sur le compte de l’atelier', async () => {
    renderDialog('client@exemple.fr');
    await waitFor(() => expect(fetchMailSettings).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Ouvrir dans Gmail' }).getAttribute('href')).toContain(
      'authuser=atelier%40rapidtruckservice.fr',
    );
    expect(screen.queryByRole('region', { name: 'Aperçu de l’e-mail' })).toBeNull();
  });

  it('sans e-mail du client : confirmation ; « Annuler » n’ouvre rien et ne trace rien', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onSend } = renderDialog('');
    const link = screen.getByRole('link', { name: /messagerie de l’ordinateur/ });
    const opened = watchLink(link);
    await userEvent.click(link);
    expect(confirm).toHaveBeenCalledWith('Aucun e-mail client renseigné. Ouvrir quand même la messagerie ?');
    expect(opened).toHaveBeenCalledWith(false);
    expect(onSend).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(link);
    expect(opened).toHaveBeenLastCalledWith(true);
    expect(onSend).toHaveBeenCalledWith('email', { email: '', phone: '' });
  });

  it('domaine réglé : Gmail ouvert sur l’adresse du type de message', async () => {
    vi.mocked(fetchMailSettings).mockResolvedValue(settings({ domain: 'rapidtruckservice.fr' }));
    renderDialog('client@exemple.fr');
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Ouvrir dans Gmail' }).getAttribute('href')).toContain(
        'authuser=facturation%40rapidtruckservice.fr',
      ),
    );
  });
});

describe('envoi par l’appli : aperçu et texte modifiable', () => {
  beforeEach(() =>
    vi
      .mocked(fetchMailSettings)
      .mockResolvedValue(settings({ enabled: true, domain: 'rapidtruckservice.fr' })),
  );

  it('le lien sort du texte et devient un bouton sous le message, visible dans l’aperçu', async () => {
    renderDialog('compta@client.fr', { link: LINK });
    const preview = await screen.findByRole('region', { name: 'Aperçu de l’e-mail' });
    const text = screen.getByLabelText('Message');
    expect(text).toHaveValue(
      'Bonjour,\n\nVeuillez trouver ci-dessous le lien vers votre facture F00012.\n\nCordialement,\nRAPID TRUCK SERVICE',
    );
    expect(screen.getByText('RAPID TRUCK SERVICE <facturation@rapidtruckservice.fr>')).toBeInTheDocument();
    expect(within(preview).getByText('Consulter la facture')).toBeInTheDocument();
    expect(
      within(preview).getByText(`Le bouton ne marche pas ? Copiez ce lien : ${LINK}`),
    ).toBeInTheDocument();
    expect(within(preview).getByText('À compta@client.fr')).toBeInTheDocument();
  });

  it('texte modifié : aperçu à jour, « Rétablir » remet le texte d’origine', async () => {
    renderDialog('compta@client.fr', { link: LINK });
    const text = await screen.findByLabelText('Message');
    await userEvent.type(text, '{End} Merci.');
    const preview = screen.getByRole('region', { name: 'Aperçu de l’e-mail' });
    expect(screen.getByText('Modifié')).toBeInTheDocument();
    expect(within(preview).getByText(/RAPID TRUCK SERVICE Merci\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Rétablir le texte d’origine/ }));
    expect(screen.queryByText('Modifié')).toBeNull();
    expect((text as HTMLTextAreaElement).value).not.toContain('Merci.');
  });

  it('envoie l’objet et le texte relus, le lien du bouton et le PDF ; trace l’envoi et ferme', async () => {
    vi.mocked(sendMail).mockResolvedValue({ id: 're_123' });
    const load = vi.fn().mockResolvedValue([PDF]);
    const { onSend, onClose } = renderDialog('compta@client.fr', { link: LINK, attachments: load });
    const subject = await screen.findByLabelText('Objet');
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Votre facture');
    expect(screen.getByRole('checkbox', { name: /Joindre la facture F00012 \(PDF\)/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /Envoyer l’e-mail/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const sent = vi.mocked(sendMail).mock.calls[0]?.[0];
    expect(sent?.category).toBe('billing');
    expect(sent?.to).toBe('compta@client.fr');
    expect(sent?.subject).toBe('Votre facture');
    expect(sent?.text).not.toContain(LINK);
    expect(sent?.link).toEqual({ label: 'Consulter la facture', url: LINK });
    expect(sent?.attachments).toEqual([PDF]);
    expect(sent?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(onSend).toHaveBeenCalledWith('email', { email: 'compta@client.fr', phone: '' }, 're_123');
  });

  it('pièce jointe décochée : le PDF n’est pas généré', async () => {
    vi.mocked(sendMail).mockResolvedValue({ id: 're_456' });
    const load = vi.fn().mockResolvedValue([PDF]);
    renderDialog('compta@client.fr', { attachments: load });
    await userEvent.click(await screen.findByRole('checkbox', { name: /Joindre la facture/ }));
    await userEvent.click(screen.getByRole('button', { name: /Envoyer l’e-mail/ }));
    await waitFor(() => expect(sendMail).toHaveBeenCalled());
    expect(load).not.toHaveBeenCalled();
    expect(vi.mocked(sendMail).mock.calls[0]?.[0].attachments).toEqual([]);
  });

  it('échec : alerte dans la fenêtre, texte gardé, même clé au nouvel essai', async () => {
    vi.mocked(sendMail).mockRejectedValueOnce(new Error('service d’envoi indisponible'));
    vi.mocked(sendMail).mockResolvedValueOnce({ id: 're_789' });
    const { onClose } = renderDialog('compta@client.fr');
    await userEvent.click(await screen.findByRole('button', { name: /Envoyer l’e-mail/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail non envoyé : service d’envoi indisponible',
    );
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [first, second] = vi.mocked(sendMail).mock.calls;
    expect(second?.[0].idempotencyKey).toBe(first?.[0].idempotencyKey);
  });

  it('sans e-mail valide : envoi impossible ; message sans lien : envoi par SMS proposé', async () => {
    renderDialog('client@');
    expect(await screen.findByRole('button', { name: /Envoyer l’e-mail/ })).toBeDisabled();
    expect(screen.getByText('Renseigne l’e-mail du client pour l’envoyer.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Envoyer par SMS/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copier le lien/ })).toBeNull();
  });
});
