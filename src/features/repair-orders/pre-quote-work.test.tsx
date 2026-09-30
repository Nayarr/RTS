import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import {
  fetchPreQuoteWork,
  settlementMessage,
  settlePreQuoteWork,
  type PreQuoteWork,
} from './pre-quote-work';
import type * as PreQuoteApi from './pre-quote-work';
import { PreQuoteWorkCard } from './PreQuoteWorkCard';

vi.mock('./pre-quote-work', async (importOriginal) => ({
  ...(await importOriginal<typeof PreQuoteApi>()),
  fetchPreQuoteWork: vi.fn(),
  settlePreQuoteWork: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const work: PreQuoteWork = {
  repair_order_id: 'ro1',
  repair_order_number: 'OR00012',
  quote_id: 'q1',
  quote_number: 'DV00034',
  lines: [
    { id: 'l1', description: 'Diagnostic freinage\nDétail du technicien', hours: 1.5, suggested_price: 135 },
    { id: 'l2', description: 'Contrôle sécurité', hours: null, suggested_price: 60 },
  ],
};

const renderCard = (autoOpen = false) =>
  renderRoutes(
    [
      { path: '/or/ro1', element: <PreQuoteWorkCard repairOrderId="ro1" autoOpen={autoOpen} /> },
      { path: '/factures/:id', element: <h1>Facture</h1> },
    ],
    { initialPath: '/or/ro1' },
  );

beforeEach(() => {
  vi.mocked(fetchPreQuoteWork).mockResolvedValue(work);
});

describe('travaux réalisés avant le devis', () => {
  it('rien à décider : aucun bandeau', async () => {
    vi.mocked(fetchPreQuoteWork).mockResolvedValue(null);
    renderCard();
    await waitFor(() => expect(fetchPreQuoteWork).toHaveBeenCalledWith('ro1'));
    expect(screen.queryByText('Travaux réalisés avant le devis')).toBeNull();
  });

  it('facturer une ligne à un prix corrigé, offrir l’autre ; la facture émise s’ouvre', async () => {
    vi.mocked(settlePreQuoteWork).mockResolvedValue({
      invoice_id: 'inv1',
      invoice_number: 'F11890',
      billed: 1,
      offered: 1,
    });
    renderCard();
    await userEvent.click(await screen.findByRole('button', { name: 'Facturer / offrir ces travaux' }));

    const dialog = screen.getByRole('dialog', { name: 'Travaux réalisés avant le devis' });
    const price = within(dialog).getByLabelText('Prix HT de « Diagnostic freinage »');
    expect(price).toHaveValue('135,00'); // taux horaire × temps
    await userEvent.clear(price);
    await userEvent.type(price, '120,50');
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Décision pour « Contrôle sécurité »'),
      'offered',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider' }));

    await waitFor(() =>
      expect(settlePreQuoteWork).toHaveBeenCalledWith('ro1', [
        { line_id: 'l1', decision: 'billed', price: 120.5 },
        { line_id: 'l2', decision: 'offered', price: 60 },
      ]),
    );
    expect(await screen.findByRole('heading', { name: 'Facture' })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith(
      'Facture F11890 émise (travaux offerts inclus avec 100 % de remise)',
    );
  });

  it('« Tout offrir » puis « Tout facturer » ; prix obligatoire pour facturer', async () => {
    renderCard(true);
    const dialog = await screen.findByRole('dialog', { name: 'Travaux réalisés avant le devis' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tout offrir' }));
    for (const select of within(dialog).getAllByRole('combobox')) expect(select).toHaveValue('offered');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Tout facturer' }));
    await userEvent.clear(within(dialog).getByLabelText('Prix HT de « Contrôle sécurité »'));
    expect(within(dialog).getByText('Indique un prix pour chaque ligne à facturer.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Valider' })).toBeDisabled();
  });

  it('messages de confirmation', () => {
    expect(settlementMessage({ invoice_id: 'i', invoice_number: 'F1', billed: 2, offered: 0 })).toBe(
      'Facture F1 émise',
    );
    expect(settlementMessage({ invoice_id: null, invoice_number: null, billed: 0, offered: 2 })).toBe(
      'Travaux offerts enregistrés',
    );
  });
});
