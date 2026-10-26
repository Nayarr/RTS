import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import {
  askAgent,
  deleteConversation,
  fetchBriefing,
  fetchConversations,
  fetchPreparedReplies,
  fetchTurns,
  postponeReply,
  sendPreparedReply,
  type AgentBriefing,
  type AgentTurn,
  type PreparedReply,
} from './api';
import { AssistantPage } from './AssistantPage';
import { saveListened } from './briefing-player';
import { speak, stopSpeaking } from './speech';
import type * as SpeechModule from './speech';
import { SUGGESTIONS } from './suggestions';

vi.mock('./api', () => ({
  askAgent: vi.fn(),
  countMailsToHandle: vi.fn(() => Promise.resolve(3)),
  fetchBriefing: vi.fn(),
  fetchPreparedReplies: vi.fn(),
  postponeReply: vi.fn(),
  sendPreparedReply: vi.fn(),
  fetchConversations: vi.fn(),
  fetchTurns: vi.fn(),
  deleteConversation: vi.fn(),
  fetchPendingActions: vi.fn(() => Promise.resolve([])),
  executeAgentAction: vi.fn(),
  cancelAgentAction: vi.fn(),
}));
vi.mock('./speech', async (importOriginal) => ({
  ...(await importOriginal<typeof SpeechModule>()),
  speechSupported: () => true,
  speak: vi.fn(),
  stopSpeaking: vi.fn(),
}));
// L'orbe dessine sur un canvas, absent de l'environnement de test
vi.mock('./VoiceOrb', () => ({
  VoiceOrb: ({ state }: { state: string }) => <div data-testid="orbe">{state}</div>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Fenêtre d'envoi (réglages d'envoi lus dans la base) : seul son titre compte ici
vi.mock('@/components/SendLinkDialog', () => ({
  SendLinkDialog: ({ title }: { title: string }) => <div role="dialog" aria-label={title} />,
}));

const turn = (overrides: Partial<AgentTurn> = {}): AgentTurn => ({
  id: 't1',
  conversation_id: 'c1',
  question: SUGGESTIONS[0] ?? '',
  answer: 'Ce mois-ci, 12 450 euros HT sur 18 factures.',
  spoken: false,
  tools: ['chiffres_du_mois', 'factures_impayees'],
  tables: [],
  created_at: '2026-10-06T09:00:00Z',
  ...overrides,
});

const BRIEFING: AgentBriefing = {
  day: '2026-10-09',
  text: 'Transports Moreau doit 4 380 euros depuis le 12 septembre.\nSix OR au programme, Bruno est absent.',
  phrases: [
    {
      etiquette: 'Paiements',
      texte: 'Transports Moreau doit 4 380 euros depuis le 12 septembre.',
      urgent: true,
    },
    { etiquette: 'Atelier', texte: 'Six OR au programme, Bruno est absent.', urgent: false },
  ],
  tools: ['factures_impayees', 'atelier_aujourdhui'],
  updated_at: '2026-10-09T06:12:00Z',
};

const REPLY: PreparedReply = {
  id: 'r1',
  mailbox: 'atelier@rapidtruckservice.fr',
  from_name: 'Jean Moreau',
  from_address: 'jean@transports-moreau.fr',
  subject: 'Devis embrayage',
  received_at: '2026-10-09T05:31:00Z',
  category: 'devis',
  urgency: 'normale',
  summary: 'Devis embrayage Volvo FH AB-123-CD.',
  reply_status: 'ready',
  reply_request: 'Il veut un devis pour l’embrayage de son Volvo AB-123-CD.',
  reply_subject: 'Re: Devis embrayage',
  reply_body:
    'Bonjour Monsieur Moreau,\nNous pouvons vous recevoir mardi.\nCordialement,\nRapid Truck Service',
  reply_basis: 'Charge de mardi : 6 h libres',
  reply_sent_at: null,
  clients: { name: 'Transports Moreau & Fils' },
};

/** Termine la phrase en cours de lecture (la voix simulée ne finit jamais d'elle-même). */
const endSpeech = () =>
  act(() => {
    const call = vi.mocked(speak).mock.calls.at(-1);
    call?.[1]?.();
    return Promise.resolve();
  });
const lastSpoken = () => vi.mocked(speak).mock.calls.at(-1)?.[0];

/** Reconnaissance vocale simulée qui entend la phrase donnée. */
const hearing = (heard: string) =>
  class {
    lang = '';
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      setTimeout(() => {
        this.onresult?.({
          resultIndex: 0,
          results: [Object.assign([{ transcript: heard }], { isFinal: true })],
        });
        this.onend?.();
      }, 20);
    }
    stop() {
      this.onend?.();
    }
    abort() {
      this.onend?.();
    }
  };

/** Fausse reconnaissance vocale : entend « qui nous doit de l'argent » puis s'arrête. */
class FakeRecognition {
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start() {
    setTimeout(() => {
      this.onresult?.({
        resultIndex: 0,
        results: [
          Object.assign(
            [{ transcript: 'qui nous doit de l’argent ?' }, { transcript: 'qui nous doit de la gent ?' }],
            { isFinal: true },
          ),
        ],
      });
      this.onend?.();
    }, 150);
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

const setup = () =>
  renderRoutes([{ path: '/agent-direction', element: <AssistantPage /> }], {
    initialPath: '/agent-direction',
  });

describe('Agent Direction', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchConversations).mockResolvedValue([]);
    vi.mocked(fetchTurns).mockResolvedValue([]);
    vi.mocked(fetchBriefing).mockResolvedValue(BRIEFING);
    vi.mocked(fetchPreparedReplies).mockResolvedValue([]);
    vi.mocked(sendPreparedReply).mockResolvedValue({ id: 'envoi' });
    vi.mocked(postponeReply).mockResolvedValue();
    // Point déjà écouté aujourd'hui : il ne repart pas tout seul (sauf dans ses propres tests)
    saveListened(new Date());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('question proposée : réponse affichée avec ses sources et lue à voix haute', async () => {
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't1', answer: turn().answer });
    vi.mocked(fetchTurns).mockResolvedValue([turn()]);
    setup();

    await screen.findByRole('region', { name: 'Point du jour' });
    await waitFor(() => expect(screen.getByTestId('orbe')).toHaveTextContent('idle'));
    await userEvent.click(screen.getByRole('button', { name: SUGGESTIONS[0] }));

    expect(vi.mocked(askAgent).mock.calls[0]?.[0]).toEqual({
      conversationId: undefined,
      question: SUGGESTIONS[0],
      spoken: false,
    });
    expect(await screen.findByText(turn().answer)).toBeInTheDocument();
    expect(screen.getByText('Sources : chiffres du mois, factures impayées')).toBeInTheDocument();
    expect(speak).toHaveBeenCalledWith(turn().answer, expect.any(Function));
    expect(screen.getByTestId('orbe')).toHaveTextContent('speaking');
  });

  it('question à la voix : orbe à l’écoute puis question envoyée comme posée à la voix', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't2', answer: '9 063 euros.' });
    setup();

    await userEvent.click(await screen.findByRole('button', { name: 'Poser la question à la voix' }));
    expect(screen.getByTestId('orbe')).toHaveTextContent('listening');
    expect(screen.getByRole('status')).toHaveTextContent('J’écoute');
    await waitFor(() =>
      expect(vi.mocked(askAgent).mock.calls[0]?.[0]).toEqual({
        conversationId: undefined,
        question: 'Qui nous doit de l’argent ?',
        spoken: true,
        alternatives: ['Qui nous doit de la gent ?'],
      }),
    );
  });

  it('conversation reprise depuis l’historique, échanges précédents dépliables', async () => {
    vi.mocked(fetchConversations).mockResolvedValue([
      { id: 'c1', title: 'CA du mois ?', updated_at: '2026-10-06T09:00:00Z' },
    ]);
    vi.mocked(fetchTurns).mockResolvedValue([
      turn({ id: 't0', question: 'CA du mois ?', answer: 'Premier échange.' }),
      turn(),
    ]);
    setup();

    await userEvent.click(await screen.findByRole('button', { name: 'Historique' }));
    const history = screen.getByRole('complementary', { name: 'Conversations' });
    await userEvent.click(await within(history).findByRole('button', { name: /^CA du mois/ }));
    expect(await screen.findByText(turn().answer)).toBeInTheDocument();
    expect(screen.queryByText('Premier échange.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les échanges précédents (1)' }));
    expect(screen.getByText('Premier échange.')).toBeInTheDocument();
  });

  it('réponses en silence : rien n’est lu et le choix est gardé', async () => {
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't1', answer: 'Réponse.' });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Réponses lues' }));
    expect(stopSpeaking).toHaveBeenCalled();
    expect(localStorage.getItem('rts-assistant-voix')).toBe('off');

    await userEvent.click(screen.getByRole('button', { name: 'Écrire la question' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Question à l’agent' }), 'Et hier ?{Enter}');
    await waitFor(() => expect(askAgent).toHaveBeenCalled());
    expect(speak).not.toHaveBeenCalled();
  });

  it('agent désactivé : message, lien vers les réglages, question gardée', async () => {
    vi.mocked(askAgent).mockRejectedValue(new Error('Assistant désactivé dans les réglages'));
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Écrire la question' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Question à l’agent' }), 'CA ?{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Assistant désactivé dans les réglages');
    expect(screen.getByRole('textbox', { name: 'Question à l’agent' })).toHaveValue('CA ?');
    expect(within(alert).getByRole('link', { name: 'Ouvrir les réglages' })).toHaveAttribute(
      'href',
      '/reglages?onglet=atelier',
    );
  });

  it('conversation effacée depuis l’historique', async () => {
    vi.mocked(fetchConversations).mockResolvedValue([
      { id: 'c1', title: 'CA du mois ?', updated_at: '2026-10-06T09:00:00Z' },
    ]);
    vi.mocked(deleteConversation).mockResolvedValue();
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Historique' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Effacer la conversation « CA du mois ? »' }),
    );
    await waitFor(() => expect(deleteConversation).toHaveBeenCalledWith('c1', expect.anything()));
  });

  it('dictée indisponible : micro grisé, saisie au clavier affichée', async () => {
    setup();
    expect(await screen.findByLabelText('Dictée indisponible sur ce navigateur')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Question à l’agent' })).toBeEnabled();
  });

  it('point du jour lu à l’ouverture phrase par phrase, surligné, puis reconsultable', async () => {
    localStorage.removeItem('rts-point-du-jour-ecoute');
    setup();
    const card = await screen.findByRole('region', { name: 'Point du jour' });
    await waitFor(() => expect(lastSpoken()).toBe(BRIEFING.phrases[0]?.texte));
    expect(screen.getByTestId('orbe')).toHaveTextContent('speaking');
    expect(within(card).getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'true');
    expect(within(card).getByText('Phrase 1 sur 2')).toBeInTheDocument();
    await endSpeech();
    expect(lastSpoken()).toBe(BRIEFING.phrases[1]?.texte);
    expect(within(card).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'true');
    await endSpeech();
    // Après l'écoute : le point reste affiché, on peut le réécouter
    expect(await within(card).findByRole('button', { name: 'Réécouter' })).toBeInTheDocument();
    expect(within(card).getByText(/Le point reste ici toute la journée/)).toBeInTheDocument();
    expect(within(card).getByText(BRIEFING.phrases[0]?.texte ?? '')).toBeInTheDocument();
    expect(within(card).getByText('Paiements')).toHaveClass('urgent');
  });

  it('point du jour refait avec les données du moment', async () => {
    setup();
    const card = await screen.findByRole('region', { name: 'Point du jour' });
    expect(await within(card).findByText(/Transports Moreau doit 4 380 euros/)).toBeInTheDocument();
    expect(within(card).getByText('Sources : factures impayées, atelier du jour')).toBeInTheDocument();
    expect(fetchBriefing).toHaveBeenCalledWith();
    vi.mocked(fetchBriefing).mockResolvedValue({
      ...BRIEFING,
      phrases: [{ etiquette: 'Atelier', texte: 'Rien d’urgent ce matin.', urgent: false }],
    });
    await userEvent.click(
      within(card).getByRole('button', { name: 'Refaire le point avec les données du moment' }),
    );
    expect(await screen.findByText('Rien d’urgent ce matin.')).toBeInTheDocument();
    expect(fetchBriefing).toHaveBeenLastCalledWith(true);
  });

  it('réponse préparée : résumé du mail, réponse dictée, « envoie » à la voix, envoi après 5 secondes', async () => {
    localStorage.removeItem('rts-point-du-jour-ecoute');
    vi.mocked(fetchPreparedReplies).mockResolvedValue([REPLY]);
    vi.stubGlobal('webkitSpeechRecognition', hearing('oui envoie-la'));
    setup();
    await waitFor(() => expect(lastSpoken()).toBe(BRIEFING.phrases[0]?.texte));
    await endSpeech();
    await endSpeech();
    expect(lastSpoken()).toBe(
      'Mail de Jean Moreau. Il veut un devis pour l’embrayage de son Volvo AB-123-CD. Voici la réponse préparée.',
    );
    const mail = screen.getByRole('article', { name: 'Mail de Jean Moreau' });
    expect(screen.getByRole('heading', { name: 'Réponse préparée' })).toBeInTheDocument();
    expect(within(mail).getByText('S’appuie sur : Charge de mardi : 6 h libres')).toBeInTheDocument();
    await endSpeech();
    expect(lastSpoken()).toBe('Bonjour Monsieur Moreau,');
    await endSpeech();
    expect(within(mail).getByText('Nous pouvons vous recevoir mardi.')).toHaveClass('now');
    await endSpeech();
    await endSpeech();
    await endSpeech();
    expect(lastSpoken()).toBe('Je l’envoie à Jean Moreau ?');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await endSpeech();
    expect(
      await within(mail).findByText('Envoi dans 5 secondes à jean@transports-moreau.fr'),
    ).toBeInTheDocument();
    expect(sendPreparedReply).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(() => expect(sendPreparedReply).toHaveBeenCalledWith(REPLY, expect.anything()));
  });

  it('réponse relue : envoi annulé pendant les 5 secondes, plus tard, modifier', async () => {
    vi.mocked(fetchPreparedReplies).mockResolvedValue([REPLY]);
    setup();
    const card = await screen.findByRole('region', { name: 'Point du jour' });
    await userEvent.click(
      await within(card).findByRole('button', { name: 'Relire la réponse à Jean Moreau' }),
    );
    const mail = screen.getByRole('article', { name: 'Mail de Jean Moreau' });
    expect(
      within(mail).getByText('Je l’envoie à jean@transports-moreau.fr depuis atelier@ ?'),
    ).toBeInTheDocument();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    await userEvent.click(within(mail).getByRole('button', { name: 'Envoyer' }));
    await userEvent.click(within(mail).getByRole('button', { name: 'Annuler l’envoi' }));
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(sendPreparedReply).not.toHaveBeenCalled();
    vi.useRealTimers();

    await userEvent.click(within(mail).getByRole('button', { name: 'Modifier' }));
    expect(screen.getByRole('dialog', { name: 'Répondre à Jean Moreau' })).toBeInTheDocument();

    await userEvent.click(within(mail).getByRole('button', { name: 'Plus tard' }));
    await waitFor(() => expect(postponeReply).toHaveBeenCalledWith('r1'));
  });

  it('réponse déjà envoyée : heure d’envoi affichée, plus de bouton', async () => {
    vi.mocked(fetchPreparedReplies).mockResolvedValue([
      { ...REPLY, reply_status: 'sent', reply_sent_at: '2026-10-09T06:15:00Z' },
    ]);
    setup();
    const card = await screen.findByRole('region', { name: 'Point du jour' });
    expect(await within(card).findByText(/Envoyée à/)).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Envoyer la réponse/ })).toBeNull();
    expect(within(card).getByText('1 envoyée sur 1')).toBeInTheDocument();
  });

  it('point du jour masqué pendant une conversation, revenu avec une nouvelle conversation', async () => {
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't1', answer: turn().answer });
    vi.mocked(fetchTurns).mockResolvedValue([turn()]);
    setup();
    await screen.findByText(/Transports Moreau/);
    await userEvent.click(screen.getByRole('button', { name: SUGGESTIONS[0] }));
    expect(await screen.findByText(turn().answer)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Point du jour' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Point du jour' }));
    expect(await screen.findByText(/Transports Moreau/)).toBeInTheDocument();
    expect(fetchBriefing).toHaveBeenCalledTimes(1);
  });

  it('nouvelle conversation : page vide prête pour une question, la suivante part sans conversation', async () => {
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't1', answer: turn().answer });
    vi.mocked(fetchTurns).mockResolvedValue([turn()]);
    setup();
    await screen.findByText(/Transports Moreau/);
    await userEvent.click(screen.getByRole('button', { name: SUGGESTIONS[0] }));
    expect(await screen.findByText(turn().answer)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle conversation' }));
    expect(screen.queryByText(turn().answer)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Point du jour' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Exemples de questions' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: SUGGESTIONS[1] }));
    await waitFor(() => expect(askAgent).toHaveBeenCalledTimes(2));
    expect(vi.mocked(askAgent).mock.calls[1]?.[0]).toMatchObject({ conversationId: undefined });
  });

  it('point du jour indisponible : raison affichée, questions toujours possibles', async () => {
    vi.mocked(fetchBriefing).mockRejectedValue(new Error('Assistant pas encore configuré'));
    setup();
    const card = await screen.findByRole('region', { name: 'Point du jour' });
    expect(
      await within(card).findByText('Point du jour indisponible : Assistant pas encore configuré'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: SUGGESTIONS[0] })).toBeEnabled();
  });

  it('mails à traiter comptés, lien vers la liste des mails reçus', async () => {
    setup();
    const link = await screen.findByRole('link', { name: /Mails reçus/ });
    expect(link).toHaveAttribute('href', '/agent-direction/mails');
    expect(await within(link).findByLabelText('3 à traiter')).toBeInTheDocument();
  });
});
