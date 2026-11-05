import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCatalogPart } from './api';

const { insert, rpc, update } = vi.hoisted(() => {
  const saved = () => ({ select: () => Promise.resolve({ data: [{ id: 'saved' }], error: null }) });
  return {
    insert: vi.fn(() => saved()),
    rpc: vi.fn(),
    update: vi.fn(() => ({ eq: () => saved() })),
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, from: () => ({ insert, update }) },
}));

const found = (partId: string | null) => rpc.mockResolvedValue({ data: partId, error: null });

const noPrice = {
  designation: 'Durite',
  supplier_name: '',
  purchase_price: 20,
  sale_price: null,
  margin_kind: 'percent',
  margin_value: null,
} as const;

describe('pièce gardée au catalogue', () => {
  beforeEach(() => {
    insert.mockClear();
    update.mockClear();
  });

  it('fiche existante, sans prix de vente : son prix et sa marge sont gardés', async () => {
    found('p1');
    await saveCatalogPart(noPrice);
    expect(update).toHaveBeenCalledWith({
      designation: 'Durite',
      purchase_price: 20,
      is_active: true,
      supplier_id: null,
    });
  });

  it('fiche existante, avec un prix de vente : il est mis à jour', async () => {
    found('p1');
    await saveCatalogPart({ ...noPrice, sale_price: 30, margin_value: 50 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ sale_price: 30, margin_value: 50 }));
  });

  it('vendue sous son prix d’achat : prix gardé, marge négative non envoyée à la base', async () => {
    found(null);
    await saveCatalogPart({ ...noPrice, purchase_price: 50, sale_price: 30, margin_value: -40 });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ purchase_price: 50, sale_price: 30, margin_value: null }),
    );
  });

  it('nouvelle pièce sans prix de vente : créée sans prix', async () => {
    found(null);
    await expect(saveCatalogPart(noPrice)).resolves.toBe('saved');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ designation: 'Durite', sale_price: null }));
  });
});
