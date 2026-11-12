import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFile } from '@/features/files/api';
import { fetchPublicDocument, type PublicSignature } from '@/features/public/api';
import type * as PublicApi from '@/features/public/api';
import { PublicDocumentPage } from '@/features/public/PublicDocumentPage';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { fetchSettings } from '@/features/settings/api';
import { renderRoutes } from '@/test/render';
import {
  fetchKioskPendingSignatures,
  fetchSignatureRequest,
  kioskSign,
  requestSignature,
  signOnline,
  type KioskSignatureRequest,
  type SignatureRequest,
} from './api';
import { remainingPercent, secondsLeft, signatureShareMessage } from './domain';
import { SignatureKioskPage } from './SignatureKioskPage';
import { SignatureRequestPanel } from './SignatureRequestPanel';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requestSignature: vi.fn(),
  cancelSignatureRequest: vi.fn(),
  fetchSignatureRequest: vi.fn(),
  fetchKioskPendingSignatures: vi.fn(),
  kioskSign: vi.fn(),
  signOnline: vi.fn(),
}));
vi.mock('@/features/public/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PublicApi>()),
  fetchPublicDocument: vi.fn(),
}));
vi.mock('@/features/files/api', () => ({ uploadFile: vi.fn() }));
vi.mock('@/features/settings/api', () => ({ fetchSettings: vi.fn() }));
vi.mock('@/features/documents/client-contact', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchClientContact: vi.fn().mockResolvedValue({ email: 'compta@dupont.fr', phone: '0612345678' }),
  updateClientContact: vi.fn(),
}));
// Borne de signature : plein écran et présence simulés, nom de l'atelier
vi.mock('@/features/kiosk/use-kiosk-mode', () => ({ useKioskMode: vi.fn() }));
vi.mock('@/features/kiosk/api', () => ({
  fetchCompanyName: vi.fn().mockResolvedValue('RAPID TRUCK SERVICE'),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Zone de signature simulée : le dessin au doigt n'existe pas dans jsdom.
vi.mock('@/components/use-signature-pad', () => ({
  useSignaturePad: () => ({
    canvasRef: { current: null },
    isEmpty: false,
    setIsEmpty: vi.fn(),
    clear: vi.fn(),
    toBlob: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
    toDataUrl: () => 'data:image/png;base64,SIGNATURE',
  }),
}));

const company = {
  legal_name: 'RAPID TRUCK SERVICE',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
  email: 'atelier@rapidtruckservice.fr',
  phone: null,
  siret: null,
};

const request = (overrides: Partial<SignatureRequest> = {}): SignatureRequest => ({
  id: 'sr1',
  channel: 'kiosk',
  status: 'pending',
  token: null,
  expires_at: '2026-10-02T08:01:00Z',
  seconds_left: 60,
  signer_name: null,
  signed_at: null,
  created_at: '2026-10-02T08:00:00Z',
  ...overrides,
});

const order = {
  id: 'ro1',
  number: 'OR00512',
  plate: 'GH-512-RT',
  client_id: 'c1',
  status: 'assigned',
} as RepairOrderOverview;

beforeEach(() => {
  vi.mocked(fetchSettings).mockResolvedValue({ company } as unknown as Awaited<
    ReturnType<typeof fetchSettings>
  >);
});

describe('signature : règles', () => {
  it('temps restant calculé depuis la valeur du serveur, barre proportionnelle', () => {
    expect(secondsLeft(60, 1_000, 11_000)).toBe(50);
    expect(secondsLeft(5, 0, 10_000)).toBe(0);
    expect([remainingPercent(60), remainingPercent(30), remainingPercent(-2)]).toEqual([100, 50, 0]);
  });

  it('message prêt à envoyer au client absent', () => {
    const message = signatureShareMessage(
      { number: 'OR00512', plate: 'GH-512-RT' },
      'https://x/d/t',
      company,
    );
    expect(message.subject).toBe('Ordre de réparation OR00512 à signer · RAPID TRUCK SERVICE');
    expect(message.body).toContain('https://x/d/t');
    expect(message.body).toContain('valable 7 jours');
    expect(message.sms).toContain('GH-512-RT');
  });
});

describe('signature : bureau', () => {
  const renderPanel = () =>
    renderRoutes([{ path: '/or/ro1', element: <SignatureRequestPanel order={order} /> }], {
      initialPath: '/or/ro1',
    });

  it('demande sur la borne : compte à rebours, puis signature reçue', async () => {
    vi.mocked(fetchSignatureRequest).mockResolvedValue(null);
    vi.mocked(requestSignature).mockResolvedValue(request({ seconds_left: 58 }));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Faire signer sur la borne' }));
    expect(requestSignature).toHaveBeenCalledWith('ro1', 'kiosk');
    expect(await screen.findByText(/En attente sur la borne… 5\d s/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler la demande' })).toBeInTheDocument();
  });

  it('pas signé dans la minute : relancer', async () => {
    vi.mocked(fetchSignatureRequest).mockResolvedValue(request({ status: 'expired', seconds_left: 0 }));
    renderPanel();
    expect(await screen.findByText('Pas signé sur la borne dans la minute.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relancer sur la borne' })).toBeInTheDocument();
  });

  it('client absent : lien de signature prêt à envoyer par e-mail', async () => {
    vi.mocked(fetchSignatureRequest).mockResolvedValue(null);
    vi.mocked(requestSignature).mockResolvedValue(
      request({ channel: 'email', token: 'b'.repeat(64), expires_at: '2026-10-09T08:00:00Z' }),
    );
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Demander par e-mail' }));
    const dialog = await screen.findByRole('dialog', { name: 'OR OR00512 : signature à distance' });
    expect(within(dialog).getByLabelText('Lien')).toHaveValue(
      `${window.location.origin}/d/${'b'.repeat(64)}`,
    );
    expect(within(dialog).getByLabelText('E-mail du client')).toHaveValue('compta@dupont.fr');
  });
});

describe('signature : borne de signature', () => {
  const pending: KioskSignatureRequest = {
    ...request({ seconds_left: 45 }),
    number: 'OR00512',
    vehicle_plate: 'GH-512-RT',
    client_name: 'Transports Dupont',
    requested_work: 'Freins avant\nVidange',
  };
  const renderKiosk = () => renderRoutes([{ path: '/', element: <SignatureKioskPage /> }]);
  /** Le client touche « Signer » sur son document : la fenêtre de signature s'ouvre. */
  const openSignature = async (name: string) => {
    await userEvent.click(await screen.findByRole('button', { name: `Signer : ${name}` }));
  };

  it('dépannage en zone 3 : lieu et forfait dans la fenêtre de signature', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([
      {
        ...pending,
        roadside: { address: 'Aire de Roissy', label: 'Forfait déplacement zone 3', price: 130 },
      },
    ]);
    renderKiosk();
    await openSignature('Ordre de réparation OR00512');
    const summary = await screen.findByRole('group', { name: 'Dépannage extérieur' });
    expect(summary).toHaveTextContent('Lieu d’intervention : Aire de Roissy');
    expect(summary).toHaveTextContent(/Forfait déplacement zone 3\s*130,00\s€ HT/);
  });

  it('OR à l’atelier : pas de lieu dans la fenêtre de signature', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([{ ...pending, roadside: null }]);
    renderKiosk();
    await openSignature('Ordre de réparation OR00512');
    await screen.findByRole('dialog');
    expect(screen.queryByRole('group', { name: 'Dépannage extérieur' })).toBeNull();
  });

  it('demande affichée avec le temps restant ; signature enregistrée puis merci', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([pending]);
    vi.mocked(uploadFile).mockResolvedValue('file1');
    vi.mocked(kioskSign).mockResolvedValue();
    renderKiosk();
    await openSignature('Ordre de réparation OR00512');

    const dialog = await screen.findByRole('dialog', { name: 'Signature de l’ordre de réparation OR00512' });
    expect(within(dialog).getByRole('timer')).toHaveAccessibleName(/Temps restant : 4\d secondes/);
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Freins avant', 'Vidange']);
    await userEvent.type(within(dialog).getByLabelText('Votre nom (facultatif)'), 'Paul Dupont');
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Valider ma signature' }));
    await waitFor(() => expect(kioskSign).toHaveBeenCalledWith('sr1', 'Paul Dupont', 'file1'));
    expect(uploadFile).toHaveBeenCalledWith(expect.any(Blob), {
      category: 'signature',
      name: 'signature-client.png',
    });
    expect(await screen.findByText('Merci, votre signature est enregistrée.')).toBeInTheDocument();
  });

  it('devis à signer : titre du devis, travaux et total TTC', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([
      {
        ...pending,
        kind: 'quote',
        number: 'DV00042',
        total_ttc: 1234.5,
        requested_work: 'Remplacement plaquettes',
      },
    ]);
    renderKiosk();
    await openSignature('Devis DV00042');
    const dialog = await screen.findByRole('dialog', { name: 'Signature du devis DV00042' });
    expect(
      within(dialog).getByText('En signant, vous acceptez ce devis et les travaux ci-dessous.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Remplacement plaquettes')).toBeInTheDocument();
    expect(within(dialog).getByText(/1\s234,50\s€/)).toBeInTheDocument();
  });

  it('rien à signer : écran d’attente, pas de fenêtre', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([]);
    renderKiosk();
    expect(await screen.findByText('Aucun document à signer pour le moment')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('signature : lien e-mail (page publique)', () => {
  const TOKEN = 'c'.repeat(64);
  const document = (overrides: Partial<PublicSignature> = {}): PublicSignature => ({
    type: 'signature',
    company,
    number: 'OR00512',
    status: 'pending',
    expires_at: '2026-10-09T08:00:00Z',
    signed_at: null,
    signer_name: null,
    client_name: 'Transports Dupont',
    vehicle_plate: 'GH-512-RT',
    requested_work: 'Freins avant',
    planned_date: null,
    mileage: null,
    ...overrides,
  });
  const setup = () =>
    renderRoutes([{ path: '/d/:token', element: <PublicDocumentPage /> }], { initialPath: `/d/${TOKEN}` });

  it('dépannage en zone 3 : lieu et forfait en haut du document', async () => {
    vi.mocked(fetchPublicDocument).mockResolvedValue(
      document({ roadside: { address: 'Aire de Roissy', label: 'Forfait déplacement zone 3', price: 130 } }),
    );
    setup();
    const summary = await screen.findByRole('group', { name: 'Dépannage extérieur' });
    expect(summary).toHaveTextContent('Lieu d’intervention : Aire de Roissy');
    expect(summary).toHaveTextContent(/Forfait déplacement zone 3\s*130,00\s€ HT/);
    // Avant les travaux demandés
    expect(
      summary.compareDocumentPosition(screen.getByText('Travaux demandés')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('le client absent signe en ligne, puis voit la confirmation', async () => {
    vi.mocked(fetchPublicDocument).mockResolvedValue(document());
    vi.mocked(signOnline).mockResolvedValue({ status: 'signed' });
    setup();
    expect(await screen.findByRole('heading', { name: 'ORDRE DE RÉPARATION' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Signer l’ordre de réparation' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Merci d’indiquer votre nom.');

    await userEvent.type(screen.getByLabelText('Votre nom'), ' Marie Dupont ');
    vi.mocked(fetchPublicDocument).mockResolvedValue(
      document({ status: 'signed', signer_name: 'Marie Dupont', signed_at: '2026-10-02T09:00:00Z' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Signer l’ordre de réparation' }));
    await waitFor(() =>
      expect(signOnline).toHaveBeenCalledWith({
        token: TOKEN,
        signer_name: 'Marie Dupont',
        signature: 'data:image/png;base64,SIGNATURE',
      }),
    );
    expect(await screen.findByText(/Signé par Marie Dupont le 02\/10\/2026/)).toBeInTheDocument();
  });

  it('lien expiré : plus de signature possible', async () => {
    vi.mocked(fetchPublicDocument).mockResolvedValue(document({ status: 'expired' }));
    setup();
    expect(await screen.findByText(/Ce lien de signature n’est plus valable/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Signer l’ordre de réparation' })).toBeNull();
  });
});
