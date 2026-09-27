import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { fetchActiveTechnicians } from '@/features/repair-orders/api';
import type * as RoApi from '@/features/repair-orders/api';
import { fetchSettings, type Settings } from '@/features/settings/api';
import type * as SettingsApi from '@/features/settings/api';
import { fakeSession, renderRoutes } from '@/test/render';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import {
  addQuoteLine,
  buildQuoteFromRepairOrder,
  fetchRepairOrderQuotes,
  createQuote,
  createRepairOrderFromQuote,
  fetchQuote,
  fetchQuotes,
  setQuoteResponse,
  updateQuoteLine,
  type QuoteDetail,
  type QuoteLine,
  type QuoteOverview,
} from './api';
import type * as QuotesApi from './api';
import { NewQuotePage } from './NewQuotePage';
import { QuotePage } from './QuotePage';
import { QuotesPage } from './QuotesPage';
import { RepairOrderQuotesCard } from './RepairOrderQuotesCard';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('@/features/settings/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SettingsApi>()),
  fetchSettings: vi.fn(),
}));
vi.mock('@/features/repair-orders/api', async (importOriginal) => ({
  ...(await importOriginal<typeof RoApi>()),
  fetchActiveTechnicians: vi.fn(),
  searchClients: vi.fn().mockResolvedValue([]),
  findVehicleByPlate: vi.fn().mockResolvedValue(null),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof QuotesApi>()),
  fetchQuotes: vi.fn(),
  fetchQuote: vi.fn(),
  fetchRepairOrderQuotes: vi.fn(),
  buildQuoteFromRepairOrder: vi.fn(),
  createQuote: vi.fn(),
  addQuoteLine: vi.fn(),
  updateQuoteLine: vi.fn(),
  setQuoteResponse: vi.fn(),
  createRepairOrderFromQuote: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const quote = (overrides: Partial<QuoteOverview> = {}): QuoteOverview =>
  ({
    id: 'q1',
    number: null,
    status: 'in_progress',
    repair_order_id: 'ro1',
    repair_order_number: 'OR00001',
    merged_into_repair_order_id: null,
    resulting_repair_order_id: null,
    client_id: 'c1',
    client_name: 'Transports Martin',
    plate: 'GH-512-RT',
    vehicle_type: 'pl',
    valid_until: null,
    created_at: '2026-09-27T10:00:00Z',
    total_ht: 270,
    total_vat: 54,
    total_ttc: 324,
    ...overrides,
  }) as QuoteOverview;

const line = (overrides: Partial<QuoteLine> = {}): QuoteLine =>
  ({
    id: 'l1',
    quote_id: 'q1',
    section: 'planned',
    position: 0,
    line_type: 'labor',
    description: 'Remplacement disques avant',
    unit_price: 90,
    quantity: 3,
    discount_percent: 0,
    vat_rate: 20,
    estimated_hours: 3,
    ...overrides,
  }) as QuoteLine;

function mockData(detail?: Partial<QuoteDetail>) {
  vi.mocked(fetchProfile).mockResolvedValue({
    id: 'u1',
    email: 'reception@test.fr',
    full_name: 'Réception',
    role: 'reception',
    is_active: true,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  });
  vi.mocked(fetchSettings).mockResolvedValue({ company: { default_vat_rate: 20 } } as Settings);
  vi.mocked(fetchQuote).mockResolvedValue({
    quote: quote(),
    lines: [line()],
    laborRate: 90,
    clientDiscount: 10,
    ...detail,
  });
}

function setup(path: string, detail?: Partial<QuoteDetail>) {
  mockData(detail);
  return renderRoutes(
    [
      { path: '/devis', element: <QuotesPage /> },
      { path: '/devis/nouveau', element: <NewQuotePage /> },
      { path: '/devis/:id', element: <QuotePage /> },
      { path: '/or/:id', element: <h1>Fiche OR</h1> },
    ],
    { initialPath: path, auth: { session: fakeSession() } },
  );
}

describe('liste des devis', () => {
  it('en attente de réponse par défaut, filtres et recherche', async () => {
    vi.mocked(fetchQuotes).mockResolvedValue([
      quote(),
      quote({ id: 'q2', number: 'DV00002', status: 'accepted', client_name: 'Dupont', plate: 'AB-123-CD' }),
      quote({
        id: 'q3',
        number: 'DV00003',
        status: 'sent',
        client_name: 'Logistique Nord',
        plate: 'EF-456-GH',
      }),
    ]);
    setup('/devis');
    expect(await screen.findByText(/Transports Martin/)).toBeInTheDocument();
    expect(screen.queryByText(/Dupont/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /^Accepté/ }));
    expect(screen.getByText(/Dupont/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Tous/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un devis' }), 'ef456');
    expect(screen.getByText(/Logistique Nord/)).toBeInTheDocument();
    expect(screen.queryByText(/Transports Martin/)).toBeNull();
  });

  it('nouveau devis sans OR, puis ouverture de l’éditeur', async () => {
    vi.mocked(createQuote).mockResolvedValue('q9');
    setup('/devis/nouveau');
    await userEvent.type(await screen.findByLabelText('Client'), 'Garage Nouveau');
    await userEvent.type(screen.getByLabelText('Immatriculation (facultatif)'), 'ab123cd');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le devis' }));
    await waitFor(() =>
      expect(createQuote).toHaveBeenCalledWith({
        client_name: 'Garage Nouveau',
        plate: 'AB-123-CD',
        vehicle_type: 'pl',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'DEVIS' })).toBeInTheDocument();
  });
});

describe('éditeur de devis', () => {
  it('lignes, totaux, et modification d’un prix à la virgule', async () => {
    vi.mocked(updateQuoteLine).mockResolvedValue();
    setup('/devis/q1');
    expect(await screen.findByRole('heading', { name: 'DEVIS' })).toBeInTheDocument();
    expect(screen.getByLabelText('Totaux')).toHaveTextContent(/Total HT\s*270,00\s€/);
    expect(screen.getByLabelText('Totaux')).toHaveTextContent(/Total TTC\s*324,00\s€/);

    const price = screen.getByRole('textbox', { name: 'Prix unit. HT' });
    await userEvent.clear(price);
    await userEvent.type(price, '95,5');
    await userEvent.tab();
    expect(updateQuoteLine).toHaveBeenCalledWith('l1', { unit_price: 95.5 });
  });

  it('une saisie invalide est ignorée', async () => {
    setup('/devis/q1');
    const quantity = await screen.findByRole('textbox', { name: 'Quantité' });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '0');
    await userEvent.tab();
    expect(updateQuoteLine).not.toHaveBeenCalled();
    expect(quantity).toHaveValue('3');
  });

  it('main d’œuvre au taux horaire du client, avec sa remise', async () => {
    vi.mocked(addQuoteLine).mockResolvedValue();
    setup('/devis/q1');
    await userEvent.click(await screen.findByRole('button', { name: /Ajouter de la main d’œuvre/ }));
    const dialog = screen.getByRole('dialog', { name: 'Main d’œuvre' });
    expect(dialog).toHaveTextContent(/90,00\s€ HT \/ h/);
    await userEvent.type(within(dialog).getByLabelText('Prestation'), 'Géométrie');
    await userEvent.type(within(dialog).getByLabelText('Temps (heures)'), '1,5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(addQuoteLine).toHaveBeenCalledWith('q1', {
        section: 'planned',
        position: 1,
        vat_rate: 20,
        discount_percent: 10,
        line_type: 'labor',
        description: 'Géométrie',
        estimated_hours: 1.5,
        quantity: 1.5,
        unit_price: 90,
        labor_category: 'pl',
      }),
    );
  });

  it('accord du client après confirmation', async () => {
    vi.mocked(setQuoteResponse).mockResolvedValue();
    setup('/devis/q1');
    await userEvent.click(await screen.findByRole('button', { name: /^Accepté$/ }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer l’accord' }),
    );
    await waitFor(() => expect(setQuoteResponse).toHaveBeenCalledWith('q1', 'accepted'));
  });

  it('devis accepté : figé, création de l’OR avec le technicien choisi', async () => {
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([{ id: 't1', display_name: 'Alice', color: null }]);
    vi.mocked(createRepairOrderFromQuote).mockResolvedValue('ro2');
    setup('/devis/q1', { quote: quote({ status: 'accepted', number: 'DV00001' }) });

    expect(await screen.findByText(/Devis accepté par le client/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Prix unit. HT' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Ajouter une ligne/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Accepté$/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Créer l’OR avec les travaux acceptés/ }));
    const dialog = screen.getByRole('dialog', { name: 'Créer l’OR' });
    await within(dialog).findByRole('option', { name: 'Alice' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Technicien'), 't1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer l’OR' }));
    await waitFor(() => expect(createRepairOrderFromQuote).toHaveBeenCalledWith('q1', 't1'));
    expect(await screen.findByRole('heading', { name: 'Fiche OR' })).toBeInTheDocument();
  });
});

describe('devis depuis la fiche OR', () => {
  it('travaux à chiffrer signalés ; « Préparer le devis » ouvre le devis de l’OR', async () => {
    vi.mocked(fetchRepairOrderQuotes).mockResolvedValue([]);
    vi.mocked(buildQuoteFromRepairOrder).mockResolvedValue('q1');
    mockData();
    renderRoutes(
      [
        {
          path: '/or/:id',
          element: (
            <RepairOrderQuotesCard order={{ id: 'ro1', status: 'quote_pending' } as RepairOrderOverview} />
          ),
        },
        { path: '/devis/:id', element: <QuotePage /> },
      ],
      { initialPath: '/or/ro1', auth: { session: fakeSession() } },
    );
    expect(await screen.findByText('Le technicien a signalé des travaux à chiffrer.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Préparer le devis/ }));
    expect(buildQuoteFromRepairOrder).toHaveBeenCalledWith('ro1');
    expect(await screen.findByRole('heading', { name: 'DEVIS' })).toBeInTheDocument();
  });
});
