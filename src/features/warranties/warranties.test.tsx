import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { deleteWarrantyClaim, fetchWarrantyClaims, saveWarrantyClaim, type WarrantyClaim } from './api';
import type * as WarrantiesApi from './api';
import { matchesWarrantyFilter, warrantyFromForm, warrantyStats, warrantyToForm } from './domain';
import { WarrantiesPage } from './WarrantiesPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof WarrantiesApi>()),
  fetchWarrantyClaims: vi.fn(),
  saveWarrantyClaim: vi.fn(),
  deleteWarrantyClaim: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const claim = (overrides: Partial<WarrantyClaim> = {}): WarrantyClaim =>
  ({
    id: 'w1',
    part_name: 'Étrier de frein AV',
    brand: 'Knorr-Bremse',
    supplier_id: 'sp1',
    supplier_name: 'PL Pièces 95',
    reference: 'K012345',
    amount_ht: 180,
    reason: 'Fuite',
    status: 'to_return',
    notes: null,
    repair_order_id: 'ro1',
    repair_order_number: 'OR00012',
    vehicle_id: 'v1',
    vehicle_plate: 'GH-512-RT',
    client_id: 'c1',
    client_name: 'Transports Martin',
    ro_line_id: 'l1',
    created_at: '2026-09-20T10:00:00Z',
    ...overrides,
  }) as WarrantyClaim;

const claims = [
  claim(),
  claim({
    id: 'w2',
    part_name: 'Turbo',
    brand: null,
    amount_ht: 950,
    status: 'sent',
    repair_order_id: null,
    repair_order_number: null,
    vehicle_id: null,
    vehicle_plate: null,
  }),
  claim({ id: 'w3', part_name: 'Alternateur', amount_ht: 400, status: 'refunded' }),
];

beforeEach(() => {
  vi.mocked(fetchWarrantyClaims).mockResolvedValue(claims);
  vi.mocked(saveWarrantyClaim).mockResolvedValue(undefined);
  vi.mocked(deleteWarrantyClaim).mockResolvedValue(undefined);
});

const renderPage = (path = '/garanties') =>
  renderRoutes([{ path: '/garanties', element: <WarrantiesPage /> }], { initialPath: path });

describe('garanties : règles', () => {
  it('en cours = à retourner, envoyée, acceptée', () => {
    expect(claims.filter((c) => matchesWarrantyFilter(c, 'open')).map((c) => c.id)).toEqual(['w1', 'w2']);
    expect(matchesWarrantyFilter(claim({ status: 'accepted' }), 'open')).toBe(true);
    expect(matchesWarrantyFilter(claim({ status: 'refused' }), 'open')).toBe(false);
    expect(claims.filter((c) => matchesWarrantyFilter(c, 'refunded')).map((c) => c.id)).toEqual(['w3']);
  });

  it('statistiques : retours en cours, montant en attente, fournisseurs / marques', () => {
    expect(warrantyStats(claims)).toEqual({
      openCount: 2,
      pendingAmount: 1130,
      bySupplier: [
        { label: 'PL Pièces 95 / Knorr-Bremse', count: 2 },
        { label: 'PL Pièces 95', count: 1 },
      ],
    });
  });

  it('formulaire : préremplissage depuis une pièce, champs vides → null', () => {
    const values = warrantyToForm(null, { part_name: 'Plaquettes', amount_ht: 46.5, brand: null });
    expect(values).toMatchObject({
      part_name: 'Plaquettes',
      amount_ht: '46,5',
      brand: '',
      status: 'to_return',
    });
    expect(warrantyFromForm(values)).toEqual({
      part_name: 'Plaquettes',
      brand: null,
      supplier_name: '',
      reference: null,
      amount_ht: 46.5,
      reason: null,
      status: 'to_return',
      notes: null,
    });
  });
});

describe('garanties : écran', () => {
  it('liste des retours en cours, statistiques, liens OR et véhicule', async () => {
    renderPage();
    const card = await screen.findByRole('article', { name: 'Étrier de frein AV' });
    expect(card).toHaveTextContent('Knorr-Bremse — PL Pièces 95 — K012345 — 180,00 € HT');
    expect(card).toHaveTextContent('À retourner');
    expect(within(card).getByRole('link', { name: 'OR00012' })).toHaveAttribute('href', '/or/ro1');
    expect(within(card).getByRole('link', { name: 'GH-512-RT' })).toHaveAttribute('href', '/vehicules/v1');
    expect(screen.getByRole('article', { name: 'Turbo' })).toHaveTextContent('Envoyée au fournisseur');
    expect(screen.queryByRole('article', { name: 'Alternateur' })).toBeNull();
    expect(screen.getByText('Retours en cours').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('Montant en attente').previousSibling).toHaveTextContent('1 130,00 €');

    await userEvent.click(screen.getByRole('button', { name: 'Tous' }));
    expect(screen.getByRole('article', { name: 'Alternateur' })).toBeInTheDocument();
  });

  it('filtre dans l’adresse', async () => {
    renderPage('/garanties?filtre=refunded');
    expect(await screen.findByRole('article', { name: 'Alternateur' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Turbo' })).toBeNull();
  });

  it('nouveau retour : pièce obligatoire, enregistrement', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau retour' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau retour / garantie' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Indique la pièce')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Pièce'), 'Démarreur');
    await userEvent.type(within(dialog).getByLabelText('Fournisseur'), 'Distri PL');
    await userEvent.type(within(dialog).getByLabelText('Montant HT (€)'), '320,50');
    await userEvent.type(within(dialog).getByLabelText('Motif du retour'), 'Erreur de référence');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveWarrantyClaim).toHaveBeenCalledWith(
        null,
        {
          part_name: 'Démarreur',
          brand: null,
          supplier_name: 'Distri PL',
          reference: null,
          amount_ht: 320.5,
          reason: 'Erreur de référence',
          status: 'to_return',
          notes: null,
        },
        null,
      ),
    );
  });

  it('suivi : changement de statut, puis suppression', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Étrier de frein AV' }));
    const dialog = screen.getByRole('dialog', { name: 'Retour / garantie' });
    expect(dialog).toHaveTextContent('Pièce de l’OR OR00012 — GH-512-RT');
    await userEvent.selectOptions(within(dialog).getByLabelText('Statut'), 'accepted');
    await userEvent.type(within(dialog).getByLabelText(/Notes/), 'RMA 5521');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveWarrantyClaim).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ status: 'accepted', notes: 'RMA 5521', supplier_name: 'PL Pièces 95' }),
        null,
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer Turbo' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(deleteWarrantyClaim).toHaveBeenCalledWith('w2'));
  });
});
