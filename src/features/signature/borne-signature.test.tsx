import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { fetchKioskPendingSignatures, type KioskSignatureRequest } from './api';
import { SignatureKioskPage } from './SignatureKioskPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchKioskPendingSignatures: vi.fn(),
  kioskSign: vi.fn(),
}));
vi.mock('@/features/files/api', () => ({ uploadFile: vi.fn() }));
vi.mock('@/features/kiosk/use-kiosk-mode', () => ({ useKioskMode: vi.fn() }));
vi.mock('@/features/kiosk/api', () => ({
  fetchCompanyName: vi.fn().mockResolvedValue('RAPID TRUCK SERVICE'),
}));
vi.mock('@/components/use-signature-pad', () => ({
  useSignaturePad: () => ({
    canvasRef: { current: null },
    isEmpty: true,
    setIsEmpty: vi.fn(),
    clear: vi.fn(),
    toBlob: vi.fn(),
    toDataUrl: () => '',
  }),
}));

const request = (overrides: Partial<KioskSignatureRequest>): KioskSignatureRequest => ({
  id: 'sr1',
  channel: 'kiosk',
  status: 'pending',
  token: null,
  expires_at: '2026-11-11T10:01:00Z',
  seconds_left: 50,
  signer_name: null,
  signed_at: null,
  created_at: '2026-11-11T10:00:00Z',
  kind: 'repair_order',
  number: 'OR00512',
  vehicle_plate: 'GH-512-RT',
  client_name: 'Transports Dupont',
  requested_work: 'Freins avant',
  roadside: null,
  ...overrides,
});

const renderKiosk = () => renderRoutes([{ path: '/', element: <SignatureKioskPage /> }]);

describe('borne de signature', () => {
  it('deux clients au comptoir : deux documents à signer, chacun avec son temps restant', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([
      request({}),
      request({
        id: 'sr2',
        kind: 'quote',
        number: 'DV00025',
        vehicle_plate: 'AB-123-CD',
        client_name: 'Logistique Martin',
        total_ttc: 2184,
        seconds_left: 20,
      }),
    ]);
    renderKiosk();
    const list = await screen.findByRole('list', { name: 'Documents à signer' });
    const cards = within(list).getAllByRole('listitem', { name: /^(Ordre de réparation|Devis) / });
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Ordre de réparation OR00512',
      'Devis DV00025',
    ]);
    expect(within(cards[1]!).getByText(/2\s184,00\s€/)).toBeInTheDocument();
    // Sous 30 s : le compte à rebours passe en orange
    expect(within(cards[1]!).getByText(/Disparaît dans \d+ s/)).toHaveClass('text-warning');
    expect(within(cards[0]!).getByText(/Disparaît dans \d+ s/)).not.toHaveClass('text-warning');
  });

  it('« Signer » ouvre la signature ; « Retour à la liste » la referme', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([request({})]);
    renderKiosk();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Signer : Ordre de réparation OR00512' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Signature de l’ordre de réparation OR00512' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retour à la liste' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Signer : Ordre de réparation OR00512' })).toBeInTheDocument();
  });

  it('minute écoulée : la demande n’est plus proposée', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([request({ seconds_left: 0 })]);
    renderKiosk();
    await screen.findByRole('list', { name: 'Documents à signer' });
    expect(screen.queryByRole('button', { name: /^Signer/ })).toBeNull();
  });

  it('pas de bouton de télé pour quitter la borne de signature', async () => {
    vi.mocked(fetchKioskPendingSignatures).mockResolvedValue([]);
    renderKiosk();
    await userEvent.click(await screen.findByRole('button', { name: 'Quitter la borne' }));
    const dialog = screen.getByRole('dialog', { name: 'Quitter la borne' });
    expect(within(dialog).queryByRole('button', { name: 'Écran atelier (télé)' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Quitter' })).toBeInTheDocument();
  });
});
