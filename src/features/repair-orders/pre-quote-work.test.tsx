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

// Expertise d'1 h tout juste : au choix du bureau
const work: PreQuoteWork = {
  repair_order_id: 'ro1',
  repair_order_number: 'OR00012',
  quote_id: 'q1',
  quote_number: 'DV00034',
  expertise_hours: 1,
  first_hour_offered: false,
  lines: [
    {
      id: 'l1',
      description: 'Diagnostic freinage\nDétail du technicien',
      hours: 1,
      is_labor: true,
      offered_hours: 0,
      billed_hours: 1,
      suggested_price: 90,
    },
    {
      id: 'l2',
      description: 'Contrôle sécurité',
      hours: null,
      is_labor: false,
      offered_hours: 0,
      billed_hours: null,
      suggested_price: 60,
    },
  ],
};

// Expertise de 2,5 h : facturée moins 1 h (1re heure offerte sur les premières lignes)
const longWork: PreQuoteWork = {
  ...work,
  expertise_hours: 2.5,
  first_hour_offered: true,
  lines: [
    {
      id: 'e1',
      description: 'Lecture valise',
      hours: 0.5,
      is_labor: true,
      offered_hours: 0.5,
      billed_hours: 0,
      suggested_price: 45,
    },
    {
      id: 'e2',
      description: 'Recherche de fuite',
      hours: 1,
      is_labor: true,
      offered_hours: 0.5,
      billed_hours: 0.5,
      suggested_price: 45,
    },
    {
      id: 'e3',
      description: 'Essai routier',
      hours: 1,
      is_labor: true,
      offered_hours: 0,
      billed_hours: 1,
      suggested_price: 90,
    },
    {
      id: 'e4',
      description: 'Contrôle sécurité',
      hours: null,
      is_labor: false,
      offered_hours: 0,
      billed_hours: null,
      suggested_price: 60,
    },
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
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'Expertise de 1 h (1 h ou moins) : à toi de choisir de l’offrir ou de la facturer.',
    );
    expect(price).toHaveValue('90,00'); // taux horaire × temps
    await userEvent.clear(price);
    await userEvent.type(price, '120,50');
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Décision pour « Contrôle sécurité »'),
      'offered',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider et envoyer la facture' }));

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
    expect(within(dialog).getByRole('button', { name: 'Valider et envoyer la facture' })).toBeDisabled();
  });

  it('plus d’1 h d’expertise : facturée moins 1 h, la première heure offerte d’office', async () => {
    vi.mocked(fetchPreQuoteWork).mockResolvedValue(longWork);
    vi.mocked(settlePreQuoteWork).mockResolvedValue({
      invoice_id: 'inv2',
      invoice_number: 'F11891',
      billed: 2,
      offered: 2,
    });
    renderCard(true);
    const dialog = await screen.findByRole('dialog', { name: 'Travaux réalisés avant le devis' });
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'Expertise de 2,5 h : facturée moins 1 h. La première heure est offerte',
    );

    // Main-d'œuvre : décision imposée
    const first = within(dialog).getByLabelText('Décision pour « Lecture valise »');
    expect(first).toBeDisabled();
    expect(first).toHaveValue('offered');
    expect(within(dialog).queryByLabelText('Prix HT de « Lecture valise »')).toBeNull();
    expect(
      within(dialog).getByText('Offert : compris dans la première heure d’expertise.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Décision pour « Recherche de fuite »')).toHaveValue('billed');
    expect(within(dialog).getByLabelText('Prix HT de « Recherche de fuite »')).toHaveValue('45,00');
    expect(
      within(dialog).getByText('0,5 h facturée(s), 0,5 h offerte(s) (1re heure d’expertise).'),
    ).toBeInTheDocument();

    // « Tout offrir » : seulement le forfait, laissé au choix
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tout offrir' }));
    expect(within(dialog).getByLabelText('Décision pour « Contrôle sécurité »')).toHaveValue('offered');
    expect(within(dialog).getByLabelText('Décision pour « Essai routier »')).toHaveValue('billed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider et envoyer la facture' }));
    await waitFor(() =>
      expect(settlePreQuoteWork).toHaveBeenCalledWith('ro1', [
        { line_id: 'e1', decision: 'offered', price: 45 },
        { line_id: 'e2', decision: 'billed', price: 45 },
        { line_id: 'e3', decision: 'billed', price: 90 },
        { line_id: 'e4', decision: 'offered', price: 60 },
      ]),
    );
  });

  it('messages de confirmation', () => {
    expect(settlementMessage({ invoice_id: 'i', invoice_number: 'F1', billed: 2, offered: 0 })).toBe(
      'Facture F1 émise',
    );
    expect(settlementMessage({ invoice_id: 'i', invoice_number: 'F2', billed: 0, offered: 2 })).toBe(
      'Facture F2 émise à 0 € : tout est offert, mention sur la facture',
    );
  });
});
