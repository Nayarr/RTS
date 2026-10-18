import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import {
  addTires,
  correctTireStock,
  fetchSuppliers,
  fetchTireBrands,
  fetchTireKpis,
  fetchTireLines,
  fetchTireLot,
  fetchTireLots,
  fetchTireMovements,
  setTireMinQty,
  type TireKpis,
  type TireLine,
  type TireLot,
} from './api';
import type * as TiresApi from './api';
import { TirePage } from './TirePage';
import { TiresPage } from './TiresPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TiresApi>()),
  fetchTireLines: vi.fn(),
  fetchTireLots: vi.fn(),
  fetchTireKpis: vi.fn(),
  fetchTireBrands: vi.fn(),
  fetchSuppliers: vi.fn(),
  fetchTireLot: vi.fn(),
  fetchTireMovements: vi.fn(),
  addTires: vi.fn(),
  setTireMinQty: vi.fn(),
  correctTireStock: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const line = (overrides: Partial<TireLine> = {}): TireLine => ({
  id: 'l1',
  category: 'pl',
  size: '315/80 R22.5',
  profile: 'avant',
  min_qty: 6,
  stock_qty: 12,
  reserved_qty: 0,
  available_qty: 12,
  missing_qty: 0,
  status: 'ok',
  lots_count: 2,
  brands: 'Michelin 8 · Hankook 4',
  avg_purchase_price: 296,
  sold_30d: 18,
  ...overrides,
});

const lot = (overrides: Partial<TireLot> = {}): TireLot => ({
  id: 't1',
  line_id: 'l1',
  category: 'pl',
  size: '315/80 R22.5',
  profile: 'avant',
  brand_id: 'b1',
  brand_name: 'Michelin',
  model: 'X Multi Z',
  condition: 'neuf',
  load_index: '156/150 L',
  location: 'Rack A1',
  dot: '24/2026',
  supplier_id: 's1',
  supplier_name: 'Euromaster',
  purchase_price: 312,
  sale_price: 415,
  stock_qty: 8,
  reserved_qty: 2,
  available_qty: 6,
  sold_90d: 22,
  part_id: 'p1',
  min_qty: 4,
  ...overrides,
});

const kpis: TireKpis = {
  stock_qty: 46,
  sizes: 11,
  lots: 14,
  to_order: 2,
  out: 1,
  sold_30d: 64,
  sold_prev_30d: 57,
  revenue_30d: 21840,
  margin_30d: 5240,
  margin_percent: 32,
};

const setup = (path: string) => {
  vi.mocked(fetchTireKpis).mockResolvedValue(kpis);
  vi.mocked(fetchTireBrands).mockResolvedValue([]);
  vi.mocked(fetchSuppliers).mockResolvedValue([{ id: 's1', name: 'Euromaster', email: null, phone: null }]);
  return renderRoutes(
    [
      { path: '/stock/pneumatiques', element: <TiresPage /> },
      { path: '/stock/pneumatiques/:id', element: <TirePage /> },
    ],
    { initialPath: path },
  );
};

describe('stock des pneus', () => {
  it('compté par taille et profil, état et alerte du seuil, filtre « Sous le seuil »', async () => {
    vi.mocked(fetchTireLines).mockResolvedValue([
      line(),
      line({
        id: 'l2',
        profile: 'arriere',
        stock_qty: 3,
        available_qty: 3,
        missing_qty: 3,
        status: 'to_order',
        brands: 'Michelin 3',
      }),
      line({
        id: 'l3',
        category: 'vul',
        size: '235/65 R16C',
        profile: 'toutes',
        stock_qty: 0,
        available_qty: 0,
        missing_qty: 4,
        min_qty: 4,
        status: 'out',
        brands: null,
      }),
    ]);
    vi.mocked(fetchTireLots).mockResolvedValue([
      lot(),
      lot({ id: 't2', brand_name: 'Hankook', model: 'AH31', stock_qty: 4 }),
    ]);
    setup('/stock/pneumatiques');

    const front = await screen.findByRole('row', { name: '315/80 R22.5 avant' });
    expect(within(front).getByText('OK')).toBeInTheDocument();
    expect(within(front).getByText('Michelin 8 · Hankook 4')).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: '315/80 R22.5 arrière' })).getByText('À commander'),
    ).toBeInTheDocument();
    const van = screen.getByRole('row', { name: '235/65 R16C' });
    expect(within(van).getByText('Rupture')).toBeInTheDocument();
    expect(within(van).getByText('Plus de lot en stock')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 tailles sous le seuil : 315/80 R22.5 arrière, 235/65 R16C. Alerte envoyée à la direction et à la réception',
    );
    const figures = screen.getByRole('list', { name: 'Chiffres du stock des pneus' });
    expect(figures).toHaveTextContent('11 tailles · 14 lots');
    expect(figures).toHaveTextContent('+12 % vs mois dernier');
    expect(figures).toHaveTextContent('32 %');

    // Lots de la ligne
    await userEvent.click(within(front).getByRole('button', { name: 'Voir les lots 315/80 R22.5 avant' }));
    expect(screen.getByRole('link', { name: 'Hankook AH31' })).toHaveAttribute(
      'href',
      '/stock/pneumatiques/t2',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sous le seuil' }));
    expect(screen.queryByRole('row', { name: '315/80 R22.5 avant' })).toBeNull();
    expect(screen.getByRole('row', { name: '235/65 R16C' })).toBeInTheDocument();
  });

  it('seuil mini modifié sur la ligne', async () => {
    vi.mocked(fetchTireLines).mockResolvedValue([line()]);
    vi.mocked(fetchTireLots).mockResolvedValue([]);
    vi.mocked(setTireMinQty).mockResolvedValue();
    setup('/stock/pneumatiques');
    const input = await screen.findByLabelText(/Seuil mini 315\/80 R22.5 avant/);
    await userEvent.clear(input);
    await userEvent.type(input, '10{Enter}');
    await waitFor(() => expect(setTireMinQty).toHaveBeenCalledWith('l1', 10));
  });

  it('ajout au stock : taille mise en forme, marque, profil, prix liés', async () => {
    vi.mocked(fetchTireLines).mockResolvedValue([line()]);
    vi.mocked(fetchTireLots).mockResolvedValue([]);
    vi.mocked(addTires).mockResolvedValue('t9');
    vi.mocked(fetchTireLot).mockResolvedValue(lot({ id: 't9' }));
    vi.mocked(fetchTireMovements).mockResolvedValue([]);
    setup('/stock/pneumatiques');
    await userEvent.click(await screen.findByRole('button', { name: /Entrée de pneus/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Dimension'), '31580225');
    expect(within(dialog).getByLabelText('Dimension')).toHaveValue('315/80 R22.5');
    expect(within(dialog).getByText('Vide : seuil actuel gardé (6)')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Marque'), 'Hankook');
    await userEvent.type(within(dialog).getByLabelText('Modèle'), 'AH31');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Arrière' }));
    await userEvent.type(within(dialog).getByLabelText('Quantité'), '4');
    await userEvent.type(within(dialog).getByLabelText('Prix d’achat HT (€)'), '230');
    await userEvent.type(within(dialog).getByLabelText('Marge (%)'), '27');
    expect(within(dialog).getByLabelText('Prix de vente HT (€)')).toHaveValue('292,1');
    await userEvent.click(within(dialog).getByRole('button', { name: /Ajouter au stock/ }));
    await waitFor(() =>
      expect(addTires).toHaveBeenCalledWith({
        category: 'pl',
        size: '315/80 R22.5',
        profile: 'arriere',
        brand: 'Hankook',
        model: 'AH31',
        condition: 'neuf',
        quantity: 4,
        purchase_price: 230,
        sale_price: 292.1,
        supplier_id: null,
        load_index: null,
        location: null,
        dot: null,
        min_qty: null,
      }),
    );
  });

  it('taille incomplète refusée', async () => {
    vi.mocked(fetchTireLines).mockResolvedValue([]);
    vi.mocked(fetchTireLots).mockResolvedValue([]);
    setup('/stock/pneumatiques');
    await userEvent.click(await screen.findByRole('button', { name: /Entrée de pneus/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Dimension'), '3158');
    await userEvent.type(within(dialog).getByLabelText('Marque'), 'Michelin');
    await userEvent.click(within(dialog).getByRole('button', { name: /Ajouter au stock/ }));
    expect(
      await within(dialog).findByText('Dimension incomplète : tape par exemple 31580225'),
    ).toBeInTheDocument();
    expect(addTires).not.toHaveBeenCalled();
  });
});

describe('fiche d’un pneu', () => {
  it('chiffres, caractéristiques, mouvements et stock après chaque mouvement', async () => {
    vi.mocked(fetchTireLot).mockResolvedValue(lot());
    vi.mocked(fetchTireMovements).mockResolvedValue([
      {
        id: 'm2',
        tire_id: 't1',
        quantity: -2,
        reason: 'sale',
        supplier_id: null,
        reference: null,
        unit_purchase_price: 312,
        unit_sale_price: 415,
        repair_order_id: 'r1',
        invoice_id: 'i1',
        note: 'Facture F12001',
        created_by: null,
        created_at: new Date().toISOString(),
        supplier_name: null,
        author_name: 'Direction RTS',
        repair_order_number: 'OR00192',
        plate: 'GH-512-RT',
        client_name: 'Transports Moreau',
      },
      {
        id: 'm1',
        tire_id: 't1',
        quantity: 10,
        reason: 'entry',
        supplier_id: 's1',
        reference: 'BL-44711',
        unit_purchase_price: 312,
        unit_sale_price: null,
        repair_order_id: null,
        invoice_id: null,
        note: null,
        created_by: null,
        created_at: '2026-10-14T08:15:00Z',
        supplier_name: 'Euromaster',
        author_name: 'Réception RTS',
        repair_order_number: null,
        plate: null,
        client_name: null,
      },
    ]);
    setup('/stock/pneumatiques/t1');
    expect(await screen.findByText('Michelin X Multi Z · 315/80 R22.5')).toBeInTheDocument();
    const figures = screen.getByRole('list', { name: 'Chiffres du pneu' });
    expect(figures).toHaveTextContent('mini 4 · 2 réservés · Rack A1');
    expect(figures).toHaveTextContent('marge 33 %');
    expect(figures).toHaveTextContent('2 496,00 €');
    const movements = screen.getByRole('list', { name: 'Mouvements' });
    expect(within(movements).getByRole('link', { name: 'Posés sur OR00192 · GH-512-RT' })).toHaveAttribute(
      'href',
      '/or/r1',
    );
    expect(within(movements).getByText('Réception fournisseur Euromaster')).toBeInTheDocument();
    expect(within(movements).getByText('reste 8')).toBeInTheDocument();
    expect(within(movements).getByText('reste 10')).toBeInTheDocument();
  });

  it('sortie de pneus : stock compté envoyé avec le motif', async () => {
    vi.mocked(fetchTireLot).mockResolvedValue(lot());
    vi.mocked(fetchTireMovements).mockResolvedValue([]);
    vi.mocked(correctTireStock).mockResolvedValue();
    setup('/stock/pneumatiques/t1');
    await userEvent.click(await screen.findByRole('button', { name: /Sortie \/ correction/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Pneus sortis'), '1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));
    expect(await within(dialog).findByText('Indique le motif')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Motif'), 'Pneu abîmé au stockage');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(correctTireStock).toHaveBeenCalledWith('t1', 7, 'Pneu abîmé au stockage'));
  });
});
