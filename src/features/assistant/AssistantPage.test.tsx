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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const turn = (overrides: Partial<AgentTurn> = {}): AgentTurn => ({
  id: 't1',
  conversation_id: 'c1',
  question: SUGGESTIONS[0] ?? '',
  answer: 'Ce mois-ci, 12 450 euros HT sur 18 factures.',
  spoken: false,
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
        results: [Object.assign([{ transcript: 'qui nous doit de l’argent ?' }], { isFinal: true })],
      });
      this.onend?.();
    }, 20);
  }
  stop() {
    this.onend?.();
  }
  abort() {}
}

const setup = () =>
  renderRoutes([{ path: '/pilotage/assistant', element: <AssistantPage /> }], {
    initialPath: '/pilotage/assistant',
  });

describe('AssistantPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchConversations).mockResolvedValue([]);
    vi.mocked(fetchTurns).mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('question proposée : réponse affichée et lue à voix haute', async () => {
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't1', answer: turn().answer });
    vi.mocked(fetchTurns).mockResolvedValue([turn()]);
    vi.mocked(fetchConversations)
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'c1', title: SUGGESTIONS[0] ?? '', updated_at: '2026-10-06T09:00:00Z' }]);
    setup();

    expect(await screen.findByText('Que veux-tu savoir ?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: SUGGESTIONS[0] }));

    expect(vi.mocked(askAgent).mock.calls[0]?.[0]).toEqual({
      conversationId: undefined,
      question: SUGGESTIONS[0],
      spoken: false,
    });
    expect(await screen.findByText(turn().answer)).toBeInTheDocument();
    expect(speak).toHaveBeenCalledWith(turn().answer, expect.any(Function));
    const history = screen.getByRole('complementary', { name: 'Conversations' });
    expect(await within(history).findByRole('button', { name: /^Combien on a facturé/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('question à la voix : envoyée comme posée à la voix, dans la même conversation', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    vi.mocked(fetchConversations).mockResolvedValue([
      { id: 'c1', title: 'CA du mois ?', updated_at: '2026-10-06T09:00:00Z' },
    ]);
    vi.mocked(fetchTurns).mockResolvedValue([turn()]);
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't2', answer: '9 063 euros.' });
    setup();

    await userEvent.click(await screen.findByRole('button', { name: /^CA du mois/ }));
    expect(await screen.findByText(turn().answer)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Poser la question à la voix' }));

    await waitFor(() =>
      expect(vi.mocked(askAgent).mock.calls[0]?.[0]).toEqual({
        conversationId: 'c1',
        question: 'Qui nous doit de l’argent ?',
        spoken: true,
      }),
    );
  });

  it('réponses en silence : rien n’est lu et le choix est gardé', async () => {
    vi.mocked(askAgent).mockResolvedValue({ conversation_id: 'c1', turn_id: 't1', answer: 'Réponse.' });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Lire les réponses à voix haute' }));
    expect(stopSpeaking).toHaveBeenCalled();
    expect(localStorage.getItem('rts-assistant-voix')).toBe('off');

    await userEvent.type(screen.getByRole('textbox', { name: 'Question à l’assistant' }), 'Et hier ?{Enter}');
    await waitFor(() => expect(askAgent).toHaveBeenCalled());
    expect(speak).not.toHaveBeenCalled();
  });

  it('assistant désactivé : message et lien vers les réglages', async () => {
    vi.mocked(askAgent).mockRejectedValue(new Error('Assistant désactivé dans les réglages'));
    setup();
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Question à l’assistant' }),
      'CA ?{Enter}',
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Assistant désactivé dans les réglages');
    expect(screen.getByRole('textbox', { name: 'Question à l’assistant' })).toHaveValue('CA ?');
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
    await userEvent.click(
      await screen.findByRole('button', { name: 'Effacer la conversation « CA du mois ? »' }),
    );
    await waitFor(() => expect(deleteConversation).toHaveBeenCalledWith('c1', expect.anything()));
  });

  it('dictée indisponible : micro grisé, saisie au clavier possible', async () => {
    setup();
    expect(await screen.findByLabelText('Dictée indisponible sur ce navigateur')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Question à l’assistant' })).toBeEnabled();
  });
});
