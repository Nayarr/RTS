import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import {
  fetchConsumables,
  fetchPartStats,
  removeConsumable,
  restockConsumable,
  saveConsumable,
  savePart,
  setConsumableStock,
  type Consumable,
  type PartStats,
} from './api';
import type * as CatalogApi from './api';
import { ConsumablesPage } from './ConsumablesPage';
import { PartsPage } from './PartsPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogApi>()),
  fetchConsumables: vi.fn(),
  saveConsumable: vi.fn(),
  restockConsumable: vi.fn(),
  setConsumableStock: vi.fn(),
  removeConsumable: vi.fn(),
  fetchPartStats: vi.fn(),
  savePart: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const consumable = (overrides: Partial<Consumable> = {}): Consumable => ({
  id: 'c1',
  name: 'AdBlue',
  unit: 'L',
  sale_price: 1.2,
  purchase_price: 0.45,
  stock_qty: 60,
  alert_threshold: 100,
  is_active: true,
  legacy_id: null,
  created_at: '2026-09-27T08:00:00Z',
  updated_at: '2026-09-27T08:00:00Z',
  ...overrides,
});

const part = (overrides: Partial<PartStats> = {}): PartStats => ({
  id: 'p1',
  designation: 'Filtre à huile',
  vehicle_ref: 'Volvo FH 500',
  manufacturer_ref: 'HU 12 140 x',
  brand: 'Mann-Filter',
  oem_ref: null,
  supplier_id: 's1',
  supplier_name: 'PL Pièces 95',
  purchase_price: 21.5,
  shipping_cost: 2.5,
  margin_kind: 'percent',
  margin_value: 30,
  sale_price: 31.2,
  invoices_count: 3,
  quotes_count: 4,
  quantity_sold: 5,
  revenue_ht: 156,
  margin_ht: 36,
  last_sold_at: '2026-10-01T08:00:00Z',
  ...overrides,
});

const setup = (path: string) =>
  renderRoutes(
    [
      { path: '/stock/consommables', element: <ConsumablesPage /> },
      { path: '/stock/pieces', element: <PartsPage /> },
    ],
    { initialPath: path },
  );

describe('consommables', () => {
  it('signale le stock bas', async () => {
    vi.mocked(fetchConsumables).mockResolvedValue([
      consumable(),
      consumable({ id: 'c2', name: 'Huile 10W40', stock_qty: 208, alert_threshold: 40 }),
    ]);
    setup('/stock/consommables');
    const adblue = await screen.findByRole('row', { name: 'AdBlue' });
    expect(within(adblue).getByText(/Stock bas \(seuil 100\)/)).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: 'Huile 10W40' })).queryByText(/Stock bas/)).toBeNull();
  });

  it('crée un consommable avec prix à virgule et stock de départ', async () => {
    vi.mocked(fetchConsumables).mockResolvedValue([]);
    vi.mocked(saveConsumable).mockResolvedValue();
    setup('/stock/consommables');
    await userEvent.click(await screen.findByRole('button', { name: /Nouveau consommable/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nom'), 'Huile 10W40');
    await userEvent.type(within(dialog).getByLabelText('Vente HT / unité'), '6,50');
    await userEvent.type(within(dialog).getByLabelText('Achat HT / unité'), '3,2');
    await userEvent.type(within(dialog).getByLabelText('Stock de départ'), '208');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveConsumable).toHaveBeenCalledWith(
        null,
        { name: 'Huile 10W40', unit: 'L', sale_price: 6.5, purchase_price: 3.2, alert_threshold: null },
        208,
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('refuse un prix mal saisi', async () => {
    vi.mocked(fetchConsumables).mockResolvedValue([]);
    setup('/stock/consommables');
    await userEvent.click(await screen.findByRole('button', { name: /Nouveau consommable/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nom'), 'AdBlue');
    await userEvent.type(within(dialog).getByLabelText('Vente HT / unité'), 'douze');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Nombre attendu (ex : 12,50)')).toBeInTheDocument();
    expect(saveConsumable).not.toHaveBeenCalled();
  });

  it('réapprovisionnement et inventaire passent par le journal', async () => {
    vi.mocked(fetchConsumables).mockResolvedValue([consumable()]);
    vi.mocked(restockConsumable).mockResolvedValue();
    vi.mocked(setConsumableStock).mockResolvedValue();
    setup('/stock/consommables');

    await userEvent.click(await screen.findByRole('button', { name: /Réappro/ }));
    let dialog = screen.getByRole('dialog', { name: /Réapprovisionnement/ });
    await userEvent.type(within(dialog).getByLabelText('Quantité reçue (L)'), '208');
    await userEvent.type(within(dialog).getByLabelText('Commentaire (facultatif)'), 'Fût');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(restockConsumable).toHaveBeenCalledWith('c1', 208, 'Fût'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: /Inventaire/ }));
    dialog = screen.getByRole('dialog', { name: /Inventaire/ });
    await userEvent.type(within(dialog).getByLabelText('Stock compté (L)'), '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(setConsumableStock).toHaveBeenCalledWith('c1', 0, null));
  });

  it('un réapprovisionnement nul est refusé', async () => {
    vi.mocked(fetchConsumables).mockResolvedValue([consumable()]);
    setup('/stock/consommables');
    await userEvent.click(await screen.findByRole('button', { name: /Réappro/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Quantité reçue (L)'), '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));
    expect(await within(dialog).findByText('Doit être supérieur à 0')).toBeInTheDocument();
    expect(restockConsumable).not.toHaveBeenCalled();
  });

  it('un consommable déjà utilisé est archivé plutôt que supprimé', async () => {
    vi.mocked(fetchConsumables).mockResolvedValue([consumable()]);
    vi.mocked(removeConsumable).mockResolvedValue('archived');
    setup('/stock/consommables');
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer AdBlue' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retirer' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('AdBlue archivé (déjà utilisé sur des OR)'),
    );
  });
});

describe('pièces', () => {
  it('chiffres des ventes, pièces les plus utilisées en premier, recherche par référence véhicule', async () => {
    vi.mocked(fetchPartStats).mockResolvedValue([
      part({
        id: 'p2',
        designation: 'Ampoule H7',
        quantity_sold: 1,
        revenue_ht: 9,
        margin_ht: 1,
        vehicle_ref: null,
      }),
      part(),
    ]);
    setup('/stock/pieces');
    const rows = await screen.findAllByRole('row');
    expect(rows[1]).toHaveAccessibleName('Filtre à huile');
    const row = screen.getByRole('row', { name: 'Filtre à huile' });
    expect(within(row).getByText('23 %')).toBeInTheDocument(); // 36 / 156
    expect(within(row).getByText('30 %')).toBeInTheDocument(); // marge réglée
    expect(within(row).getByText('Sur 4 devis')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Chiffres des pièces' })).toHaveTextContent('Pièces vendues6');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher une pièce' }), 'volvo');
    expect(screen.queryByRole('row', { name: 'Ampoule H7' })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Filtre à huile' })).toBeInTheDocument();
  });

  it('prix de vente calculé depuis la marge, fournisseur gardé', async () => {
    vi.mocked(fetchPartStats).mockResolvedValue([part()]);
    vi.mocked(savePart).mockResolvedValue('p1');
    setup('/stock/pieces');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier Filtre à huile' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Prix de vente HT calculé')).toHaveTextContent('31,20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marge en euros' }));
    const margin = within(dialog).getByLabelText('Marge (€)');
    await userEvent.clear(margin);
    await userEvent.type(margin, '10');
    expect(within(dialog).getByLabelText('Prix de vente HT calculé')).toHaveTextContent('34,00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(savePart).toHaveBeenCalledWith('p1', {
        designation: 'Filtre à huile',
        vehicle_ref: 'Volvo FH 500',
        manufacturer_ref: 'HU 12 140 x',
        brand: 'Mann-Filter',
        oem_ref: null,
        supplier_name: 'PL Pièces 95',
        purchase_price: 21.5,
        shipping_cost: 2.5,
        margin_kind: 'amount',
        margin_value: 10,
        sale_price: 34,
      }),
    );
  });
});
