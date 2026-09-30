import { act, render, screen, waitFor } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountStorage, indexedDbStorage, shouldPersistQuery } from '@/lib/offline-cache';
import { OfflineBanner } from './OfflineBanner';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  act(() => onlineManager.setOnline(true));
  vi.restoreAllMocks();
});

describe('bandeau hors connexion', () => {
  const renderBanner = () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <OfflineBanner />
      </QueryClientProvider>,
    );
    return client;
  };

  it('affiché sans réseau, avec les modifications en attente ; confirmation au retour', async () => {
    const client = renderBanner();
    expect(screen.queryByRole('status')).toBeNull();

    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole('status')).toHaveTextContent('Hors connexion : tu peux continuer');

    // Modification faite hors connexion : mise en attente (pas envoyée)
    const send = vi.fn(() => Promise.resolve());
    await act(async () => {
      void client.getMutationCache().build(client, { mutationFn: send }).execute(undefined);
      await Promise.resolve();
    });
    expect(send).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 modification en attente.'));

    await act(async () => {
      onlineManager.setOnline(true);
      await client.resumePausedMutations();
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(toast.success).toHaveBeenCalledWith('Connexion rétablie : envoi des modifications en attente');
    expect(send).toHaveBeenCalledOnce();
  });
});

describe('cache gardé sur l’appareil', () => {
  const query = (key: string, status: 'success' | 'error') =>
    ({ queryKey: [key], state: { status } }) as unknown as Query;

  it('seulement les données chargées et utiles hors ligne', () => {
    expect(shouldPersistQuery(query('repair-orders', 'success'))).toBe(true);
    expect(shouldPersistQuery(query('repair-orders', 'error'))).toBe(false);
    expect(shouldPersistQuery(query('file-urls', 'success'))).toBe(false); // liens signés (1 h)
  });

  it('un cache par compte ; rien sans session', async () => {
    const get = vi.spyOn(indexedDbStorage, 'getItem').mockResolvedValue('{"cache":1}');
    const set = vi.spyOn(indexedDbStorage, 'setItem').mockResolvedValue();

    getSession.mockResolvedValue({ data: { session: { user: { id: 'alice' } } } });
    await expect(accountStorage.getItem('rts-query-cache')).resolves.toBe('{"cache":1}');
    expect(get).toHaveBeenCalledWith('rts-query-cache:alice');
    await accountStorage.setItem('rts-query-cache', '{}');
    expect(set).toHaveBeenCalledWith('rts-query-cache:alice', '{}');

    getSession.mockResolvedValue({ data: { session: null } });
    get.mockClear();
    await expect(accountStorage.getItem('rts-query-cache')).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
