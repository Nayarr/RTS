import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import {
  fetchRepairOrder,
  type RepairOrderOverview,
  type RoLine,
  type RoPhoto,
} from '@/features/repair-orders/api';
import type { InspectionData } from '@/features/repair-orders/inspection';
import type * as RoApi from '@/features/repair-orders/api';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  addLine,
  completeRepairOrder,
  deleteLine,
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
  deleteLine: vi.fn(),
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
    estimate_locked: false,
    source_quote_line_id: null,
    ...overrides,
  }) as RoLine;

const setup = (
  path: string,
  detail?: { order: RepairOrderOverview; lines?: RoLine[]; inspection?: InspectionData; photos?: string[] },
) => {
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
      photos: (detail.photos ?? []).map((label, index) => ({ id: `p${index}`, label }) as RoPhoto),
      inspection: detail.inspection ?? null,
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

  it('journée : OR reportés, puis du jour par heure, puis flexibles ; ceux prévus plus tard masqués', async () => {
    const day = (offset: number) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    };
    vi.mocked(fetchMyRepairOrders).mockResolvedValue([
      order({ id: 'later', plate: 'TO-MO-RW', planned_date: day(1), planned_start: '08:00:00' }),
      order({ id: 'at14', plate: 'AA-140-PM', planned_date: day(0), planned_start: '14:00:00' }),
      order({ id: 'flex', plate: 'FL-EX-00', planned_date: day(0) }),
      order({
        id: 'at8',
        plate: 'AA-080-AM',
        planned_date: day(0),
        planned_start: '08:00:00',
        planned_end: '10:00:00',
      }),
      order({ id: 'late', plate: 'LA-TE-01', planned_date: day(-1), planned_start: '15:00:00' }),
    ]);
    setup('/');

    const plates = async (name: RegExp) =>
      within(await screen.findByRole('region', { name }))
        .getAllByRole('link')
        .map((link) => within(link).getByText(/^[A-Z0-9-]+$/).textContent);
    expect(await plates(/À terminer/)).toEqual(['LA-TE-01']);
    expect(await plates(/Aujourd’hui/)).toEqual(['AA-080-AM', 'AA-140-PM']);
    expect(await plates(/Flexible/)).toEqual(['FL-EX-00']);
    expect(screen.queryByText('TO-MO-RW')).toBeNull();
    expect(screen.getByText(/prévu 08:00 → 10:00/)).toBeInTheDocument();
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

  it('OR issu d’un devis : temps fixé (sauf extincteurs), travail non fait retiré après confirmation', async () => {
    vi.mocked(deleteLine).mockResolvedValue();
    setup('/atelier/or/ro1', {
      order: order({ status: 'in_progress' }),
      lines: [
        line({
          id: 'q1',
          line_type: 'package',
          description: 'Forfait vidange PL',
          estimated_hours: 1.5,
          estimate_locked: true,
          source_quote_line_id: 'ql1',
        }),
        line({
          id: 'q2',
          position: 1,
          description: 'Remplacement Extincteur 6 kg camion',
          estimated_hours: 0.3,
          source_quote_line_id: 'ql2',
        }),
      ],
    });

    const done = (await screen.findByRole('heading', { name: 'Travaux effectués' })).closest<HTMLElement>(
      '[data-slot="card"]',
    )!;
    const [locked, adjustable] = within(done).getAllByRole('combobox', { name: 'Temps estimé' });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAccessibleDescription('Temps fixé par le devis');
    expect(adjustable).toBeEnabled();

    // Le forfait finalement non fait se retire, après confirmation
    const [removePackage] = within(done).getAllByRole('button', { name: 'Supprimer la tâche' });
    await userEvent.click(removePackage!);
    const confirm = screen.getByRole('dialog', { name: 'Retirer ce travail ?' });
    expect(confirm).toHaveTextContent('« vidange PL » n’a finalement pas été fait');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(deleteLine).toHaveBeenCalledWith('q1'));
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

  it('travaux terminés : ce qu’il reste à compléter est listé, le bouton attend', async () => {
    vi.mocked(fetchMyRepairOrders).mockResolvedValue([]);
    setup('/atelier/or/ro1', {
      order: order({ status: 'in_progress' }),
      lines: [line({}), line({ id: 'l2', kind: 'planned', description: 'Remplacement plaquettes' })],
      inspection: { pneus: { avant_etat: 'HS' }, controles: { hayon: 'HS' } },
      photos: ['Extincteur 1 kg cabine'],
    });

    const blockers = await screen.findByRole('status', { name: 'À compléter avant de terminer' });
    expect(
      within(blockers)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Temps estimé manquant : 1 tâche des travaux effectués',
      'Temps estimé manquant : 1 tâche à prévoir',
      'Taille des pneus avant obligatoire (HS)',
      'Photo de l’étiquette contrôle hayon obligatoire (HS)',
    ]);
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Devis nécessaire ?' })).getByRole('button', { name: 'NON' }),
    );
    expect(screen.getByRole('button', { name: /Travaux terminés/ })).toBeDisabled();

    // Signalé à l'endroit à corriger
    expect(screen.getByRole('textbox', { name: 'Taille pneus avant' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText('Taille obligatoire : pneus à HS.')).toBeInTheDocument();
    expect(screen.getByText('Étiquette HS : photo obligatoire avant de terminer l’OR.')).toBeInTheDocument();
    // Photo de l'étiquette : simple icône, sur la ligne OK / HS (angles morts compris)
    for (const label of ['Étiquettes angles morts', 'Étiquette contrôle hayon', 'Extincteur 6 kg camion']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^Photo de l’étiquette « ${label} »`) }),
      ).toHaveTextContent('');
    }
    expect(
      screen.getByRole('button', { name: 'Photo de l’étiquette « Extincteur 1 kg cabine » (déjà prise)' }),
    ).toBeInTheDocument();
    // 0,5 h proposé dans la liste des temps
    expect(screen.getAllByRole('option', { name: '0,5 h' }).length).toBeGreaterThan(0);
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
