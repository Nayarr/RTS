import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '@/features/planning/domain';
import { todayIso } from '@/features/repair-orders/schemas';
import { renderRoutes } from '@/test/render';
import { fetchPublicDocument, respondToQuote, type PublicInvoice, type PublicQuote } from './api';
import type * as PublicApi from './api';
import { PublicDocumentPage } from './PublicDocumentPage';

const pad = vi.hoisted(() => ({ isEmpty: true }));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PublicApi>()),
  fetchPublicDocument: vi.fn(),
  respondToQuote: vi.fn(),
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

const TOKEN = 'a'.repeat(64);

const quote = (overrides: Partial<PublicQuote> = {}): PublicQuote => ({
  type: 'quote',
  company: {
    legal_name: 'RAPID TRUCK SERVICE',
    address_line: '19 rue Gaston Monmousseau',
    postal_code: '95190',
    city: 'Goussainville',
    email: 'atelier@rapidtruckservice.fr',
    phone: null,
    siret: '984 989 137 00018',
  },
  number: 'DV00012',
  issued_at: '2026-09-27T10:00:00Z',
  valid_until: addDays(todayIso(), 30), // toujours valable, quelle que soit la date du test
  status: 'sent',
  accepted_by_name: null,
  accepted_at: null,
  client_name: 'Transports Martin',
  vehicle_plate: 'GH-512-RT',
  lines: [
    {
      section: 'done',
      line_type: 'labor',
      description: 'Diagnostic',
      unit_price: 90,
      quantity: 1,
      discount_percent: 0,
      net_ht: 90,
    },
    {
      section: 'planned',
      line_type: 'part',
      description: 'Disques avant',
      unit_price: 165,
      quantity: 2,
      discount_percent: 10,
      net_ht: 297,
    },
    {
      section: 'planned',
      line_type: 'text',
      description: 'Délai : 48 h',
      unit_price: null,
      quantity: 1,
      discount_percent: 0,
      net_ht: 0,
    },
  ],
  totals: { total_ht: 387, total_vat: 77.4, total_ttc: 464.4 },
  ...overrides,
});

const setup = (document: PublicQuote | PublicInvoice | null) => {
  vi.mocked(fetchPublicDocument).mockResolvedValue(document);
  return renderRoutes([{ path: '/d/:token', element: <PublicDocumentPage /> }], {
    initialPath: `/d/${TOKEN}`,
  });
};

beforeEach(() => {
  pad.isEmpty = true;
});

describe('devis en ligne (client, sans compte)', () => {
  it('affiche le devis : sections, remise, texte, totaux', async () => {
    setup(quote());
    expect(await screen.findByRole('heading', { name: 'DEVIS' })).toBeInTheDocument();
    expect(fetchPublicDocument).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText(/DV00012/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Travaux déjà effectués' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Travaux à prévoir' })).toBeInTheDocument();
    expect(screen.getByText('(remise 10 %)')).toBeInTheDocument();
    expect(screen.getByText('Délai : 48 h')).toBeInTheDocument();
    expect(screen.getByLabelText('Totaux')).toHaveTextContent(/Total TTC\s*464,40\s€/);
  });

  it('devis expiré : plus de signature en ligne, message au client', async () => {
    setup(quote({ valid_until: addDays(todayIso(), -1) }));
    expect(await screen.findByText(/Ce devis a expiré le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accepter/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Refuser/ })).toBeNull();
  });

  it('accepter demande le nom puis la signature', async () => {
    setup(quote());
    await userEvent.click(await screen.findByRole('button', { name: 'Accepter et signer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Merci d’indiquer votre nom.');
    await userEvent.type(screen.getByLabelText('Votre nom'), 'Jean Martin');
    await userEvent.click(screen.getByRole('button', { name: 'Accepter et signer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Merci de signer le devis');
    expect(respondToQuote).not.toHaveBeenCalled();
  });

  it('accord signé envoyé, puis confirmation affichée', async () => {
    pad.isEmpty = false;
    vi.mocked(respondToQuote).mockResolvedValue({ status: 'accepted' });
    setup(quote());
    await userEvent.type(await screen.findByLabelText('Votre nom'), '  Jean Martin ');
    vi.mocked(fetchPublicDocument).mockResolvedValue(
      quote({ status: 'accepted', accepted_by_name: 'Jean Martin' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Accepter et signer' }));
    await waitFor(() =>
      expect(respondToQuote).toHaveBeenCalledWith({
        token: TOKEN,
        accept: true,
        signer_name: 'Jean Martin',
        signature: 'data:image/png;base64,SIGNATURE',
      }),
    );
    expect(await screen.findByText(/Devis accepté par Jean Martin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accepter et signer' })).toBeNull();
  });

  it('refus après confirmation, sans signature', async () => {
    vi.mocked(respondToQuote).mockResolvedValue({ status: 'refused' });
    setup(quote());
    await userEvent.click(await screen.findByRole('button', { name: 'Refuser le devis' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Refuser le devis' }),
    );
    await waitFor(() =>
      expect(respondToQuote).toHaveBeenCalledWith({
        token: TOKEN,
        accept: false,
        signer_name: '',
        signature: null,
      }),
    );
  });

  it('erreur renvoyée par le serveur affichée au client', async () => {
    pad.isEmpty = false;
    vi.mocked(respondToQuote).mockRejectedValue(new Error('Ce devis a déjà reçu une réponse'));
    setup(quote());
    await userEvent.type(await screen.findByLabelText('Votre nom'), 'Jean');
    await userEvent.click(screen.getByRole('button', { name: 'Accepter et signer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce devis a déjà reçu une réponse');
  });

  it('devis déjà traité, en cours de modification, ou lien inconnu', async () => {
    const { unmount } = setup(quote({ status: 'refused' }));
    expect(await screen.findByText('Devis refusé.')).toBeInTheDocument();
    unmount();

    const second = setup(quote({ status: 'in_progress' }));
    expect(await screen.findByText(/en cours de modification par l’atelier/)).toBeInTheDocument();
    second.unmount();

    setup(null);
    expect(await screen.findByText('Ce document est introuvable ou le lien a expiré.')).toBeInTheDocument();
  });
});

describe('facture en ligne (client, sans compte)', () => {
  const invoice = (overrides: Partial<PublicInvoice> = {}): PublicInvoice => ({
    type: 'invoice',
    company: quote().company,
    number: 'F11887',
    issued_at: '2026-09-27T10:00:00Z',
    service_date: '2026-09-26',
    due_date: '2026-10-27',
    client_name: 'Transports Martin',
    client_address: '1 rue du Test, 95190 Goussainville',
    vehicle_label: 'GH-512-RT',
    mileage: 184320,
    lines: [
      {
        line_type: 'labor',
        description: 'Remplacement disques',
        unit_price: 90,
        quantity: 3,
        discount_percent: 0,
        vat_rate: 20,
        net_ht: 270,
      },
    ],
    totals: { total_ht: 270, total_vat: 54, total_ttc: 324 },
    balance_due: 124,
    legal_mentions: ['TVA sur les encaissements.'],
    ...overrides,
  });

  it('facture, reste dû, mentions légales, impression', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    setup(invoice());
    expect(await screen.findByRole('heading', { name: 'FACTURE' })).toBeInTheDocument();
    expect(screen.getByText(/F11887/)).toBeInTheDocument();
    expect(screen.getByText(/1 rue du Test/)).toBeInTheDocument();
    expect(
      screen.getByText(/Facture à régler avant le 27\/10\/2026 — reste dû : 124,00\s€/),
    ).toBeInTheDocument();
    expect(screen.getByText('TVA sur les encaissements.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accepter et signer' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Imprimer/ }));
    expect(print).toHaveBeenCalled();
  });

  it('facture soldée', async () => {
    setup(invoice({ balance_due: 0 }));
    expect(await screen.findByText(/Facture réglée/)).toBeInTheDocument();
  });
});
