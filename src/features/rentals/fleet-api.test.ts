import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sellFleetVehicle } from './fleet-api';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

const sale = {
  vehicleId: 'v1',
  clientId: 'c1',
  soldAt: '2026-11-05T10:00:00.000Z',
  mileage: null,
  scheme: 'normal' as const,
  price: 10000,
  purchasePrice: null,
};

describe('sellFleetVehicle', () => {
  beforeEach(() => rpc.mockReset());

  it('renvoie la facture créée, sans prix d’achat en TVA normale', async () => {
    rpc.mockResolvedValue({ data: 'facture', error: null });
    await expect(sellFleetVehicle(sale)).resolves.toBe('facture');
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_purchase_price');
  });

  it('dit que la base n’est pas à jour si la fonction de vente manque', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.sell_fleet_vehicle' },
    });
    await expect(sellFleetVehicle(sale)).rejects.toThrow('la base de données n’est pas à jour');
  });

  it('transmet tel quel le refus de la base', async () => {
    const refusal = { code: 'P0001', message: 'Vente impossible : location à facturer (LC-2026-0001).' };
    rpc.mockResolvedValue({ data: null, error: refusal });
    await expect(sellFleetVehicle(sale)).rejects.toBe(refusal);
  });
});
