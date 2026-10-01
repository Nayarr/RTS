import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { fetchRepairOrder, type RepairOrderOverview, type RoLine } from '@/features/repair-orders/api';
import type * as RoApi from '@/features/repair-orders/api';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  addLine,
  completeRepairOrder,
  fetchMyRepairOrders,
  fetchSeen,
  fetchVehicleDeadlines,
  markSeen,
  saveInspection,
  startTimer,
  updateLine,
} from './api';
import type * as WorkshopApi from './api';
import { TechHomePage } from './TechHomePage';
import { TechRepairOrderPage } from './TechRepairOrderPage';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('@/features/repair-orders/api', async (importOriginal) => ({
  ...(await importOriginal<typeof RoApi>()),
  fetchRepairOrder: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkshopApi>()),
  fetchMyRepairOrders: vi.fn(),
  fetchSeen: vi.fn(),
  fetchVehicleDeadlines: vi.fn(),
  markSeen: vi.fn(),
  saveInspection: vi.fn(),
  startTimer: vi.fn(),
  addLine: vi.fn(),
  updateLine: vi.fn(),
  completeRepairOrder: vi.fn(),
}));
// Congés du technicien (section de l'accueil) : aucun.
vi.mock('@/features/leave/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchLeaveRequests: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/files/hooks', () => ({ useFileUrls: () => ({ data: {}, isPending: false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const order = (overrides: Partial<RepairOrderOverview> = {}): RepairOrderOverview =>
  ({
    id: 'ro1',
    number: 'OR00001',
    status: 'assigned',
    vehicle_id: 'v1',
    vehicle_type: 'pl',
    plate: 'GH-512-RT',
    client_name: 'Transports Martin',
    requested_work: 'Bruit au freinage',
    created_at: '2026-09-27T08:00:00Z',
    updated_at: '2026-09-27T08:00:00Z',
    assignment_changed_at: '2026-09-27T08:00:00Z',
    worked_seconds: 0,
    running_since: null,
    declared_hours: 0,
    mileage: null,
    missing_photo_labels: ['Face avant', 'Côté gauche', 'Côté droit', 'Arrière', 'Tableau de bord'],
    planned_date: null,
    planned_start: null,
    ...overrides,
  }) as RepairOrderOverview;

const line = (overrides: Partial<RoLine>): RoLine =>
  ({
    id: 'l1',
    kind: 'done',
    line_type: 'labor',
    position: 0,
    description: 'Remplacement plaquettes',
    estimated_hours: null,
    estimate_is_minimum: false,
    standard_hours: null,
    quantity: 1,
    ...overrides,
  }) as RoLine;

const setup = (path: string, detail?: { order: RepairOrderOverview; lines?: RoLine[] }) => {
  vi.mocked(fetchProfile).mockResolvedValue({
    id: '00000000-0000-0000-0000-0000000000a1',
    email: 'alice@test.fr',
    full_name: 'Alice Martin',
    role: 'technician',
    is_active: true,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  });
  vi.mocked(fetchSeen).mockResolvedValue({});
  vi.mocked(markSeen).mockResolvedValue();
  vi.mocked(fetchVehicleDeadlines).mockResolvedValue({ ct_due_date: null, tailgate_due_date: null });
  if (detail) {
    vi.mocked(fetchRepairOrder).mockResolvedValue({
      order: detail.order,
      lines: detail.lines ?? [],
      photos: [],
      inspection: null,
      timeEntries: [],
    });
  }
  return renderRoutes(
    [
      { path: '/', element: <TechHomePage /> },
      { path: '/atelier/or/:id', element: <TechRepairOrderPage /> },
    ],
    { initialPath: path, auth: { session: fakeSession('alice@test.fr') } },
  );
};

describe('accueil technicien', () => {
  it('liste ses OR avec le badge « Nouveau »', async () => {
    vi.mocked(fetchMyRepairOrders).mockResolvedValue([order()]);
    setup('/');
    const card = await screen.findByRole('link', { name: /GH-512-RT/ });
    expect(within(card).getByText('Nouveau')).toBeInTheDocument();
    expect(card).toHaveAttribute('href', '/atelier/or/ro1');
  });
});

describe('fiche OR technicien', () => {
  it('badgeage bloqué tant que kilométrage et photos manquent ; marque l’OR comme vu', async () => {
    setup('/atelier/or/ro1', { order: order() });
    const start = await screen.findByRole('button', { name: /Démarrer le badgeage/ });
    expect(start).toBeDisabled();
    expect(screen.getByText(/renseigne le kilométrage et les photos/)).toBeInTheDocument();
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith('ro1', '00000000-0000-0000-0000-0000000000a1'));
  });

  it('démarre le badgeage une fois les prérequis remplis', async () => {
    vi.mocked(startTimer).mockResolvedValue();
    setup('/atelier/or/ro1', { order: order({ mileage: 184320, missing_photo_labels: [] }) });
    await userEvent.click(await screen.findByRole('button', { name: /Démarrer le badgeage/ }));
    expect(startTimer).toHaveBeenCalledWith('ro1');
  });

  it('hors connexion : le badgeage est refusé tout de suite (heure prise par le serveur)', async () => {
    setup('/atelier/or/ro1', { order: order({ mileage: 184320, missing_photo_labels: [] }) });
    const start = await screen.findByRole('button', { name: /Démarrer le badgeage/ });
    vi.mocked(startTimer).mockClear();
    onlineManager.setOnline(false);
    try {
      await userEvent.click(start);
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Hors connexion : le badgeage a besoin du réseau, réessaie dès qu’il revient',
        ),
      );
      expect(startTimer).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('fiche de contrôle : un choix est enregistré automatiquement', async () => {
    vi.mocked(saveInspection).mockResolvedValue();
    setup('/atelier/or/ro1', { order: order() });
    const row = await screen.findByRole('radiogroup', { name: 'Plaquettes avant' });
    await userEvent.click(within(row).getByRole('radio', { name: 'HS' }));
    expect(within(row).getByRole('radio', { name: 'HS' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() =>
      expect(saveInspection).toHaveBeenCalledWith('ro1', { usure: { plaquettes_avant: 'HS' } }),
    );
  });

  it('travaux : ajout d’une tâche et temps estimé', async () => {
    vi.mocked(addLine).mockResolvedValue(line({ id: 'l2' }));
    vi.mocked(updateLine).mockResolvedValue();
    setup('/atelier/or/ro1', { order: order(), lines: [line({})] });

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Temps estimé' }), '12h+');
    expect(updateLine).toHaveBeenCalledWith('l1', { estimated_hours: 12, estimate_is_minimum: true });

    const [addDone] = screen.getAllByRole('button', { name: /Ajouter une tâche/ });
    await userEvent.click(addDone!);
    expect(addLine).toHaveBeenCalledWith('ro1', 'done', 1);
  });

  it('travaux terminés : demande si un devis est nécessaire', async () => {
    vi.mocked(completeRepairOrder).mockResolvedValue();
    vi.mocked(fetchMyRepairOrders).mockResolvedValue([]);
    setup('/atelier/or/ro1', { order: order({ status: 'in_progress' }) });

    const finish = await screen.findByRole('button', { name: /Travaux terminés/ });
    expect(finish).toBeDisabled(); // réponse à « Devis nécessaire ? » obligatoire
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Devis nécessaire ?' })).getByRole('button', { name: 'OUI' }),
    );
    await userEvent.click(finish);
    await waitFor(() => expect(completeRepairOrder).toHaveBeenCalledWith('ro1', true));
    expect(await screen.findByRole('heading', { name: 'Mes ordres de réparation' })).toBeInTheDocument();
  });

  it('pièces prévues par le bureau : état de commande, sans prix ni édition', async () => {
    setup('/atelier/or/ro1', {
      order: order(),
      lines: [
        line({
          id: 'p1',
          line_type: 'part',
          description: 'Plaquettes avant',
          unit_price: 138,
          order_status: 'received',
        }),
      ],
    });
    const parts = (await screen.findByRole('heading', { name: 'Pièces' })).closest<HTMLElement>(
      '[data-slot="card"]',
    )!;
    expect(within(parts).getByText('Plaquettes avant')).toBeInTheDocument();
    expect(within(parts).getByText('Reçue')).toBeInTheDocument();
    expect(within(parts).queryByText(/138/)).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Description de la tâche' })).toBeNull();
  });

  it('OR terminé : consultation seulement', async () => {
    setup('/atelier/or/ro1', { order: order({ status: 'work_done' }), lines: [line({})] });
    expect(await screen.findByText('Cet OR est terminé : consultation seulement.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Démarrer le badgeage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Travaux terminés/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une tâche/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Description de la tâche' })).toBeDisabled();
  });
});
