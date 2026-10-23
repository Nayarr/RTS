import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { fetchInspection, fetchLotsForSize, type TireLot } from './api';
import type * as TiresApi from './api';
import { inspectionPositions, lotDesignation, sortLots } from './pick';
import { TirePickDialog } from './TirePickDialog';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TiresApi>()),
  fetchInspection: vi.fn(),
  fetchLotsForSize: vi.fn(),
}));

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
  load_index: null,
  location: 'Rack A1',
  dot: null,
  supplier_id: 's1',
  supplier_name: 'Euromaster',
  purchase_price: 312,
  sale_price: 415,
  stock_qty: 8,
  reserved_qty: 0,
  available_qty: 8,
  sold_90d: 0,
  part_id: 'p1',
  ...overrides,
});

describe('positions relevées sur la fiche', () => {
  it('pneus à 50 % ou HS avec leur taille : profil et quantité de la position', () => {
    const positions = inspectionPositions(
      {
        pneus: {
          avant_etat: 'HS',
          avant_taille: '315/80/22.5',
          arriere_etat: '50',
          arriere_taille: '31570225',
          essieux: [
            { etat: 'OK', taille: '385/65/22.5' },
            { etat: 'HS', taille: '385/65/22.5' },
          ],
        },
      },
      'pl',
    );
    expect(positions.map(({ key, size, profile, quantity }) => [key, size, profile, quantity])).toEqual([
      ['avant', '315/80 R22.5', 'avant', 2],
      ['arriere', '315/70 R22.5', 'arriere', 4],
      ['essieu-4', '385/65 R22.5', 'arriere', 2],
    ]);
  });

  it('remorque : profil remorque ; utilitaire : toutes positions ; taille manquante ignorée', () => {
    const inspection = { pneus: { avant_etat: 'HS', avant_taille: '2356516', arriere_etat: 'HS' } };
    expect(inspectionPositions(inspection, 'remorque')[0]?.profile).toBe('remorque');
    expect(inspectionPositions(inspection, 'vul')).toEqual([
      expect.objectContaining({ key: 'avant', profile: 'toutes', quantity: 2 }),
    ]);
  });

  it('profil de la position d’abord, désignation de la pièce du lot', () => {
    const lots = [
      lot({ id: 'a', profile: 'arriere', available_qty: 20 }),
      lot({ id: 'm', profile: 'multi', available_qty: 2 }),
      lot({ id: 'b' }),
    ];
    // Profil de la position, puis multi-positions (va partout), puis le reste
    expect(sortLots(lots, 'avant').map((item) => item.id)).toEqual(['b', 'm', 'a']);
    expect(lotDesignation(lot({ condition: 'rechape' }))).toBe(
      'Pneu Michelin X Multi Z 315/80 R22.5 rechapé',
    );
  });
});

describe('pneus du stock au devis', () => {
  it('taille relevée sur la fiche, lot choisi, ligne de la pièce du lot', async () => {
    vi.mocked(fetchInspection).mockResolvedValue({
      pneus: { avant_etat: 'HS', avant_taille: '315/80/22.5' },
    });
    vi.mocked(fetchLotsForSize).mockResolvedValue([
      lot({
        id: 'h',
        brand_name: 'Hankook',
        model: 'AH31',
        available_qty: 1,
        sale_price: 292,
        part_id: 'p2',
      }),
      lot(),
    ]);
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderRoutes([
      {
        path: '/',
        element: (
          <TirePickDialog
            vehicleType="pl"
            repairOrderId="r1"
            repairOrderNumber="OR00192"
            documentLabel="devis"
            onAdd={onAdd}
            onClose={onClose}
          />
        ),
      },
    ]);
    expect(
      await screen.findByRole('heading', { name: 'Pneus avant (HS) · 315/80 R22.5' }),
    ).toBeInTheDocument();
    expect(fetchLotsForSize).toHaveBeenCalledWith('31580225', 'pl');
    expect(await screen.findByRole('radio', { name: 'Michelin X Multi Z' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Stock insuffisant pour 2 pneus')).toBeInTheDocument();
    expect(screen.getByText(/2 × 415,00 € = 830,00 € HT/)).toBeInTheDocument();
    expect(
      screen.getByText(/sont réservés pour ce devis et sortent du stock quand la facture est émise/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Ajouter au devis/ }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        line_type: 'part',
        description: 'Pneu Michelin X Multi Z 315/80 R22.5',
        quantity: 2,
        unit_price: 415,
        purchase_price: 312,
        brand: 'Michelin',
        supplier_id: 's1',
        part_id: 'p1',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('sans fiche de contrôle : taille tapée', async () => {
    vi.mocked(fetchLotsForSize).mockResolvedValue([]);
    renderRoutes([
      {
        path: '/',
        element: (
          <TirePickDialog
            vehicleType="vul"
            repairOrderId={null}
            repairOrderNumber={null}
            documentLabel="facture"
            onAdd={vi.fn()}
            onClose={vi.fn()}
          />
        ),
      },
    ]);
    await userEvent.type(await screen.findByLabelText('Taille du pneu'), '2356516C');
    expect(await screen.findByText(/Aucun pneu 235\/65 R16C en stock/)).toBeInTheDocument();
    expect(fetchLotsForSize).toHaveBeenCalledWith('2356516', 'vul');
    expect(screen.getByRole('button', { name: /Ajouter à la facture/ })).toBeDisabled();
  });
});
