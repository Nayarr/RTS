import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { createClient } from '@/features/customers/api';
import { fetchActiveTechnicians, findClientByName, updateRepairOrder } from '@/features/repair-orders/api';
import type * as RepairOrdersApi from '@/features/repair-orders/api';
import { todayIso } from '@/features/repair-orders/schemas';
import { fetchSettings, type Settings } from '@/features/settings/api';
import type * as SettingsApi from '@/features/settings/api';
import { renderRoutes } from '@/test/render';
import {
  cancelAppointment,
  confirmAppointmentRequest,
  convertAppointment,
  fetchPlannableOrders,
  fetchPlanning,
  fetchUpcomingAppointments,
  markAppointmentReminded,
  saveAppointment,
  type Appointment,
  type PlanningData,
} from './api';
import type * as PlanningApi from './api';
import { AppointmentsPage } from './AppointmentsPage';
import {
  addDays,
  appointmentReminderMessage,
  eventSpan,
  layoutDayEvents,
  lunchBreak,
  needsReminder,
  periodDays,
  periodLabel,
  planningMechanics,
  restingGroup,
  technicianColor,
  technicianOffLabel,
} from './domain';
import { PlanningPage } from './PlanningPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlanningApi>()),
  fetchPlanning: vi.fn(),
  fetchUpcomingAppointments: vi.fn(),
  fetchPlannableOrders: vi.fn(),
  saveAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  confirmAppointmentRequest: vi.fn(),
  markAppointmentReminded: vi.fn(),
  convertAppointment: vi.fn(),
}));
vi.mock('@/features/repair-orders/api', async (importOriginal) => ({
  ...(await importOriginal<typeof RepairOrdersApi>()),
  fetchActiveTechnicians: vi.fn(),
  updateRepairOrder: vi.fn(),
  searchClients: vi.fn().mockResolvedValue([]),
  findClientByName: vi.fn().mockResolvedValue({ id: 'c1', name: 'Transports Martin' }),
  findVehicleByPlate: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/features/customers/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createClient: vi.fn().mockResolvedValue('c9'),
}));
vi.mock('@/features/settings/api', async (importOriginal) => ({
  ...(await importOriginal<typeof SettingsApi>()),
  fetchSettings: vi.fn(),
}));
vi.mock('@/features/documents/client-contact', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchClientContact: vi.fn().mockResolvedValue({ email: 'contact@martin.fr', phone: null }),
  updateClientContact: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const HOURS = {
  workday_start: '09:00:00',
  workday_end: '18:00:00',
  lunch_start: '13:00:00',
  lunch_end: '14:00:00',
  friday_lunch_start: '12:30:00',
};

const COMPANY = {
  legal_name: 'RAPID TRUCK SERVICE',
  address_line: '19 rue Gaston Monmousseau',
  postal_code: '95190',
  city: 'Goussainville',
  email: 'atelier@rapidtruckservice.fr',
};

const TECHNICIANS = [
  { id: 't1', display_name: 'Alice', color: '#2A6B52', rest_group: 'A' as const },
  { id: 't2', display_name: 'Bruno', color: null, rest_group: 'B' as const },
];

const order = (overrides: Partial<RepairOrderOverview> = {}) =>
  ({
    id: 'ro1',
    number: 'OR00012',
    status: 'assigned',
    plate: 'GH-512-RT',
    client_name: 'Transports Martin',
    technician_id: 't1',
    technician_name: 'Alice',
    technician_color: '#2A6B52',
    planned_date: '2026-10-06',
    planned_start: '10:00:00',
    planned_end: '12:00:00',
    declared_hours: 3,
    ...overrides,
  }) as RepairOrderOverview;

const appointment = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'a1',
    status: 'planned',
    client_id: 'c1',
    client_name: 'Logistique Durand',
    vehicle_id: 'v1',
    plate: 'AB-123-CD',
    vehicle_type: 'pl',
    scheduled_date: '2026-10-07',
    start_time: '09:00:00',
    end_time: '10:00:00',
    reason: 'Vidange',
    technician_id: null,
    technician_name: null,
    reminder_sent_at: null,
    ...overrides,
  }) as Appointment;

const planning = (overrides: Partial<PlanningData> = {}): PlanningData => ({
  orders: [order()],
  untimedOrders: [],
  appointments: [appointment()],
  technicians: TECHNICIANS,
  leaves: [{ technician_id: 't2', leave_type: 'paid_leave', starts_on: '2026-10-06', ends_on: '2026-10-06' }],
  hours: HOURS,
  restReferenceMonday: '2026-10-05',
  ...overrides,
});

beforeEach(() => {
  vi.mocked(fetchPlanning).mockResolvedValue(planning());
  vi.mocked(fetchActiveTechnicians).mockResolvedValue(TECHNICIANS);
  vi.mocked(fetchPlannableOrders).mockResolvedValue([
    { id: 'ro1', number: 'OR00012', plate: 'GH-512-RT', client_name: 'Transports Martin' },
  ]);
  vi.mocked(fetchSettings).mockResolvedValue({ company: COMPANY } as unknown as Settings);
});

const renderPlanning = (search = '?vue=semaine&date=2026-10-07') =>
  renderRoutes(
    [
      { path: '/planning', element: <PlanningPage /> },
      { path: '/or/:id', element: <p>Fiche OR</p> },
    ],
    { initialPath: `/planning${search}` },
  );

// ---------------------------------------------------------------- Règles

describe('planning : règles', () => {
  it('semaine du lundi au dimanche, libellés', () => {
    const days = periodDays('semaine', '2026-10-07');
    expect(days).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(periodLabel('semaine', days)).toBe('Semaine du 05/10 au 11/10');
    expect(periodLabel('jour', ['2026-10-09'])).toBe('Vendredi 09/10');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('pause déjeuner plus tôt le vendredi', () => {
    expect(lunchBreak('2026-10-08', HOURS)).toEqual([13 * 60, 14 * 60]);
    expect(lunchBreak('2026-10-09', HOURS)).toEqual([12 * 60 + 30, 14 * 60]);
  });

  it('bloc d’une heure sans heure de fin ; blocs qui se chevauchent côte à côte', () => {
    expect(eventSpan('09:30:00', null)).toEqual({ start: 570, end: 630 });
    expect(eventSpan(null, null)).toBeNull();
    const laid = layoutDayEvents([
      { start: 540, end: 660 },
      { start: 600, end: 700 },
      { start: 800, end: 860 },
    ]);
    expect(laid.map(({ column, columns }) => [column, columns])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });

  it('repos un lundi sur deux et absences validées', () => {
    expect(restingGroup('2026-10-05', '2026-10-05')).toBe('A');
    expect(restingGroup('2026-10-12', '2026-10-05')).toBe('B');
    expect(restingGroup('2026-09-28', '2026-10-05')).toBe('B');
    expect(restingGroup('2026-10-06', '2026-10-05')).toBeNull();
    const leaves = planning().leaves;
    expect(technicianOffLabel(TECHNICIANS[0]!, '2026-10-05', leaves, '2026-10-05')).toBe('Repos');
    expect(technicianOffLabel(TECHNICIANS[1]!, '2026-10-06', leaves, '2026-10-05')).toBe('Congés payés');
    expect(technicianOffLabel(TECHNICIANS[1]!, '2026-10-07', leaves, '2026-10-05')).toBeNull();
  });

  it('couleur du technicien, sinon tirée de son nom', () => {
    expect(technicianColor({ display_name: 'Alice', color: '#123456' })).toBe('#123456');
    expect(technicianColor({ display_name: 'Bruno', color: null })).toMatch(/^#[0-9A-F]{6}$/);
    expect(technicianColor(null)).toBe('#6B7280');
  });

  it('mécaniciens du planning : sans les comptes Direction et Réception', () => {
    expect(
      planningMechanics([
        { id: 't1', display_name: 'Alice', profile: { role: 'technician' } },
        { id: 't2', display_name: 'Patron', profile: { role: 'direction' } },
        { id: 't3', display_name: 'Accueil', profile: { role: 'reception' } },
        { id: 't4', display_name: 'Intérimaire', profile: null },
      ]),
    ).toEqual([
      { id: 't1', display_name: 'Alice' },
      { id: 't4', display_name: 'Intérimaire' },
    ]);
  });

  it('rappel la veille, message de l’ancienne appli', () => {
    expect(needsReminder({ scheduled_date: '2026-10-08', reminder_sent_at: null }, '2026-10-07')).toBe(true);
    expect(
      needsReminder({ scheduled_date: '2026-10-08', reminder_sent_at: '2026-10-07T08:00:00Z' }, '2026-10-07'),
    ).toBe(false);
    const message = appointmentReminderMessage(appointment(), COMPANY);
    expect(message.subject).toBe('Rappel rendez-vous mercredi 7 octobre · RAPID TRUCK SERVICE');
    expect(message.body).toContain('le mercredi 7 octobre à 09:00 pour le véhicule AB-123-CD (Vidange).');
    expect(message.body).toContain('Adresse : 19 rue Gaston Monmousseau, 95190 Goussainville.');
    expect(message.sms).toBe(
      'Rappel RDV RAPID TRUCK SERVICE mercredi 7 octobre à 09:00 pour AB-123-CD. 19 rue Gaston Monmousseau, Goussainville.',
    );
  });
});

// ---------------------------------------------------------------- Écran planning

describe('planning : écran', () => {
  it('semaine : OR, rendez-vous, absences, charge de travail', async () => {
    renderPlanning();
    expect(await screen.findByRole('heading', { name: 'Semaine du 05/10 au 11/10' })).toBeInTheDocument();
    expect(fetchPlanning).toHaveBeenCalledWith('2026-10-05', '2026-10-11');

    const tuesday = await screen.findByTestId('planning-column-2026-10-06');
    expect(within(tuesday).getByRole('link', { name: /GH-512-RT/ })).toHaveAttribute('href', '/or/ro1');
    expect(within(tuesday).getByText('Bruno (Congés payés)')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('planning-column-2026-10-05')).getByText('Alice (Repos)'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('planning-column-2026-10-07')).getByRole('button', {
        name: 'Rendez-vous 09:00 AB-123-CD',
      }),
    ).toBeInTheDocument();

    const workload = screen.getByRole('region', { name: 'Charge de travail' });
    expect(
      within(workload)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['AL3 hAlice', 'BR0 hBruno']);
    // Le dimanche, pas d'OR à assigner
    expect(screen.getByRole('button', { name: 'Assigner un OR le Samedi 10/10' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assigner un OR le Dimanche 11/10' })).toBeNull();
  });

  it('navigation : semaine suivante, vue jour', async () => {
    renderPlanning();
    await userEvent.click(await screen.findByRole('button', { name: 'Semaine suivante' }));
    expect(await screen.findByRole('heading', { name: 'Semaine du 12/10 au 18/10' })).toBeInTheDocument();
    expect(fetchPlanning).toHaveBeenLastCalledWith('2026-10-12', '2026-10-18');
    await userEvent.click(screen.getByRole('button', { name: 'Jour' }));
    expect(await screen.findByRole('heading', { name: 'Mercredi 14/10' })).toBeInTheDocument();
  });

  it('jour : une colonne par technicien, rendez-vous à assigner, technicien absent', async () => {
    renderPlanning('?vue=jour&date=2026-10-06');
    expect(await screen.findByRole('heading', { name: 'Mardi 06/10' })).toBeInTheDocument();
    expect((await screen.findAllByRole('columnheader')).map((header) => header.textContent)).toEqual([
      'ALAlice',
      'BRBruno',
    ]);
    expect(
      within(screen.getByTestId('planning-column-t1')).getByRole('link', { name: /GH-512-RT/ }),
    ).toHaveTextContent('10:00 - 12:00 GH-512-RT');
    expect(within(screen.getByTestId('planning-column-t2')).getByText('Congés payés')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assigner un OR à Bruno' })).toBeNull();
  });

  it('jour : rendez-vous sans technicien dans « RDV à assigner »', async () => {
    renderPlanning('?vue=jour&date=2026-10-07');
    expect(await screen.findByRole('columnheader', { name: 'RDV à assigner' })).toBeInTheDocument();
    expect(
      within(screen.getByTestId('planning-column-unassigned')).getByRole('button', {
        name: /Rendez-vous 09:00/,
      }),
    ).toBeInTheDocument();
  });

  it('OR sans horaire : étiquettes sous la date (semaine) et sous le technicien (jour)', async () => {
    const untimed = order({ id: 'ro2', plate: 'SH-100-AA', planned_start: null, planned_end: null });
    const other = order({
      id: 'ro3',
      plate: 'SH-200-BB',
      technician_id: 't2',
      technician_name: 'Bruno',
      planned_date: '2026-10-08',
      planned_start: null,
      planned_end: null,
    });
    vi.mocked(fetchPlanning).mockResolvedValue(planning({ untimedOrders: [untimed, other] }));
    renderPlanning();
    const tuesday = await screen.findByTestId('planning-untimed-2026-10-06');
    const chip = within(tuesday).getByRole('link', { name: /SH-100-AA/ });
    expect(chip).toHaveAttribute('href', '/or/ro2');
    expect(chip).toHaveAttribute('title', 'Prévu ce jour, sans horaire · Alice');
    expect(within(screen.getByTestId('planning-untimed-2026-10-08')).getByRole('link')).toHaveTextContent(
      'SH-200-BB',
    );
    // Pas de bloc dans la grille horaire
    expect(within(screen.getByTestId('planning-column-2026-10-06')).queryByText('SH-100-AA')).toBeNull();
    expect(screen.getByText('OR prévu ce jour-là sans horaire')).toBeInTheDocument();
  });

  it('OR sans horaire, vue jour : sous le technicien concerné', async () => {
    const untimed = order({ id: 'ro2', plate: 'SH-100-AA', planned_start: null, planned_end: null });
    vi.mocked(fetchPlanning).mockResolvedValue(planning({ untimedOrders: [untimed] }));
    renderPlanning('?vue=jour&date=2026-10-06');
    expect(
      within(await screen.findByTestId('planning-untimed-t1')).getByRole('link', { name: /SH-100-AA/ }),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('planning-untimed-t2')).queryAllByRole('link')).toHaveLength(0);
  });

  it('sans OR sans horaire, pas de ligne « Sans horaire »', async () => {
    renderPlanning();
    await screen.findByTestId('planning-column-2026-10-06');
    expect(screen.queryByText('Sans horaire')).toBeNull();
  });

  it('assigner un OR à un technicien', async () => {
    vi.mocked(updateRepairOrder).mockResolvedValue(undefined);
    renderPlanning('?vue=jour&date=2026-10-07');
    await userEvent.click(await screen.findByRole('button', { name: 'Assigner un OR à Alice' }));
    const dialog = screen.getByRole('dialog', { name: 'Assigner un OR' });
    expect(within(dialog).getByText('Mercredi 07/10 · Alice')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assigner au planning' }));
    expect(await within(dialog).findByText('Choisis un OR')).toBeInTheDocument();

    await userEvent.selectOptions(await within(dialog).findByLabelText('Ordre de réparation'), 'ro1');
    await userEvent.clear(within(dialog).getByLabelText('Heure de début'));
    await userEvent.type(within(dialog).getByLabelText('Heure de début'), '14:00');
    await userEvent.clear(within(dialog).getByLabelText('Heure de fin'));
    await userEvent.type(within(dialog).getByLabelText('Heure de fin'), '16:30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assigner au planning' }));
    await waitFor(() =>
      expect(updateRepairOrder).toHaveBeenCalledWith('ro1', {
        technician_id: 't1',
        planned_date: '2026-10-07',
        planned_start: '14:00',
        planned_end: '16:30',
      }),
    );
  });
});

// ---------------------------------------------------------------- Rendez-vous

describe('rendez-vous', () => {
  it('nouveau rendez-vous : client ou immatriculation obligatoire, puis enregistrement', async () => {
    vi.mocked(saveAppointment).mockResolvedValue(appointment());
    renderPlanning();
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau rendez-vous' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau rendez-vous' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-07');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(
      await within(dialog).findByText('Indique au moins le client ou l’immatriculation'),
    ).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Immatriculation'), 'ab123cd');
    expect(within(dialog).getByLabelText('Immatriculation')).toHaveValue('AB-123-CD');
    await userEvent.type(within(dialog).getByLabelText('Motif'), ' Freins ');
    await userEvent.selectOptions(within(dialog).getByLabelText('Technicien (facultatif)'), 't2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveAppointment).toHaveBeenCalledWith(null, {
        client_name: '',
        plate: 'AB-123-CD',
        vehicle_type: 'pl',
        scheduled_date: '2026-10-07',
        start_time: '09:00',
        end_time: '10:00',
        reason: 'Freins',
        technician_id: 't2',
      }),
    );
  });

  it('nouveau client : sa fiche est demandée, puis créée avec le rendez-vous', async () => {
    vi.mocked(findClientByName).mockResolvedValue(null);
    vi.mocked(saveAppointment).mockResolvedValue(appointment());
    renderPlanning();
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau rendez-vous' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau rendez-vous' });
    await userEvent.type(within(dialog).getByLabelText('Client'), 'Garage Lefèvre');
    await within(dialog).findByText('Nouveau client : fiche à compléter');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Indique le SIRET')).toBeInTheDocument();
    expect(saveAppointment).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('SIRET *'), '98498913700018');
    await userEvent.type(within(dialog).getByLabelText('Téléphone *'), '0612345678');
    await userEvent.type(within(dialog).getByLabelText('E-mail *'), 'atelier@lefevre.fr');
    await userEvent.type(
      within(dialog).getByLabelText('Adresse de facturation *'),
      '1 rue des Lilas 95500 Gonesse',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveAppointment).toHaveBeenCalled());
    expect(vi.mocked(createClient).mock.calls[0]?.[0]).toMatchObject({
      name: 'Garage Lefèvre',
      email: 'atelier@lefevre.fr',
    });
    expect(vi.mocked(saveAppointment).mock.calls[0]?.[1]).toMatchObject({ client_name: 'Garage Lefèvre' });
  });

  it('le véhicule est arrivé : OR créé puis ouvert', async () => {
    vi.mocked(convertAppointment).mockResolvedValue('ro9');
    renderPlanning();
    await userEvent.click(await screen.findByRole('button', { name: 'Rendez-vous 09:00 AB-123-CD' }));
    await userEvent.click(screen.getByRole('button', { name: 'Le véhicule est arrivé : créer l’OR' }));
    expect(await screen.findByText('Fiche OR')).toBeInTheDocument();
    expect(convertAppointment).toHaveBeenCalledWith('a1', false);
  });

  it('rappel au client : enregistré puis message prêt à envoyer', async () => {
    vi.mocked(markAppointmentReminded).mockResolvedValue(undefined);
    renderPlanning();
    await userEvent.click(await screen.findByRole('button', { name: 'Rendez-vous 09:00 AB-123-CD' }));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer un rappel au client' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rappel du rendez-vous' });
    expect(markAppointmentReminded).toHaveBeenCalledWith('a1');
    expect(within(dialog).getByLabelText('E-mail du client')).toHaveValue('contact@martin.fr');
    expect(within(dialog).getByRole('link', { name: /Envoyer par e-mail/ })).toHaveAttribute(
      'href',
      expect.stringContaining('subject=Rappel%20rendez-vous%20mercredi%207%20octobre'),
    );
    expect(within(dialog).queryByLabelText('Lien')).toBeNull();
  });

  it('annulation après confirmation', async () => {
    vi.mocked(cancelAppointment).mockResolvedValue(undefined);
    renderPlanning();
    await userEvent.click(await screen.findByRole('button', { name: 'Rendez-vous 09:00 AB-123-CD' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le rendez-vous' }));
    const confirm = screen.getByRole('dialog', { name: 'Annuler ce rendez-vous ?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Annuler le rendez-vous' }));
    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledWith('a1'));
  });

  it('liste : rappels à envoyer la veille', async () => {
    const tomorrow = addDays(todayIso(), 1);
    vi.mocked(fetchUpcomingAppointments).mockResolvedValue([
      appointment({ scheduled_date: tomorrow }),
      appointment({
        id: 'a2',
        scheduled_date: tomorrow,
        plate: 'EF-456-GH',
        reminder_sent_at: '2026-10-01T10:00:00Z',
      }),
      appointment({
        id: 'a3',
        scheduled_date: addDays(todayIso(), 5),
        plate: null,
        technician_name: 'Alice',
      }),
    ]);
    renderRoutes([{ path: '/rendez-vous', element: <AppointmentsPage /> }], { initialPath: '/rendez-vous' });
    const items = await screen.findAllByRole('listitem');
    expect(fetchUpcomingAppointments).toHaveBeenCalledWith(todayIso());
    expect(items[0]).toHaveTextContent('Rappel à envoyer');
    expect(items[0]).toHaveTextContent(/Logistique Durand.*Vidange.*à assigner/);
    expect(items[1]).toHaveTextContent('Rappel envoyé');
    expect(items[2]).toHaveTextContent('sans immatriculation');
    expect(items[2]).toHaveTextContent('Alice');
    expect(items[2]).toHaveTextContent('Rappel la veille');
  });

  it('demande en ligne : à part, confirmée ou refusée par le bureau', async () => {
    vi.mocked(fetchUpcomingAppointments).mockResolvedValue([
      appointment({ id: 'r1', status: 'requested', reason: 'Contrôle technique (demandé en ligne)' }),
      appointment({ id: 'a1', scheduled_date: addDays(todayIso(), 3) }),
    ]);
    vi.mocked(confirmAppointmentRequest).mockResolvedValue();
    renderRoutes([{ path: '/rendez-vous', element: <AppointmentsPage /> }], { initialPath: '/rendez-vous' });
    const requests = await screen.findByRole('region', { name: 'Demandes en ligne' });
    expect(requests).toHaveTextContent('Contrôle technique (demandé en ligne)');
    expect(screen.getByRole('region', { name: 'Rendez-vous à venir' })).not.toHaveTextContent(
      'demandé en ligne',
    );
    await userEvent.click(within(requests).getByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(confirmAppointmentRequest).toHaveBeenCalledWith('r1'));
    await userEvent.click(within(requests).getByRole('button', { name: /Refuser/ }));
    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledWith('r1'));
  });
});
