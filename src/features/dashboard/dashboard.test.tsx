import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import type { Profile } from '@/features/auth/roles';
import { fakeSession, renderRoutes } from '@/test/render';
import { fetchOfficeDashboard, type OfficeDashboard } from './api';
import { OfficeDashboardPage } from './OfficeDashboardPage';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('./api', () => ({ fetchOfficeDashboard: vi.fn() }));

const DASHBOARD: OfficeDashboard = {
  repair_orders: { assigned: 3, in_progress: 2, to_invoice: 1 },
  parts_to_order: 4,
  quotes_awaiting_response: 2,
  quotes_to_convert: 1,
  overdue_invoices: { count: 2, balance_due: 1250.5 },
  appointments_today: 3,
  reminders_to_send: 0,
  leave_requests: 1,
  workload: [
    { technician_id: 't1', name: 'Alice', color: '#2A6B52', orders: 3, hours: 7.5 },
    { technician_id: 't2', name: 'Bruno', color: null, orders: 0, hours: 0 },
  ],
};

const profile = (role: Profile['role']): Profile => ({
  id: 'p1',
  email: 'reception@test.fr',
  full_name: 'Réception RTS',
  role,
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
});

const renderPage = (role: Profile['role']) => {
  vi.mocked(fetchProfile).mockResolvedValue(profile(role));
  return renderRoutes([{ path: '/', element: <OfficeDashboardPage /> }], {
    auth: { session: fakeSession() },
  });
};

const tile = (section: HTMLElement, label: string | RegExp) =>
  within(section).getByRole('link', { name: typeof label === 'string' ? new RegExp(label) : label });

beforeEach(() => vi.mocked(fetchOfficeDashboard).mockResolvedValue(DASHBOARD));

describe('tableau de bord du bureau', () => {
  it('OR par statut et pièces à commander, avec liens vers la liste filtrée', async () => {
    renderPage('reception');
    const orders = await screen.findByRole('region', { name: 'Ordres de réparation' });
    expect(tile(orders, 'Assigné')).toHaveAttribute('href', '/or?filtre=assigned');
    expect(tile(orders, 'Assigné')).toHaveTextContent('3');
    expect(tile(orders, 'Terminé atelier')).toHaveTextContent('0');
    expect(tile(orders, 'Pièces à commander')).toHaveAttribute('href', '/or?filtre=parts');
    expect(within(orders).queryByRole('link', { name: /Facturé/ })).toBeNull();
  });

  it('à suivre : devis, factures en retard, rendez-vous ; congés pour la direction seulement', async () => {
    renderPage('reception');
    const todo = await screen.findByRole('region', { name: 'À suivre' });
    expect(tile(todo, 'Devis acceptés à transformer en OR')).toHaveAttribute(
      'href',
      '/devis?filtre=accepted',
    );
    expect(tile(todo, /Factures en retard/)).toHaveTextContent(/^2Factures en retard \(1\s250,50\s€\)$/);
    expect(tile(todo, 'Rendez-vous aujourd’hui')).toHaveAttribute('href', '/planning?vue=jour');
    expect(within(todo).queryByRole('link', { name: /congé/ })).toBeNull();
  });

  it('la direction voit les demandes de congé', async () => {
    renderPage('direction');
    const todo = await screen.findByRole('region', { name: 'À suivre' });
    expect(tile(todo, 'Demandes de congé à traiter')).toHaveAttribute('href', '/pointages/conges');
  });

  it('charge de travail par technicien', async () => {
    renderPage('reception');
    const workload = await screen.findByRole('region', { name: 'Charge de travail atelier' });
    expect(workload).toHaveTextContent('7,5 h déclarées · 6 OR en cours');
    expect(
      within(workload)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['7,5 hAlice (3 OR)', '0 hBruno (0 OR)']);
  });
});
