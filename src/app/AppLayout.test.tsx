import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import type { Profile } from '@/features/auth/roles';
import { fakeSession, renderRoutes } from '@/test/render';
import { AppLayout } from './AppLayout';
import { activePath } from './nav';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
// Compteurs du menu : rien en attente.
vi.mock('@/features/dashboard/api', () => ({
  fetchOfficeDashboard: vi.fn().mockResolvedValue({
    repair_orders: {},
    parts_to_order: 0,
    quotes_awaiting_response: 0,
    quotes_to_convert: 0,
    overdue_invoices: { count: 2, balance_due: 100 },
    appointments_today: 0,
    reminders_to_send: 0,
    leave_requests: 0,
    workload: [],
  }),
}));

const profile = (role: Profile['role']): Profile => ({
  id: '00000000-0000-0000-0000-0000000000d1',
  email: 'direction@test.fr',
  full_name: 'Direction',
  role,
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
});

const routes = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <p>Accueil</p> },
      { path: '/equipe', element: <p>Écran Équipe</p> },
      { path: '/factures', element: <p>Écran Factures</p> },
    ],
  },
];

const menu = () => screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!;

describe('AppLayout', () => {
  it('la direction voit la partie Gestion ; le groupe se déplie sur ses écrans', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('direction'));
    renderRoutes(routes, { auth: { session: fakeSession() } });
    const group = await screen.findByRole('button', { name: 'Équipe' });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(group);
    expect(within(menu()).getByRole('link', { name: 'Comptes et rôles' })).toHaveAttribute('href', '/equipe');
  });

  it('la réception ne voit de la partie Gestion que les pneumatiques', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('reception'));
    renderRoutes(routes, { auth: { session: fakeSession() } });
    expect((await screen.findAllByText('Réception')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Équipe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Réglages' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stock' })).not.toBeInTheDocument();
    // Pneumatiques : une entrée du menu à part, sans sous-menu à déplier
    expect(within(menu()).getByRole('link', { name: 'Pneumatiques' })).toHaveAttribute(
      'href',
      '/stock/pneumatiques',
    );
    expect(within(menu()).queryByRole('link', { name: 'Pièces' })).not.toBeInTheDocument();
    // Agent Direction en lecture seule (mails seulement) ; les mails reçus restent à la direction
    expect(within(menu()).getByRole('link', { name: /Agent Direction/ })).toHaveAttribute(
      'href',
      '/agent-direction',
    );
    expect(within(menu()).queryByRole('link', { name: 'Mails reçus' })).not.toBeInTheDocument();
  });

  it('direction : les pneumatiques au même niveau que Stock et Pilotage', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('direction'));
    renderRoutes(routes, { auth: { session: fakeSession() } });
    expect(await within(menu()).findByRole('link', { name: 'Pneumatiques' })).toHaveAttribute(
      'href',
      '/stock/pneumatiques',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stock' }));
    expect(within(menu()).getByRole('link', { name: 'Pièces' })).toBeInTheDocument();
    expect(within(menu()).getAllByRole('link', { name: 'Pneumatiques' })).toHaveLength(1);
  });

  it('écran ouvert : son groupe est déplié et l’entrée marquée, avec le compteur en attente', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('reception'));
    renderRoutes(routes, { auth: { session: fakeSession() }, initialPath: '/factures' });
    const link = await within(menu()).findByRole('link', { name: /Factures/ });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(await within(link).findByText('2')).toBeInTheDocument();
  });
});

describe('activePath', () => {
  it('retient l’entrée la plus précise', () => {
    expect(activePath('/')).toBe('/');
    expect(activePath('/or/123')).toBe('/or');
    expect(activePath('/vehicules/echeances')).toBe('/vehicules/echeances');
    expect(activePath('/vehicules/abc')).toBe('/vehicules');
    expect(activePath('/factures/avoirs')).toBe('/factures/avoirs');
    expect(activePath('/pointages/conges')).toBe('/pointages/conges');
    expect(activePath('/inconnu')).toBeNull();
  });
});
