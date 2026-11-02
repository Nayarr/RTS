import { createRef } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { AgentActions, type AgentActionsHandle } from './AgentActions';
import { isGoAhead } from './agent-actions';
import { AgentTable } from './AgentTable';
import { tableFileName, tableText } from './agent-table';
import {
  cancelAgentAction,
  editAgentMail,
  editAgentMailing,
  executeAgentAction,
  sendAgentMail,
  type AgentAction,
} from './api';
import type * as AssistantApi from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AssistantApi>()),
  executeAgentAction: vi.fn(),
  sendAgentMail: vi.fn(),
  cancelAgentAction: vi.fn(),
  editAgentMail: vi.fn(),
  editAgentMailing: vi.fn(),
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

/** Mail préparé par l'agent pour un client. */
const mail = (id: string, client: string): AgentAction => ({
  ...action,
  id,
  kind: 'send_mail',
  summary: `Mail à ${client} : « Contrôle technique »`,
  payload: {
    to: 'contact@transports-martin.fr',
    subject: 'Contrôle technique',
    text: `Bonjour ${client},\nVotre contrôle approche.`,
    client_name: client,
  },
});

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

  it('mail préparé : relu en entier, envoyé par la fonction d’envoi au bout de 5 s', async () => {
    vi.mocked(sendAgentMail).mockResolvedValue({ ...mail('a2', 'Transports Martin'), status: 'done' });
    renderRoutes([{ path: '/', element: <AgentActions actions={[mail('a2', 'Transports Martin')]} /> }]);
    expect(screen.getByText('Mail préparé · Transports Martin')).toBeInTheDocument();
    expect(screen.getByLabelText('À')).toHaveValue('contact@transports-martin.fr');
    expect(screen.getByLabelText('Texte')).toHaveValue(
      'Bonjour Transports Martin,\nVotre contrôle approche.',
    );
    expect(screen.getByText('Préparé par l’agent : rien ne part avant « Envoyer ».')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Envoyer/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Envoi dans 5 s')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(editAgentMail).not.toHaveBeenCalled();
    expect(vi.mocked(sendAgentMail).mock.calls[0]?.[0].id).toBe('a2');
    expect(executeAgentAction).not.toHaveBeenCalled();
  });

  it('mails groupés : un par un, modifié avant l’envoi, écarté, sans rien envoyer d’autre', async () => {
    const first = mail('m1', 'Transports Martin');
    const second = mail('m2', 'Frigo Leroy');
    vi.mocked(editAgentMail).mockResolvedValue(first);
    vi.mocked(sendAgentMail).mockResolvedValue({ ...first, status: 'done' });
    renderRoutes([{ path: '/', element: <AgentActions actions={[first, second]} /> }]);
    expect(screen.getByText(/Mail 1 sur 2 · Transports Martin/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mail suivant' }));
    expect(screen.getByText(/Mail 2 sur 2 · Frigo Leroy/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ne pas envoyer/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.mocked(cancelAgentAction).mock.calls[0]?.[0]).toBe('m2');

    fireEvent.click(screen.getByRole('button', { name: 'Mail précédent' }));
    fireEvent.change(screen.getByLabelText('Objet'), { target: { value: 'Contrôle technique de novembre' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(editAgentMail).toHaveBeenCalledWith('m1', {
      to: 'contact@transports-martin.fr',
      subject: 'Contrôle technique de novembre',
      text: 'Bonjour Transports Martin,\nVotre contrôle approche.',
    });
    expect(vi.mocked(sendAgentMail).mock.calls.map(([sent]) => sent.id)).toEqual(['m1']);
  });

  it('mail groupé : texte relu, destinataire décoché, un seul envoi par la fonction d’envoi', async () => {
    const mailing: AgentAction = {
      ...action,
      id: 'g1',
      kind: 'send_mailing',
      summary: 'Mail groupé à 2 clients : « Machine à vendre »',
      payload: {
        subject: 'Machine à vendre',
        text: 'Bonjour {client},\nNotre machine de parallélisme est à vendre.',
        recipients: [
          { client_id: 'c1', name: 'Transports Martin', to: 'compta@martin.fr' },
          { client_id: 'c2', name: 'Frigo Leroy', to: 'atelier@leroy.fr' },
        ],
        without_email: 1,
      },
    };
    vi.mocked(editAgentMailing).mockResolvedValue(mailing);
    vi.mocked(sendAgentMail).mockResolvedValue({ ...mailing, status: 'done' });
    renderRoutes([{ path: '/', element: <AgentActions actions={[mailing]} /> }]);
    expect(screen.getByText('Destinataires : 2 sur 2 (1 sans e-mail, écarté)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Frigo Leroy/ }));
    expect(screen.getByText('Destinataires : 1 sur 2 (1 sans e-mail, écarté)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer à 1 client' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(editAgentMailing).toHaveBeenCalledWith('g1', {
      subject: 'Machine à vendre',
      text: 'Bonjour {client},\nNotre machine de parallélisme est à vendre.',
      clientIds: ['c1'],
    });
    expect(screen.getByText('Envoi dans 5 s')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(vi.mocked(sendAgentMail).mock.calls.map(([sent]) => sent.id)).toEqual(['g1']);
    expect(executeAgentAction).not.toHaveBeenCalled();
  });

  it('tableau de l’agent : affiché, copiable dans un tableur, nommé pour le téléchargement', () => {
    const table = {
      titre: 'Contrôles techniques d’ici fin novembre',
      colonnes: ['Plaque', 'Client', 'Date'],
      lignes: [['AB-123-CD', 'Transports Martin', '12/11/2026']],
    };
    renderRoutes([{ path: '/', element: <AgentTable table={table} /> }]);
    expect(screen.getByRole('region', { name: table.titre })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Transports Martin' })).toBeInTheDocument();
    expect(tableText(table)).toBe('Plaque\tClient\tDate\nAB-123-CD\tTransports Martin\t12/11/2026');
    expect(tableFileName(table.titre)).toBe('controles-techniques-d-ici-fin-novembre.csv');
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
