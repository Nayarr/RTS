import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFleetMutation } from './fleet-hooks';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

async function failWith(error: unknown) {
  const { result } = renderHook(() => useFleetMutation(() => Promise.reject(error as Error)), { wrapper });
  await act(async () => {
    await result.current.mutateAsync(undefined).catch(() => undefined);
  });
}

describe('useFleetMutation', () => {
  beforeEach(() => toastError.mockClear());

  it('affiche le refus de la base, qui n’est pas une Error (vente d’un véhicule loué)', async () => {
    const refusal = { code: 'P0001', message: 'Vente impossible : le contrat LC-2026-0001 est à facturer.' };
    expect(refusal).not.toBeInstanceOf(Error);
    await failWith(refusal);
    expect(toastError).toHaveBeenCalledWith('Vente impossible : le contrat LC-2026-0001 est à facturer.');
  });

  it('garde le message générique pour une erreur sans message', async () => {
    await failWith('panne');
    expect(toastError).toHaveBeenCalledWith('Enregistrement impossible');
  });
});
