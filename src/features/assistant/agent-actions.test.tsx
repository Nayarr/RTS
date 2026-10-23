import { createRef } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { AgentActions, type AgentActionsHandle } from './AgentActions';
import { isGoAhead } from './agent-actions';
import { cancelAgentAction, executeAgentAction, sendAgentMail, type AgentAction } from './api';
import type * as AssistantApi from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AssistantApi>()),
  executeAgentAction: vi.fn(),
  sendAgentMail: vi.fn(),
  cancelAgentAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const action: AgentAction = {
  id: 'a1',
  conversation_id: 'c1',
  kind: 'ro_work',
  summary: 'Ajouter « Changer les balais » aux travaux de l’OR OR00488',
  status: 'proposed',
  result: null,
  error: null,
  created_at: '2026-10-13T09:00:00Z',
  payload: null,
};

describe('actions préparées par l’Agent Direction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(executeAgentAction).mockResolvedValue({ ...action, status: 'done' });
    vi.mocked(cancelAgentAction).mockResolvedValue();
  });
  afterEach(() => vi.useRealTimers());

  it('« Valider » : exécutée au bout de 5 secondes', async () => {
    renderRoutes([{ path: '/', element: <AgentActions actions={[action]} /> }]);
    fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
    expect(screen.getByText('Exécution dans 5 s')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(executeAgentAction).toHaveBeenCalledWith('a1');
  });

  it('« Annuler » pendant le délai : rien n’est fait', async () => {
    renderRoutes([{ path: '/', element: <AgentActions actions={[action]} /> }]);
    fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(executeAgentAction).not.toHaveBeenCalled();
  });

  it('« vas-y » à la voix : la première action est validée', () => {
    const ref = createRef<AgentActionsHandle>();
    renderRoutes([{ path: '/', element: <AgentActions actions={[action]} ref={ref} /> }]);
    act(() => ref.current?.validateFirst());
    expect(screen.getByText('Exécution dans 5 s')).toBeInTheDocument();
  });

  it('mail préparé : lu en entier avant l’envoi, envoyé par la fonction d’envoi au bout de 5 s', async () => {
    const mail: AgentAction = {
      ...action,
      id: 'a2',
      kind: 'send_mail',
      summary: 'Relance à Transports Martin (compta@martin.fr) : « Facture F11887 », factures F11887',
      payload: {
        to: 'compta@martin.fr',
        subject: 'Facture F11887',
        text: 'Madame, Monsieur,\nSauf erreur de notre part…',
      },
    };
    vi.mocked(sendAgentMail).mockResolvedValue({ ...mail, status: 'done' });
    renderRoutes([{ path: '/', element: <AgentActions actions={[mail]} /> }]);
    expect(screen.getByText('À : compta@martin.fr · Objet : Facture F11887')).toBeInTheDocument();
    expect(screen.getByText(/Sauf erreur de notre part/)).toBeInTheDocument();
    expect(screen.getByText('Préparé par l’agent : rien ne part avant ta validation.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
    expect(screen.getByText('Envoi dans 5 s')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(sendAgentMail).toHaveBeenCalledWith(mail);
    expect(executeAgentAction).not.toHaveBeenCalled();
  });

  it('réponses dictées qui valident', () => {
    for (const text of ['Vas-y', 'vas y', 'oui', 'OK', 'valide', 'c’est bon', 'fais-le']) {
      expect(isGoAhead(text), text).toBe(true);
    }
    for (const text of ['Ouvre l’OR 488', 'vasectomie', 'combien on a facturé ?']) {
      expect(isGoAhead(text), text).toBe(false);
    }
  });
});
