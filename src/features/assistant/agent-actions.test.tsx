import { createRef } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { AgentActions, type AgentActionsHandle } from './AgentActions';
import { isGoAhead } from './agent-actions';
import { cancelAgentAction, executeAgentAction, type AgentAction } from './api';
import type * as AssistantApi from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AssistantApi>()),
  executeAgentAction: vi.fn(),
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
    expect(executeAgentAction).toHaveBeenCalledWith('a1', expect.anything());
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

  it('réponses dictées qui valident', () => {
    for (const text of ['Vas-y', 'vas y', 'oui', 'OK', 'valide', 'c’est bon', 'fais-le']) {
      expect(isGoAhead(text), text).toBe(true);
    }
    for (const text of ['Ouvre l’OR 488', 'vasectomie', 'combien on a facturé ?']) {
      expect(isGoAhead(text), text).toBe(false);
    }
  });
});
