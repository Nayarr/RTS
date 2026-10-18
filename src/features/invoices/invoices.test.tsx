import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { fetchSettings, type Settings } from '@/features/settings/api';
import type * as SettingsApi from '@/features/settings/api';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  addCreditNote,
  addInvoiceLine,
  addPayment,
  buildInvoiceDraft,
  fetchInvoice,
  fetchInvoices,
  fetchRepairOrderInvoices,
  issueInvoice,
  recordInvoiceReminder,
  shareInvoice,
  updateInvoiceLine,
  type InvoiceDetail,
  type InvoiceLine,
  type InvoiceOverview,
} from './api';
import type * as InvoicesApi from './api';
import {
  balanceHt,
  invoiceShareMessage,
  invoicesCsvRows,
  isOverdue,
  issueBlockers,
  issueWarnings,
  mainVatRate,
} from './domain';
import { InvoicePage } from './InvoicePage';
import { InvoicesPage } from './InvoicesPage';
import { RepairOrderInvoiceCard } from './RepairOrderInvoiceCard';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('@/features/settings/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SettingsApi>()),
  fetchSettings: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof InvoicesApi>()),
  fetchInvoices: vi.fn(),
  fetchInvoice: vi.fn(),
  fetchRepairOrderInvoices: vi.fn(),
  buildInvoiceDraft: vi.fn(),
  addInvoiceLine: vi.fn(),
  updateInvoiceLine: vi.fn(),
  issueInvoice: vi.fn(),
  addPayment: vi.fn(),
  addCreditNote: vi.fn(),
  shareInvoice: vi.fn(),
  recordInvoiceReminder: vi.fn(),
}));
vi.mock('@/features/documents/client-contact', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchClientContact: vi.fn().mockResolvedValue({ email: 'compta@martin.fr', phone: null }),
  updateClientContact: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const invoice = (overrides: Partial<InvoiceOverview> = {}): InvoiceOverview =>
  ({
    id: 'i1',
    number: null,
    status: 'draft',
    client_id: 'c1',
    client_name: 'Transports Martin',
    client_address: null,
    client_siret: null,
    vehicle_label: 'GH-512-RT',
    mileage: 184320,
    service_date: null,
    issued_at: null,
    due_date: null,
    created_at: '2026-09-27T10:00:00Z',
    total_ht: 600,
    total_vat: 120,
    total_ttc: 720,
    paid_ttc: null,
    credited_ttc: null,
    balance_due: null,
    payment_status: null,
    repair_order_ids: ['ro1'],
    repair_order_numbers: ['OR00001'],
    ...overrides,
  }) as InvoiceOverview;

const issued = (overrides: Partial<InvoiceOverview> = {}) =>
  invoice({
    status: 'issued',
    number: 'F11887',
    issued_at: '2026-09-27T10:00:00Z',
    due_date: '2026-10-27',
    paid_ttc: 0,
    credited_ttc: 0,
    balance_due: 720,
    payment_status: 'pending',
    ...overrides,
  });

const line = (overrides: Partial<InvoiceLine> = {}): InvoiceLine =>
  ({
    id: 'l1',
    invoice_id: 'i1',
    position: 100,
    line_type: 'labor',
    description: 'Remplacement disques',
    unit_price: 90,
    quantity: 3,
    discount_percent: 0,
    vat_rate: 20,
    billed_hours: 3,
    ...overrides,
  }) as InvoiceLine;

function mockCommon() {
  vi.mocked(fetchProfile).mockResolvedValue({
    id: 'u1',
    email: 'direction@test.fr',
    full_name: 'Direction',
    role: 'direction',
    is_active: true,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  });
  vi.mocked(fetchSettings).mockResolvedValue({
    company: {
      default_vat_rate: 20,
      legal_name: 'RAPID TRUCK SERVICE',
      address_line: '19 rue Gaston Monmousseau',
      postal_code: '95190',
      city: 'Goussainville',
      email: 'atelier@rapidtruckservice.fr',
    },
  } as Settings);
}

function setupInvoice(detail: Partial<InvoiceDetail> = {}) {
  mockCommon();
  vi.mocked(fetchInvoice).mockResolvedValue({
    invoice: invoice(),
    lines: [
      line(),
      line({
        id: 'l2',
        position: 3000,
        line_type: 'part',
        description: 'Disques',
        unit_price: 165,
        quantity: 2,
      }),
    ],
    payments: [],
    creditNotes: [],
    client: { name: 'Transports Martin', billing_address: null, siret: null, email: null },
    vehicleType: 'pl',
    laborRate: 90,
    clientDiscount: 5,
    ...detail,
  });
  return renderRoutes(
    [
      { path: '/factures/:id', element: <InvoicePage /> },
      { path: '/factures', element: <h1>Liste</h1> },
    ],
    { initialPath: '/factures/i1', auth: { session: fakeSession() } },
  );
}

describe('règles de facturation', () => {
  it('points à vérifier avant l’émission (comme l’ancienne appli)', () => {
    const client = { name: 'X', billing_address: null, siret: '', email: null };
    expect(issueWarnings([line(), line({ id: 'l2', unit_price: null })], client)).toEqual([
      '1 ligne sans prix',
      'SIRET du client manquant',
    ]);
    // Adresse de facturation : mention obligatoire, elle bloque l'émission
    expect(issueBlockers(client)).toHaveLength(1);
    expect(issueBlockers({ ...client, billing_address: '1 rue A' })).toEqual([]);
    expect(
      issueWarnings(
        [
          line(),
          line({ id: 't', line_type: 'text', unit_price: null }),
          line({ id: 'p', line_type: 'package', unit_price: null }),
        ],
        { name: 'X', billing_address: '1 rue A', siret: '12345678900015', email: null },
      ),
    ).toEqual([]);
  });

  it('relance proposée pour une facture échue non soldée', () => {
    expect(isOverdue({ due_date: '2026-09-20', balance_due: 100 }, '2026-09-27')).toBe(true);
    expect(isOverdue({ due_date: '2026-09-27', balance_due: 100 }, '2026-09-27')).toBe(false);
    expect(isOverdue({ due_date: '2026-09-20', balance_due: 0 }, '2026-09-27')).toBe(false);
  });

  it('messages d’envoi et de relance (textes de l’ancienne appli)', () => {
    const company = {
      legal_name: 'RAPID TRUCK SERVICE',
      address_line: '19 rue Gaston Monmousseau',
      postal_code: '95190',
      city: 'Goussainville',
      email: 'atelier@rapidtruckservice.fr',
    };
    const sent = issued({ issued_at: '2026-08-23T10:00:00Z', due_date: '2026-09-22', balance_due: 124 });
    const share = invoiceShareMessage(sent, 'https://app/d/x', company, false);
    expect(share.subject).toBe('Facture F11887 · RAPID TRUCK SERVICE');
    expect(share.body).toContain(
      "d'un montant de 720,00 € TTC (véhicule GH-512-RT), à régler avant le 22/09/2026 :",
    );
    // Tout offert : facture à 0 €, rien à régler
    const free = invoiceShareMessage({ ...sent, total_ttc: 0 }, 'https://app/d/x', company, false);
    expect(free.body).toContain("vous sont offerts à titre commercial : il n'y a rien à régler.");
    expect(free.body).not.toContain('à régler avant');
    const reminder = invoiceShareMessage(sent, 'https://app/d/x', company, true);
    expect(reminder.subject).toBe('Relance · Facture F11887 · RAPID TRUCK SERVICE');
    expect(reminder.body).toContain(
      'la facture F11887 du 23/08/2026 (véhicule GH-512-RT), arrivée à échéance le 22/09/2026, reste impayée pour un montant de 124,00 € TTC.',
    );
    expect(reminder.sms).toBe(
      'Relance : Facture F11887 RAPID TRUCK SERVICE (124,00 € TTC) : https://app/d/x',
    );
  });

  it('export CSV pour la comptabilité', () => {
    const { headers, rows } = invoicesCsvRows([
      issued({ paid_ttc: 400, credited_ttc: 60, balance_due: 260, payment_status: 'partial' }),
    ]);
    expect(headers).toContain('Reste dû');
    expect(rows[0]).toEqual([
      'F11887',
      '27/09/2026',
      '27/10/2026',
      'Transports Martin',
      'GH-512-RT',
      'OR00001',
      600,
      120,
      720,
      400,
      60,
      260,
      'Partiellement payée',
    ]);
  });

  it('avoir proposé : reste dû en HT, au taux de TVA principal', () => {
    expect(balanceHt(issued({ balance_due: 360 }))).toBe(300);
    expect(
      mainVatRate(
        [line({ vat_rate: 5.5, unit_price: 10, quantity: 1 }), line({ id: 'b', vat_rate: 20 })],
        20,
      ),
    ).toBe(20);
    expect(mainVatRate([], 20)).toBe(20);
  });
});

describe('liste des factures', () => {
  it('toutes par défaut, filtres, recherche et reste à encaisser', async () => {
    mockCommon();
    vi.mocked(fetchInvoices).mockResolvedValue([
      issued(),
      issued({ id: 'i2', number: 'F11888', payment_status: 'paid', balance_due: 0, client_name: 'Dupont' }),
      issued({
        id: 'i3',
        number: 'F11889',
        payment_status: 'overdue',
        balance_due: 100,
        client_name: 'Logistique Nord',
        vehicle_label: 'EF-456-GH',
      }),
      invoice({ id: 'i4', client_name: 'Brouillon SA' }),
    ]);
    renderRoutes([{ path: '/factures', element: <InvoicesPage /> }], {
      initialPath: '/factures',
      auth: { session: fakeSession() },
    });
    expect(await screen.findByText(/Transports Martin/)).toBeInTheDocument();
    expect(screen.getByText(/Brouillon SA/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^À encaisser/ }));
    expect(screen.queryByText(/Dupont/)).toBeNull();
    expect(screen.queryByText(/Brouillon SA/)).toBeNull();
    expect(screen.getByText(/Reste à encaisser/)).toHaveTextContent(/820,00\s€/);

    await userEvent.click(screen.getByRole('button', { name: /^En retard/ }));
    expect(screen.getByText(/Logistique Nord/)).toBeInTheDocument();
    expect(screen.queryByText(/Transports Martin/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /^Toutes/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher une facture' }), 'ef456');
    expect(screen.getByText(/Logistique Nord/)).toBeInTheDocument();
    expect(screen.queryByText(/Dupont/)).toBeNull();
  });
});

describe('brouillon de facture', () => {
  it('modification d’une ligne et main d’œuvre ajoutée à l’OR', async () => {
    vi.mocked(updateInvoiceLine).mockResolvedValue();
    vi.mocked(addInvoiceLine).mockResolvedValue();
    setupInvoice();
    const [price] = await screen.findAllByRole('textbox', { name: 'Prix unit. HT' });
    await userEvent.clear(price!);
    await userEvent.type(price!, '95');
    await userEvent.tab();
    expect(updateInvoiceLine).toHaveBeenCalledWith('l1', { unit_price: 95 });

    await userEvent.click(screen.getByRole('button', { name: /Ajouter de la main d’œuvre/ }));
    const dialog = screen.getByRole('dialog', { name: 'Main d’œuvre' });
    await userEvent.type(within(dialog).getByLabelText('Prestation'), 'Géométrie');
    await userEvent.type(within(dialog).getByLabelText('Temps (heures)'), '1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(addInvoiceLine).toHaveBeenCalledWith('i1', {
        repair_order_id: 'ro1',
        position: 3001,
        vat_rate: 20,
        discount_percent: 5,
        billed_hours: 1,
        line_type: 'labor',
        description: 'Géométrie',
        quantity: 1,
        unit_price: 90,
        labor_category: 'pl',
      }),
    );
  });

  it('sans adresse du client : émission bloquée', async () => {
    vi.mocked(issueInvoice).mockClear();
    setupInvoice();
    await userEvent.click(await screen.findByRole('button', { name: /Émettre la facture/ }));
    const dialog = screen.getByRole('dialog', { name: 'Émettre définitivement cette facture ?' });
    expect(dialog).toHaveTextContent('Renseigne l’adresse de facturation du client');
    expect(within(dialog).getByRole('button', { name: 'Émettre la facture' })).toBeDisabled();
  });

  it('émission après confirmation, avec les points à vérifier', async () => {
    vi.mocked(issueInvoice).mockResolvedValue('F11887');
    setupInvoice({
      client: { name: 'Transports Martin', billing_address: '1 rue A', siret: null, email: null },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Émettre la facture/ }));
    const dialog = screen.getByRole('dialog', { name: 'Émettre définitivement cette facture ?' });
    expect(dialog).toHaveTextContent('SIRET du client manquant');
    expect(dialog).toHaveTextContent(/720,00\s€ TTC/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Émettre la facture' }));
    await waitFor(() => expect(issueInvoice).toHaveBeenCalledWith('i1'));
  });
});

describe('facture émise', () => {
  it('figée ; paiement plafonné au reste dû', async () => {
    vi.mocked(addPayment).mockResolvedValue();
    setupInvoice({ invoice: issued({ balance_due: 320, paid_ttc: 400, payment_status: 'partial' }) });
    expect(await screen.findByText(/Facture émise : elle ne se modifie plus/)).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'Prix unit. HT' })[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Ajouter une ligne/ })).toBeNull();
    expect(screen.getByLabelText('Solde')).toHaveTextContent(/Reste dû\s*320,00\s€/);

    await userEvent.click(screen.getByRole('button', { name: /Enregistrer un paiement/ }));
    const dialog = screen.getByRole('dialog', { name: 'Paiement' });
    const amount = within(dialog).getByLabelText('Montant TTC (€)');
    expect(amount).toHaveValue('320');
    await userEvent.clear(amount);
    await userEvent.type(amount, '500');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await within(dialog).findByText(/Au plus le reste dû/)).toBeInTheDocument();
    expect(addPayment).not.toHaveBeenCalled();

    await userEvent.clear(amount);
    await userEvent.type(amount, '150,50');
    await userEvent.selectOptions(within(dialog).getByLabelText('Mode'), 'check');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() =>
      expect(addPayment).toHaveBeenCalledWith('i1', {
        amount_ttc: 150.5,
        method: 'check',
        paid_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
        note: null,
      }),
    );
  });

  it('avoir : motif obligatoire, montant et TVA proposés', async () => {
    vi.mocked(addCreditNote).mockResolvedValue({ id: 'cn1', number: 'AV1' } as Awaited<
      ReturnType<typeof addCreditNote>
    >);
    setupInvoice({ invoice: issued({ balance_due: 360 }) });
    await userEvent.click(await screen.findByRole('button', { name: /Générer un avoir/ }));
    const dialog = screen.getByRole('dialog', { name: 'Générer un avoir' });
    expect(within(dialog).getByLabelText('Montant HT à créditer (€)')).toHaveValue('300');
    expect(within(dialog).getByLabelText('TVA (%)')).toHaveValue('20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Générer l’avoir' }));
    expect(await within(dialog).findByText('Indique le motif')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Motif'), 'Geste commercial');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Générer l’avoir' }));
    await waitFor(() =>
      expect(addCreditNote).toHaveBeenCalledWith('i1', {
        amount_ht: 300,
        vat_rate: 20,
        reason: 'Geste commercial',
      }),
    );
  });
});

describe('envoi et relance', () => {
  it('envoi : lien de consultation, sans relance tant que la facture n’est pas échue', async () => {
    vi.mocked(shareInvoice).mockResolvedValue('c'.repeat(64));
    setupInvoice({ invoice: issued({ due_date: '2999-01-01' }) });
    expect(await screen.findByRole('button', { name: /Envoyer au client/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Relancer/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Envoyer au client/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Envoyer la facture F11887' });
    expect(within(dialog).getByLabelText('Lien', { exact: true })).toHaveValue(
      `${window.location.origin}/d/${'c'.repeat(64)}`,
    );
    expect(within(dialog).getByLabelText('E-mail du client')).toHaveValue('compta@martin.fr');
    expect(recordInvoiceReminder).not.toHaveBeenCalled();
  });

  it('relance d’une facture échue : enregistrée, message de relance prêt', async () => {
    vi.mocked(shareInvoice).mockResolvedValue('c'.repeat(64));
    vi.mocked(recordInvoiceReminder).mockResolvedValue();
    setupInvoice({
      invoice: issued({
        due_date: '2026-01-01',
        balance_due: 324,
        reminders_count: 1,
        last_reminder_at: '2026-09-20T10:00:00Z',
      }),
    });
    expect(await screen.findByText(/1 relance, la dernière le 20\/09\/2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Relancer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Relancer la facture F11887' });
    expect(recordInvoiceReminder).toHaveBeenCalledWith('i1');
    expect(within(dialog).getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
      'href',
      expect.stringContaining('subject=Relance%20%C2%B7%20Facture%20F11887'),
    );
  });
});

describe('facturation depuis la fiche OR', () => {
  it('« Facturer » prépare le brouillon et l’ouvre', async () => {
    vi.mocked(fetchRepairOrderInvoices).mockResolvedValue([]);
    vi.mocked(buildInvoiceDraft).mockResolvedValue('i1');
    mockCommon();
    renderRoutes(
      [
        {
          path: '/or/:id',
          element: (
            <RepairOrderInvoiceCard order={{ id: 'ro1', status: 'to_invoice' } as RepairOrderOverview} />
          ),
        },
        { path: '/factures/:id', element: <h1>Brouillon ouvert</h1> },
      ],
      { initialPath: '/or/ro1', auth: { session: fakeSession() } },
    );
    expect(await screen.findByText('OR validé : la facture est à faire.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Facturer$/ }));
    expect(buildInvoiceDraft).toHaveBeenCalledWith(['ro1']);
    expect(await screen.findByRole('heading', { name: 'Brouillon ouvert' })).toBeInTheDocument();
  });

  const renderCard = (status: RepairOrderOverview['status']) => {
    mockCommon();
    renderRoutes(
      [
        {
          path: '/or/:id',
          element: <RepairOrderInvoiceCard order={{ id: 'ro1', status } as RepairOrderOverview} />,
        },
        { path: '/factures/:id', element: <h1>Brouillon ouvert</h1> },
      ],
      { initialPath: '/or/ro1', auth: { session: fakeSession() } },
    );
  };

  it('OR pas encore terminé : confirmation avant de facturer', async () => {
    vi.mocked(fetchRepairOrderInvoices).mockResolvedValue([]);
    vi.mocked(buildInvoiceDraft).mockClear().mockResolvedValue('i1');
    renderCard('in_progress');
    await userEvent.click(await screen.findByRole('button', { name: /^Facturer$/ }));
    const dialog = screen.getByRole('dialog', { name: 'OR pas encore terminé' });
    expect(buildInvoiceDraft).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Facturer quand même' }));
    expect(await screen.findByRole('heading', { name: 'Brouillon ouvert' })).toBeInTheDocument();
  });

  it('OR déjà facturé : plus de bouton pour facturer', async () => {
    vi.mocked(fetchRepairOrderInvoices).mockResolvedValue([issued()]);
    renderCard('invoiced');
    expect(await screen.findByText('F11887')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Facturer/ })).toBeNull();
  });

  it('facture entièrement annulée par avoir : « Refacturer (après avoir) »', async () => {
    vi.mocked(fetchRepairOrderInvoices).mockResolvedValue([issued({ total_ttc: 720, credited_ttc: 720 })]);
    renderCard('invoiced');
    expect(await screen.findByRole('button', { name: /Refacturer \(après avoir\)/ })).toBeInTheDocument();
  });
});
