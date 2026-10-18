import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchMailSettings, sendMail } from '@/lib/mail';
import type * as MailLib from '@/lib/mail';
import { renderRoutes } from '@/test/render';
import {
  fetchCompany,
  fetchLastQuoteRequest,
  fetchSuppliers,
  fetchTireKpis,
  fetchTireLines,
  fetchTireLots,
  saveQuoteRequest,
  saveSupplier,
  type TireLine,
} from './api';
import type * as TiresApi from './api';
import { TiresPage } from './TiresPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TiresApi>()),
  fetchTireLines: vi.fn(),
  fetchTireLots: vi.fn(),
  fetchTireKpis: vi.fn(),
  fetchSuppliers: vi.fn(),
  fetchCompany: vi.fn(),
  fetchLastQuoteRequest: vi.fn(),
  saveQuoteRequest: vi.fn(),
  saveSupplier: vi.fn(),
}));
vi.mock('@/lib/mail', async (importOriginal) => ({
  ...(await importOriginal<typeof MailLib>()),
  fetchMailSettings: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const line = (overrides: Partial<TireLine>): TireLine => ({
  id: 'l1',
  category: 'pl',
  size: '315/80 R22.5',
  profile: 'arriere',
  min_qty: 6,
  stock_qty: 3,
  reserved_qty: 1,
  available_qty: 2,
  missing_qty: 4,
  status: 'to_order',
  lots_count: 1,
  brands: 'Michelin 3',
  avg_purchase_price: 328,
  sold_30d: 14,
  ...overrides,
});

const setup = (mailEnabled: boolean) => {
  vi.mocked(fetchTireLines).mockResolvedValue([
    line({}),
    line({
      id: 'l2',
      category: 'vul',
      size: '235/65 R16C',
      profile: 'toutes',
      missing_qty: 4,
      status: 'out',
    }),
    line({ id: 'l3', profile: 'avant', missing_qty: 0, status: 'ok' }),
  ]);
  vi.mocked(fetchTireLots).mockResolvedValue([]);
  vi.mocked(fetchTireKpis).mockResolvedValue({
    stock_qty: 3,
    sizes: 1,
    lots: 1,
    to_order: 1,
    out: 1,
    sold_30d: 0,
    sold_prev_30d: 0,
    revenue_30d: 0,
    margin_30d: 0,
    margin_percent: null,
  });
  vi.mocked(fetchSuppliers).mockResolvedValue([
    { id: 's1', name: 'Euromaster', email: 'commandes@euromaster.test', phone: null },
    { id: 's2', name: 'Vulco', email: 'pneus@vulco.test', phone: null },
    { id: 's3', name: 'Bridgestone Pro', email: null, phone: null },
  ]);
  vi.mocked(fetchCompany).mockResolvedValue({
    name: 'Rapid Truck Service',
    address: '19 rue Gaston Monmousseau',
  });
  vi.mocked(fetchLastQuoteRequest).mockResolvedValue(null);
  vi.mocked(fetchMailSettings).mockResolvedValue({
    enabled: mailEnabled,
    domain: 'rapidtruckservice.fr',
    locals: { billing: 'facturation', workshop: 'atelier', signature: 'signature' },
    companyName: 'Rapid Truck Service',
    companyEmail: null,
  });
  return renderRoutes([{ path: '/stock/pneumatiques', element: <TiresPage /> }], {
    initialPath: '/stock/pneumatiques',
  });
};

describe('demande de chiffrage', () => {
  it('tailles sous le seuil reprises, un envoi par fournisseur, demande gardée', async () => {
    vi.mocked(sendMail).mockResolvedValue({ id: 'm1' });
    vi.mocked(saveQuoteRequest).mockResolvedValue();
    setup(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Demander un chiffrage (2)' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('row', { name: '315/80 R22.5 arrière' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('row', { name: '315/80 R22.5 avant' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Bridgestone Pro' })).toBeNull();

    const quantity = within(dialog).getByLabelText('Quantité 315/80 R22.5 arrière');
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '6');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Euromaster' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Vulco' }));
    const preview = within(dialog).getByRole('region', { name: 'Aperçu du mail' });
    expect(preview).toHaveTextContent('commandes@euromaster.test, pneus@vulco.test (envoi séparé)');
    expect(preview).toHaveTextContent('atelier@rapidtruckservice.fr');
    expect(preview).toHaveTextContent('• 315/80 R22.5, profil arrière : 6 pneus • 235/65 R16C : 4 pneus');
    expect(preview).not.toHaveTextContent('Michelin');

    await userEvent.click(within(dialog).getByRole('button', { name: /Envoyer aux 2 fournisseurs/ }));
    await waitFor(() => expect(saveQuoteRequest).toHaveBeenCalled());
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendMail).mock.calls.map(([input]) => input.to)).toEqual([
      'commandes@euromaster.test',
      'pneus@vulco.test',
    ]);
    expect(saveQuoteRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        recipients: ['commandes@euromaster.test', 'pneus@vulco.test'],
        lines: [
          { size: '315/80 R22.5', profile: 'arriere', quantity: 6 },
          { size: '235/65 R16C', profile: 'toutes', quantity: 4 },
        ],
      }),
    );
  });

  it('sans envoi par l’appli : messagerie de l’ordinateur, fournisseurs en copie cachée', async () => {
    setup(false);
    await userEvent.click(await screen.findByRole('button', { name: /Demander un chiffrage/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Autre adresse' }));
    await userEvent.type(within(dialog).getByLabelText('Autre adresse'), 'pneus@autre.test{Enter}');
    const link = within(dialog).getByRole('link', { name: /Ouvrir la messagerie/ });
    expect(link.getAttribute('href')).toMatch(/^mailto:\?bcc=pneus%40autre\.test&subject=/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('fournisseurs : e-mail des commandes enregistré', async () => {
    vi.mocked(saveSupplier).mockResolvedValue();
    setup(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Fournisseurs' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Modifier Bridgestone Pro' }));
    const form = within(dialog).getByRole('form', { name: 'Modifier Bridgestone Pro' });
    await userEvent.type(within(form).getByLabelText('E-mail des commandes'), 'pro@bridgestone.test');
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer le fournisseur' }));
    await waitFor(() =>
      expect(saveSupplier).toHaveBeenCalledWith('s3', {
        name: 'Bridgestone Pro',
        email: 'pro@bridgestone.test',
        phone: null,
      }),
    );
  });
});
