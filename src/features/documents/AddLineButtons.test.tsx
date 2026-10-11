import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchParts, savePart, type Part } from '@/features/catalogs/api';
import type * as CatalogApi from '@/features/catalogs/api';
import { renderRoutes } from '@/test/render';
import { AddLineButtons } from './AddLineButtons';
import { LineRow, TotalsList } from './LineRow';
import { computeTotals, offeredTotal, type EditableLine } from './lines';

vi.mock('@/features/catalogs/api', async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogApi>()),
  fetchParts: vi.fn(),
  savePart: vi.fn(),
}));
vi.mock('./hooks', () => ({ useServicePackages: () => ({ data: [], isSuccess: true }) }));

const basePart: Part = {
  id: 'p1',
  designation: 'Plaquettes de frein avant',
  brand: 'Knorr-Bremse',
  manufacturer_ref: 'K-1137',
  oem_ref: null,
  vehicle_ref: 'Volvo FH 500',
  supplier_id: null,
  supplier_name: null,
  purchase_price: 100,
  shipping_cost: 10,
  margin_kind: 'percent',
  margin_value: 25,
  sale_price: 137.5,
  is_active: true,
  legacy_id: null,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
};

const renderButtons = (onAdd = vi.fn().mockResolvedValue(undefined)) => {
  renderRoutes([{ path: '/', element: <AddLineButtons vehicleType="pl" laborRate={90} onAdd={onAdd} /> }]);
  return onAdd;
};

describe('ajout d’une pièce', () => {
  it('saisie directe : prix de vente calculé, pièce enregistrée dans la base puis ajoutée', async () => {
    vi.mocked(fetchParts).mockResolvedValue([]);
    vi.mocked(savePart).mockResolvedValue('new-part');
    const onAdd = renderButtons();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter une pièce' });
    await userEvent.type(within(dialog).getByLabelText('Désignation'), 'Disque de frein');
    await userEvent.type(within(dialog).getByLabelText('Référence pièce'), 'DF-22');
    await userEvent.type(within(dialog).getByLabelText('Prix d’achat HT (€)'), '80');
    await userEvent.type(within(dialog).getByLabelText('Frais de port HT (€)'), '5');
    await userEvent.type(within(dialog).getByLabelText('Marge (%)'), '20');
    expect(within(dialog).getByLabelText('Prix de vente HT calculé')).toHaveTextContent('102,00');
    const quantity = within(dialog).getByLabelText('Quantité');
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter la pièce' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(savePart).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ sale_price: 102, margin_value: 20 }),
    );
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        line_type: 'part',
        description: 'Disque de frein',
        unit_price: 102,
        quantity: 2,
        purchase_price: 80,
        shipping_cost: 10,
        manufacturer_ref: 'DF-22',
        part_id: 'new-part',
      }),
    );
  });

  it('pièce proposée par la base : reprise puis mise à jour', async () => {
    vi.mocked(fetchParts).mockResolvedValue([basePart]);
    vi.mocked(savePart).mockResolvedValue('p1');
    const onAdd = renderButtons();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter une pièce' });
    await userEvent.type(within(dialog).getByLabelText('Désignation'), 'plaq');
    const suggestions = await within(dialog).findByRole('list', { name: 'Pièces de la base' });
    await userEvent.click(within(suggestions).getByRole('button', { name: /Plaquettes de frein avant/ }));
    expect(within(dialog).getByLabelText('Référence véhicule')).toHaveValue('Volvo FH 500');
    expect(within(dialog).getByLabelText('Prix de vente HT calculé')).toHaveTextContent('137,50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter la pièce' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ part_id: 'p1' })));
    expect(savePart).toHaveBeenCalledWith('p1', expect.anything());
  });
});

describe('geste commercial', () => {
  const line: EditableLine = {
    id: 'l1',
    line_type: 'labor',
    description: 'Contrôle hayon',
    unit_price: 45,
    quantity: 1,
    discount_percent: 0,
    vat_rate: 20,
  };

  it('« Offrir » passe la ligne à 100 % de remise ; la ligne offerte est signalée', async () => {
    const onSave = vi.fn();
    renderRoutes([
      { path: '/', element: <LineRow line={line} locked={false} onSave={onSave} onDelete={vi.fn()} /> },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Offrir Contrôle hayon' }));
    expect(onSave).toHaveBeenCalledWith({ discount_percent: 100 });
  });

  it('« Dont offert » : valeur des prestations offertes', () => {
    const lines = [line, { ...line, id: 'l2', unit_price: 90, quantity: 2, discount_percent: 100 }];
    expect(offeredTotal(lines)).toBe(180);
    renderRoutes([
      { path: '/', element: <TotalsList totals={computeTotals(lines)} offered={offeredTotal(lines)} /> },
    ]);
    expect(screen.getByLabelText('Totaux')).toHaveTextContent('Dont offert');
  });
});
