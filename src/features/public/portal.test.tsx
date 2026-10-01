import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '@/features/planning/domain';
import { todayIso } from '@/features/repair-orders/schemas';
import { renderRoutes } from '@/test/render';
import { fetchPublicDocument, type PublicPortal } from './api';
import type * as PublicApi from './api';
import { PublicDocumentPage } from './PublicDocumentPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PublicApi>()),
  fetchPublicDocument: vi.fn(),
}));

const PORTAL_TOKEN = 'p'.repeat(40);
const QUOTE_TOKEN = 'q'.repeat(40);
const INVOICE_TOKEN = 'i'.repeat(40);

const portal: PublicPortal = {
  type: 'portal',
  company: {
    legal_name: 'RAPID TRUCK SERVICE',
    address_line: '19 rue Gaston Monmousseau',
    postal_code: '95190',
    city: 'Goussainville',
    email: 'atelier@rapidtruckservice.fr',
    phone: '01 23 45 67 89',
    siret: null,
  },
  client_name: 'Transports Dupont',
  generated_at: '2026-09-29T08:30:00Z',
  vehicles: [
    {
      plate: 'AB-123-CD',
      in_workshop: true,
      status_label: 'En cours',
      since: '2026-09-27T08:00:00Z',
      ct_due_date: addDays(todayIso(), -3),
      tailgate_due_date: null,
    },
    {
      plate: 'EF-456-GH',
      in_workshop: false,
      status_label: 'Pas à l’atelier',
      since: null,
      ct_due_date: addDays(todayIso(), 200),
      tailgate_due_date: addDays(todayIso(), 10),
    },
  ],
  quotes: [{ number: 'DV00012', vehicle_plate: 'AB-123-CD', token: QUOTE_TOKEN }],
  invoices: [
    {
      number: 'F11890',
      issued_at: '2026-09-20T10:00:00Z',
      vehicle_label: 'AB-123-CD',
      total_ttc: 1200,
      balance_due: 1200,
      payment_status: 'overdue',
      token: INVOICE_TOKEN,
    },
  ],
};

beforeEach(() => {
  vi.mocked(fetchPublicDocument).mockImplementation((token) =>
    Promise.resolve(token === PORTAL_TOKEN ? portal : null),
  );
});

const renderPortal = () =>
  renderRoutes([{ path: '/d/:token', element: <PublicDocumentPage /> }], {
    initialPath: `/d/${PORTAL_TOKEN}`,
  });

describe('espace client en ligne', () => {
  it('véhicules à l’atelier et échéances colorées', async () => {
    renderPortal();
    expect(await screen.findByRole('heading', { name: 'Bonjour' })).toBeInTheDocument();
    expect(screen.getByText('Espace client')).toBeInTheDocument();
    expect(screen.getByText('Transports Dupont')).toBeInTheDocument();
    const first = screen.getByRole('listitem', { name: 'AB-123-CD' });
    expect(first).toHaveTextContent('À l’atelier — En cours depuis le 27/09/2026');
    // Échéance dépassée ou proche : pastille ; sinon simple texte coloré
    expect(within(first).getByText(/^Contrôle technique/)).toHaveClass('s-bad');
    const second = screen.getByRole('listitem', { name: 'EF-456-GH' });
    expect(second).toHaveTextContent('Pas à l’atelier');
    expect(within(second).getByText(/^Contrôle technique/)).toHaveClass('text-success');
    expect(within(second).getByText(/^Contrôle hayon/)).toHaveClass('s-warn');
  });

  it('devis à signer et factures : liens vers chaque document', async () => {
    renderPortal();
    const quote = await screen.findByRole('link', { name: /Devis DV00012 à valider.*AB-123-CD/ });
    expect(quote).toHaveAttribute('href', `/d/${QUOTE_TOKEN}`);
    const invoice = screen.getByRole('row', { name: /F11890/ });
    expect(invoice).toHaveTextContent(/20\/09\/2026\s*AB-123-CD\s*1\s200,00\s€\s*1\s200,00\s€\s*En retard/);
    expect(screen.getByText(/Contactez l’atelier RAPID TRUCK SERVICE/)).toHaveTextContent('01 23 45 67 89');
    await userEvent.click(within(invoice).getByRole('link', { name: 'F11890' }));
    expect(fetchPublicDocument).toHaveBeenLastCalledWith(INVOICE_TOKEN);
  });
});
