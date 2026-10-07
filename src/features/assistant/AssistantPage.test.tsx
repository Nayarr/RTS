import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { askAgent, deleteConversation, fetchConversations, fetchTurns, type AgentTurn } from './api';
import { AssistantPage } from './AssistantPage';
import { speak, stopSpeaking } from './speech';
import type * as SpeechModule from './speech';
import { SUGGESTIONS } from './suggestions';

vi.mock('./api', () => ({
  askAgent: vi.fn(),
  fetchConversations: vi.fn(),
  fetchTurns: vi.fn(),
  deleteConversation: vi.fn(),
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

const turn = (overrides: Partial<AgentTurn> = {}): AgentTurn => ({
  id: 't1',
  conversation_id: 'c1',
  question: SUGGESTIONS[0] ?? '',
  answer: 'Ce mois-ci, 12 450 euros HT sur 18 factures.',
  spoken: false,
  tools: ['chiffres_du_mois', 'factures_impayees'],
  created_at: '2026-10-06T09:00:00Z',
  ...overrides,
});

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
    }, 20);
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
  });
  afterEach(() => vi.unstubAllGlobals());

  it('question proposée : réponse affichée avec ses sources et lue à voix haute', async () => {
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't1', answer: turn().answer });
    vi.mocked(fetchTurns).mockResolvedValue([turn()]);
    setup();

    expect(await screen.findByText('que veux-tu savoir ?')).toBeInTheDocument();
    expect(screen.getByTestId('orbe')).toHaveTextContent('idle');
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
});
