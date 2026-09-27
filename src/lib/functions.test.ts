import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { invokeFunction } from './functions';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }));

describe('invokeFunction', () => {
  it('renvoie les données de la fonction', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null, response: undefined });
    expect(await invokeFunction('files', { action: 'download' })).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('files', { body: { action: 'download' } });
  });

  it('remonte le message d’erreur renvoyé par la fonction', async () => {
    const context = Response.json({ error: 'Type de fichier non accepté : text/html' }, { status: 400 });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(context), response: context });
    await expect(invokeFunction('files', {})).rejects.toThrow('Type de fichier non accepté : text/html');
  });

  it('serveur injoignable', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError('offline'), response: undefined });
    await expect(invokeFunction('files', {})).rejects.toThrow('Serveur injoignable');
  });
});
