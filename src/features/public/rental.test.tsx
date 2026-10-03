import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signOnline } from '@/features/signature/api';
import { renderRoutes } from '@/test/render';
import { fetchPublicDocument, type PublicRental, type PublicRentalSignature } from './api';
import type * as PublicApi from './api';
import { PublicDocumentPage } from './PublicDocumentPage';

const pad = vi.hoisted(() => ({ isEmpty: false }));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PublicApi>()),
  fetchPublicDocument: vi.fn(),
}));
vi.mock('@/features/signature/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  signOnline: vi.fn(),
}));
// Zone de signature simulée : le dessin au doigt n'existe pas dans jsdom.
vi.mock('@/components/use-signature-pad', () => ({
  useSignaturePad: () => ({
    canvasRef: { current: null },
    isEmpty: pad.isEmpty,
    setIsEmpty: vi.fn(),
    clear: vi.fn(),
    toBlob: vi.fn(),
    toDataUrl: () => (pad.isEmpty ? null : 'data:image/png;base64,SIGNATURE'),
  }),
}));

const TOKEN = 'b'.repeat(64);

const contract = (overrides: Partial<PublicRentalSignature> = {}): PublicRentalSignature => ({
  type: 'rental_signature',
  status: 'pending',
  expires_at: '2026-10-11T08:00:00Z',
  company: {
    legal_name: 'RAPID TRUCK SERVICE',
    address_line: '19 rue Gaston Monmousseau',
    postal_code: '95190',
    city: 'Goussainville',
    email: 'atelier@rapidtruckservice.fr',
    phone: null,
    siret: null,
  },
  number: 'LC-2026-0007',
  kind: 'rental',
  rental_status: 'reserved',
  created_at: '2026-10-03T08:00:00Z',
  client_name: 'Julie Martin',
  vehicle: { plate: 'GE-781-UV', brand: 'Renault', model: 'Master', category: 'van' },
  departure_at: '2026-10-05T07:30:00Z',
  planned_return_at: '2026-10-07T16:00:00Z',
  returned_at: null,
  conditions: {
    billable: true,
    rate_period: 'day',
    unit_price: 95,
    periods: 2,
    discount_percent: 0,
    km_included: 500,
    extra_km_price: 0.35,
    fuel_price_per_liter: 2.1,
    cleaning_fee: null,
    late_fee_per_hour: null,
    deposit: 1500,
    deposit_mode: 'card_hold',
    franchise: 800,
    vat_rate: 20,
  },
  departure_inspection: null,
  departure_damages: [],
  signed_at: null,
  signer_name: null,
  ...overrides,
});

const setup = () =>
  renderRoutes([{ path: '/d/:token', element: <PublicDocumentPage /> }], { initialPath: `/d/${TOKEN}` });

beforeEach(() => {
  vi.mocked(fetchPublicDocument).mockReset();
  vi.mocked(signOnline).mockReset();
  pad.isEmpty = false;
});

describe('contrat de location en ligne (client, sans compte)', () => {
  it('affiche les conditions : tarif, montant, km inclus, caution, franchise', async () => {
    vi.mocked(fetchPublicDocument).mockResolvedValue(contract());
    setup();
    expect(await screen.findByRole('heading', { name: 'CONTRAT DE LOCATION' })).toBeInTheDocument();
    expect(screen.getByText(/95,00\s€ HT \/ jour × 2 jours/)).toBeInTheDocument();
    expect(screen.getByText(/190,00\s€ HT · 228,00\s€ TTC/)).toBeInTheDocument();
    expect(screen.getByText('500 km')).toBeInTheDocument();
    expect(screen.getByText(/1\s500,00\s€ · Empreinte de carte bancaire/)).toBeInTheDocument();
    expect(screen.getByText('800,00 €')).toBeInTheDocument();
    expect(screen.getByText('À signer')).toBeInTheDocument();
  });

  it('signature : nom et case des conditions obligatoires, puis confirmation', async () => {
    vi.mocked(fetchPublicDocument).mockResolvedValue(contract());
    vi.mocked(signOnline).mockResolvedValue({ status: 'signed' });
    setup();
    const submit = await screen.findByRole('button', { name: 'Signer le contrat' });
    await userEvent.type(screen.getByLabelText('Votre nom'), 'Julie Martin');
    await userEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Merci de cocher la case pour accepter les conditions.',
    );
    expect(signOnline).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox', { name: /J’ai lu et j’accepte les conditions/ }));
    vi.mocked(fetchPublicDocument).mockResolvedValue(
      contract({ status: 'signed', signed_at: '2026-10-03T09:15:00Z', signer_name: 'Julie Martin' }),
    );
    await userEvent.click(submit);
    await waitFor(() =>
      expect(signOnline).toHaveBeenCalledWith({
        token: TOKEN,
        signer_name: 'Julie Martin',
        signature: 'data:image/png;base64,SIGNATURE',
      }),
    );
    expect(await screen.findByText(/Contrat signé\. Merci/)).toBeInTheDocument();
    expect(screen.getByText(/Signé par Julie Martin le/)).toBeInTheDocument();
  });

  it('contrat modifié par l’atelier après la signature : nouveau lien annoncé', async () => {
    vi.mocked(fetchPublicDocument).mockResolvedValue(contract({ status: 'signed' }));
    setup();
    expect(
      await screen.findByText(/L’atelier a modifié le contrat depuis votre signature/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signer le contrat' })).toBeNull();
  });

  it('lien expiré : plus de signature possible', async () => {
    vi.mocked(fetchPublicDocument).mockResolvedValue(contract({ status: 'expired' }));
    setup();
    expect(await screen.findByText(/Ce lien de signature n’est plus valable/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signer le contrat' })).toBeNull();
  });

  it('contrat envoyé : bon de prêt gratuit, état des lieux, impression', async () => {
    const sent: PublicRental = {
      ...contract({
        kind: 'loan',
        rental_status: 'active',
        conditions: { ...contract().conditions, billable: false },
        departure_inspection: { mileage: 48210, fuel_eighths: 8 },
        departure_damages: ['Rayure porte arrière'],
      }),
      type: 'rental',
    };
    vi.mocked(fetchPublicDocument).mockResolvedValue(sent);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    setup();
    expect(await screen.findByRole('heading', { name: 'BON DE PRÊT' })).toBeInTheDocument();
    expect(screen.getByText('Prêt gratuit')).toBeInTheDocument();
    expect(screen.getByText(/48\s210 km · Carburant plein \(8\/8\)/)).toBeInTheDocument();
    expect(screen.getByText(/Dommages existants : Rayure porte arrière/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Signer/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Imprimer / enregistrer en PDF' }));
    expect(print).toHaveBeenCalled();
  });
});
