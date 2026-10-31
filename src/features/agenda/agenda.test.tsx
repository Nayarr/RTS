import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { deleteEvent, fetchEvents, saveEvent } from './api';
import type * as AgendaApi from './api';
import { AgendaPage } from './AgendaPage';
import {
  addMonths,
  daySpan,
  eventsOfDay,
  monthGrid,
  periodLabel,
  slotAt,
  timeLabel,
  viewRange,
  type PersonalEvent,
} from './domain';
import { eventFromForm, eventToForm } from './schemas';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AgendaApi>()),
  fetchEvents: vi.fn(),
  saveEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const local = (iso: string, time: string) => new Date(`${iso}T${time}:00`).toISOString();

const event = (patch: Partial<PersonalEvent> = {}): PersonalEvent => ({
  id: 'e1',
  profile_id: 'p1',
  title: 'Rendez-vous banque',
  starts_at: local('2026-11-04', '10:00'),
  ends_at: local('2026-11-04', '11:30'),
  all_day: false,
  location: 'Roissy',
  notes: null,
  created_at: '2026-10-30T08:00:00Z',
  updated_at: '2026-10-30T08:00:00Z',
  ...patch,
});

describe('dates de l’agenda', () => {
  it('semaine du lundi au dimanche, mois sur six semaines, libellés', () => {
    expect(viewRange('semaine', '2026-10-30')).toEqual({ from: '2026-10-26', to: '2026-11-02' });
    expect(viewRange('jour', '2026-10-30')).toEqual({ from: '2026-10-30', to: '2026-10-31' });
    const grid = monthGrid('2026-11-15');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-10-26');
    expect(periodLabel('semaine', '2026-10-30')).toBe('26 oct. - 1 nov. 2026');
    expect(periodLabel('semaine', '2026-11-12')).toBe('9 - 15 novembre 2026');
    expect(periodLabel('mois', '2026-11-12')).toBe('novembre 2026');
    expect(periodLabel('jour', '2026-11-04')).toBe('mercredi 4 novembre 2026');
    // 31 janvier + 1 mois : dernier jour de février
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
  });

  it('place dans la journée, rendez-vous sur plusieurs jours, créneau cliqué', () => {
    expect(daySpan(event(), '2026-11-04')).toEqual({ start: 600, end: 690 });
    const night = event({ starts_at: local('2026-11-04', '20:00'), ends_at: local('2026-11-05', '09:00') });
    expect(daySpan(night, '2026-11-04')).toEqual({ start: 1200, end: 1320 });
    expect(daySpan(night, '2026-11-05')).toEqual({ start: 360, end: 540 });
    expect(slotAt(10 * 60 + 47)).toEqual({ start: '10:30', end: '11:30' });
    expect(slotAt(23 * 60)).toEqual({ start: '21:00', end: '22:00' });
  });

  it('rendez-vous du jour : journées entières d’abord, puis par heure', () => {
    const allDay = event({
      id: 'e2',
      all_day: true,
      starts_at: local('2026-11-03', '00:00'),
      ends_at: local('2026-11-06', '00:00'),
    });
    const early = event({
      id: 'e3',
      starts_at: local('2026-11-04', '08:00'),
      ends_at: local('2026-11-04', '09:00'),
    });
    expect(eventsOfDay([event(), early, allDay], '2026-11-04').map((item) => item.id)).toEqual([
      'e2',
      'e3',
      'e1',
    ]);
    expect(eventsOfDay([allDay], '2026-11-06')).toEqual([]);
    expect(timeLabel(event())).toBe('10:00 - 11:30');
    expect(timeLabel(allDay)).toBe('Journée entière');
  });

  it('formulaire : journées entières jusqu’au lendemain minuit du dernier jour', () => {
    const preset = { date: '2026-11-04', start: '09:00', end: '10:00' };
    const values = { ...eventToForm(null, preset), title: ' Salon ', all_day: true, end_date: '2026-11-05' };
    expect(eventFromForm(values)).toMatchObject({
      title: 'Salon',
      all_day: true,
      starts_at: local('2026-11-04', '00:00'),
      ends_at: local('2026-11-06', '00:00'),
      location: null,
    });
    const saved = event({
      all_day: true,
      starts_at: local('2026-11-04', '00:00'),
      ends_at: local('2026-11-06', '00:00'),
    });
    expect(eventToForm(saved, preset)).toMatchObject({
      date: '2026-11-04',
      end_date: '2026-11-05',
      all_day: true,
    });
    expect(eventToForm(event(), preset)).toMatchObject({ start: '10:00', end: '11:30', location: 'Roissy' });
  });
});

describe('page de l’agenda', () => {
  beforeEach(() => {
    vi.mocked(fetchEvents).mockReset().mockResolvedValue([event()]);
    vi.mocked(saveEvent).mockReset().mockResolvedValue();
    vi.mocked(deleteEvent).mockReset().mockResolvedValue();
  });

  const setup = (path = '/agenda?vue=semaine&date=2026-11-04') =>
    renderRoutes([{ path: '/agenda', element: <AgendaPage /> }], { initialPath: path });

  it('semaine : rendez-vous à son heure, nouveau rendez-vous enregistré', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Rendez-vous banque, 10:00 - 11:30, Roissy' }),
    ).toBeVisible();
    expect(fetchEvents).toHaveBeenCalledWith('2026-11-02', '2026-11-09');
    expect(screen.getByRole('heading', { name: '2 - 8 novembre 2026' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Nouveau rendez-vous/ }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau rendez-vous' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-04');
    await userEvent.type(within(dialog).getByLabelText('Objet'), 'Appel fournisseur');
    const end = within(dialog).getByLabelText('Fin');
    await userEvent.clear(end);
    await userEvent.type(end, '08:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('L’heure de fin doit être après le début')).toBeVisible();
    await userEvent.clear(end);
    await userEvent.type(end, '10:30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveEvent).toHaveBeenCalledWith({
        title: 'Appel fournisseur',
        all_day: false,
        starts_at: local('2026-11-04', '09:00'),
        ends_at: local('2026-11-04', '10:30'),
        location: null,
        notes: null,
      }),
    );
  });

  it('rendez-vous ouvert : modifié puis supprimé après confirmation', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /^Rendez-vous banque, 10:00/ }));
    let dialog = screen.getByRole('dialog', { name: 'Rendez-vous' });
    const title = within(dialog).getByLabelText('Objet');
    await userEvent.clear(title);
    await userEvent.type(title, 'Banque');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1', title: 'Banque' })),
    );

    await userEvent.click(await screen.findByRole('button', { name: /^Rendez-vous banque, 10:00/ }));
    dialog = screen.getByRole('dialog', { name: 'Rendez-vous' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Supprimer ce rendez-vous ?' })).getByRole('button', {
        name: 'Supprimer',
      }),
    );
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith('e1'));
  });

  it('mois : jour cliqué ouvert en vue jour', async () => {
    const { router } = setup('/agenda?vue=mois&date=2026-11-04');
    expect(await screen.findByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument();
    expect(fetchEvents).toHaveBeenCalledWith('2026-10-26', '2026-12-07');
    await userEvent.click(screen.getByRole('button', { name: 'Voir le mercredi 4 novembre' }));
    await waitFor(() => expect(router.state.location.search).toBe('?vue=jour&date=2026-11-04'));
  });
});
