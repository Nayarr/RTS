import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { fetchInboxEmails, fetchInboxWebhookStatus, setMailsHandled } from './api';
import { matchesMailFilter, sortMails, type InboxEmail } from './mails';
import { MailsPage } from './MailsPage';

vi.mock('./api', () => ({
  fetchInboxEmails: vi.fn(),
  fetchInboxWebhookStatus: vi.fn(),
  setMailsHandled: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mail = (overrides: Partial<InboxEmail> = {}): InboxEmail => ({
  id: 'm1',
  mailbox: 'atelier@rapidtruckservice.fr',
  from_name: 'Jean Moreau',
  from_address: 'jean@transports-moreau.fr',
  subject: 'Devis embrayage AB-123-CD',
  body: 'Bonjour,\nPouvez-vous me faire un devis ?\n<script>alert(1)</script>',
  attachments: [{ filename: 'photo.jpg', content_type: 'image/jpeg' }],
  received_at: '2026-10-08T08:12:00Z',
  triage_status: 'done',
  category: 'devis',
  urgency: 'normale',
  summary: 'Transports Moreau demande un devis embrayage pour AB-123-CD.',
  needs_reply: true,
  handled_at: null,
  clients: { name: 'Transports Moreau & Fils' },
  ...overrides,
});

const MAILS = [
  mail(),
  mail({
    id: 'm2',
    from_name: 'Fontaine Livraisons',
    subject: 'Camion en panne',
    summary: 'Camion immobilisé à Cergy, demande un dépannage.',
    urgency: 'urgente',
    category: 'rendez_vous',
    received_at: '2026-10-07T09:00:00Z',
    clients: null,
  }),
  mail({ id: 'm3', subject: 'Promo pneus', category: 'publicite', urgency: 'faible', needs_reply: false }),
  mail({ id: 'm4', subject: 'Facture réglée', handled_at: '2026-10-08T10:00:00Z', needs_reply: false }),
];

const setup = () =>
  renderRoutes([{ path: '/agent-direction/mails', element: <MailsPage /> }], {
    initialPath: '/agent-direction/mails',
  });

describe('Mails reçus', () => {
  beforeEach(() => {
    vi.mocked(fetchInboxEmails).mockResolvedValue(MAILS);
    vi.mocked(setMailsHandled).mockResolvedValue();
    vi.mocked(fetchInboxWebhookStatus).mockResolvedValue({
      id: true,
      received_at: '2026-10-08T08:12:00Z',
      result: 'stored',
      recipients: [],
      domain: 'rapidtruckservice.fr',
    });
  });

  it('liste vide : la raison du dernier mail ignoré est affichée', async () => {
    vi.mocked(fetchInboxEmails).mockResolvedValue([]);
    vi.mocked(fetchInboxWebhookStatus).mockResolvedValue({
      id: true,
      received_at: '2026-10-08T08:12:00Z',
      result: 'not_atelier',
      recipients: ['tri-7f3k@abc.resend.app'],
      domain: 'rapidtruckservice.fr',
    });
    setup();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Dernier mail ignoré : il n’est adressé à aucune boîte @rapidtruckservice.fr (destinataires : tri-7f3k@abc.resend.app)',
    );
  });

  it('aucun appel de Resend : redirecteur et webhook à vérifier', async () => {
    vi.mocked(fetchInboxEmails).mockResolvedValue([]);
    vi.mocked(fetchInboxWebhookStatus).mockResolvedValue(null);
    setup();
    expect(await screen.findByRole('status')).toHaveTextContent(/Aucun mail n’est encore arrivé de Resend/);
  });

  it('filtres : à traiter sans publicité ni mails traités, urgents en premier', () => {
    expect(MAILS.filter((item) => matchesMailFilter(item, 'todo')).map(({ id }) => id)).toEqual(['m1', 'm2']);
    expect(MAILS.filter((item) => matchesMailFilter(item, 'junk')).map(({ id }) => id)).toEqual(['m3']);
    expect(MAILS.filter((item) => matchesMailFilter(item, 'handled')).map(({ id }) => id)).toEqual(['m4']);
    expect(sortMails(MAILS.slice(0, 2), 'todo').map(({ id }) => id)).toEqual(['m2', 'm1']);
    expect(sortMails(MAILS.slice(0, 2), 'all').map(({ id }) => id)).toEqual(['m1', 'm2']);
  });

  it('liste triée : résumé, client reconnu, catégorie, réponse attendue', async () => {
    setup();
    const list = await screen.findByRole('list', { name: 'Mails' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Camion immobilisé à Cergy');
    expect(within(rows[0]!).getByRole('img', { name: 'Urgence : urgent' })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('client : Transports Moreau & Fils');
    expect(rows[1]).toHaveTextContent('Demande de devis');
    expect(rows[1]).toHaveTextContent('Réponse attendue');
    expect(rows[1]).toHaveTextContent('1 pièce jointe');
    expect(screen.getByRole('button', { name: /^À traiter/ })).toHaveTextContent('2');
  });

  it('mail ouvert : texte brut affiché tel quel (aucun code exécuté)', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /^Jean Moreau/ }));
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(
      screen.getByText(/reçu sur atelier@rapidtruckservice.fr · pièces jointes : photo.jpg/),
    ).toBeInTheDocument();
  });

  it('mail marqué traité, puis remis à traiter depuis « Traités »', async () => {
    setup();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Marquer traité : Devis embrayage AB-123-CD' }),
    );
    await waitFor(() => expect(setMailsHandled).toHaveBeenCalledWith(['m1'], true));

    await userEvent.click(screen.getByRole('button', { name: /^Traités/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remettre à traiter : Facture réglée' }));
    await waitFor(() => expect(setMailsHandled).toHaveBeenLastCalledWith(['m4'], false));
  });

  it('aucun mail : explique d’où viennent les copies', async () => {
    vi.mocked(fetchInboxEmails).mockResolvedValue([]);
    setup();
    expect(await screen.findByText(/Aucun mail reçu pour l’instant/)).toBeInTheDocument();
  });
});
