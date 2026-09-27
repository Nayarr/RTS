import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  fetchMyNotifications,
  markNotificationsRead,
  subscribeToNotifications,
  type AppNotification,
} from './api';
import { AlertsBell } from './AlertsBell';

const live = vi.hoisted(() => ({ onInsert: null as null | (() => void) }));

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('./api', () => ({
  fetchMyNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  subscribeToNotifications: vi.fn((onInsert: () => void) => {
    live.onInsert = onInsert;
    return () => {};
  }),
}));

const notification = (overrides: Partial<AppNotification>): AppNotification =>
  ({
    id: 'n1',
    type: 'overdue_invoice',
    title: 'Facture en retard : F11890',
    body: 'Transports Martin — reste dû 324,00 € TTC',
    link: '/factures/i1',
    created_at: '2026-09-28T07:05:00Z',
    read_at: null,
    ...overrides,
  }) as AppNotification;

beforeEach(() => {
  vi.mocked(fetchProfile).mockResolvedValue({
    id: 'p1',
    email: 'direction@test.fr',
    full_name: 'Direction',
    role: 'direction',
    is_active: true,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  });
  vi.mocked(markNotificationsRead).mockResolvedValue(undefined);
});

const renderBell = () =>
  renderRoutes(
    [
      { path: '/', element: <AlertsBell /> },
      { path: '/factures/:id', element: <p>Fiche facture</p> },
    ],
    { auth: { session: fakeSession() } },
  );

describe('cloche des alertes', () => {
  it('nombre d’alertes non lues ; à l’ouverture elles sont marquées lues', async () => {
    vi.mocked(fetchMyNotifications).mockResolvedValue([
      notification({}),
      notification({ id: 'n2', title: 'Stock bas : AdBlue', body: null, link: null }),
      notification({ id: 'n3', title: 'Ancienne alerte', body: 'Déjà vue', read_at: '2026-09-27T10:00:00Z' }),
    ]);
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Alertes (2 non lues)' }));
    const dialog = screen.getByRole('dialog', { name: 'Alertes' });
    expect(within(dialog).getAllByText('Nouvelle')).toHaveLength(2);
    expect(within(dialog).getByText('Transports Martin — reste dû 324,00 € TTC')).toBeInTheDocument();
    expect(within(dialog).getAllByText('28/09/2026 09:05')).toHaveLength(3);
    await waitFor(() => expect(markNotificationsRead).toHaveBeenCalledWith(['n1', 'n2'], 'p1'));
  });

  it('une alerte ouvre l’écran concerné', async () => {
    vi.mocked(fetchMyNotifications).mockResolvedValue([notification({})]);
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Alertes (1 non lues)' }));
    await userEvent.click(screen.getByRole('button', { name: /Facture en retard : F11890/ }));
    expect(await screen.findByText('Fiche facture')).toBeInTheDocument();
  });

  it('nouvelle alerte reçue en direct', async () => {
    vi.mocked(fetchMyNotifications).mockResolvedValue([]);
    renderBell();
    expect(await screen.findByRole('button', { name: 'Alertes' })).toBeInTheDocument();
    await waitFor(() => expect(subscribeToNotifications).toHaveBeenCalled());
    vi.mocked(fetchMyNotifications).mockResolvedValue([notification({})]);
    live.onInsert?.();
    expect(await screen.findByRole('button', { name: 'Alertes (1 non lues)' })).toBeInTheDocument();
  });

  it('aucune alerte', async () => {
    vi.mocked(fetchMyNotifications).mockResolvedValue([]);
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Alertes' }));
    expect(screen.getByText('Aucune alerte.')).toBeInTheDocument();
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });
});
