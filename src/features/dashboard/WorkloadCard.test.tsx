import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { fetchWorkshopWorkload, type WorkshopWorkload } from './workload';
import type * as Workload from './workload';
import { WorkloadCard } from './WorkloadCard';

vi.mock('./workload', async (importOriginal) => ({
  ...(await importOriginal<typeof Workload>()),
  fetchWorkshopWorkload: vi.fn(),
}));

const WEEK: WorkshopWorkload = {
  from: '2026-09-28',
  to: '2026-10-04',
  technicians: [
    {
      technician_id: 'a',
      name: 'Alice',
      color: '#2A6B52',
      available_hours: 39,
      declared_hours: 41.5,
      worked_orders: 7,
      planned_hours: 36,
      planned_orders: 8,
      absence: null,
    },
    {
      technician_id: 'b',
      name: 'Bruno',
      color: null,
      available_hours: 39,
      declared_hours: 33,
      worked_orders: 6,
      planned_hours: 35,
      planned_orders: 6,
      absence: null,
    },
    {
      technician_id: 's',
      name: 'Samir',
      color: null,
      available_hours: 0,
      declared_hours: 0,
      worked_orders: 0,
      planned_hours: 0,
      planned_orders: 0,
      absence: 'rest',
    },
  ],
  to_plan: { orders: 4, hours: 11.5 },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T10:00:00+02:00'));
  vi.mocked(fetchWorkshopWorkload).mockResolvedValue(WEEK);
});
afterEach(() => vi.useRealTimers());

const setup = () => renderRoutes([{ path: '/', element: <WorkloadCard /> }]);

describe('charge de travail atelier', () => {
  it('semaine en cours : atelier, techniciens, absents, OR à planifier', async () => {
    setup();
    const card = await screen.findByRole('region', { name: 'Charge de travail atelier' });
    expect(fetchWorkshopWorkload).toHaveBeenCalledWith('2026-09-28', '2026-10-04');
    expect(within(card).getByText('Semaine du 28 sept. au 4 oct.')).toBeInTheDocument();
    expect(
      await within(card).findByText(/déclarées sur 78 h disponibles · 96 % · 71 h planifiées/),
    ).toBeInTheDocument();

    const alice = within(card).getByRole('listitem', { name: 'Alice' });
    expect(alice).toHaveTextContent('7 OR travaillés · planifié 36 h (8 OR)');
    expect(alice).toHaveTextContent('41,5 h / 39 h · 106 %');
    expect(within(alice).getByText('41,5 h')).toHaveClass('gold-text');
    expect(within(alice).getByRole('meter', { name: 'Charge de Alice' })).toHaveAttribute(
      'aria-valuenow',
      '106',
    );

    const bruno = within(card).getByRole('listitem', { name: 'Bruno' });
    expect(bruno).toHaveTextContent('33 h / 39 h · 85 %');
    expect(within(bruno).getByText('33 h')).not.toHaveClass('gold-text');

    const samir = within(card).getByRole('listitem', { name: 'Samir' });
    expect(samir).toHaveTextContent('Absent · repos');
    expect(within(samir).queryByRole('meter')).toBeNull();

    expect(card).toHaveTextContent('À planifier ou en retard : 4 OR (≈ 11,5 h estimées)');
    expect(within(card).getByRole('link', { name: /Ouvrir le planning/ })).toHaveAttribute(
      'href',
      '/planning',
    );
  });

  it('jour sans ouverture : « Atelier fermé », sauf pour qui a saisi du temps', async () => {
    vi.mocked(fetchWorkshopWorkload).mockResolvedValue({
      ...WEEK,
      technicians: [
        { ...WEEK.technicians[0]!, available_hours: 0, declared_hours: 2.5, absence: 'closed' },
        { ...WEEK.technicians[1]!, available_hours: 0, declared_hours: 0, absence: 'closed' },
      ],
    });
    setup();
    const alice = await screen.findByRole('listitem', { name: 'Alice' });
    expect(alice).toHaveTextContent('2,5 h hors heures d’ouverture');
    expect(within(alice).queryByRole('meter')).toBeNull();
    expect(screen.getByRole('listitem', { name: 'Bruno' })).toHaveTextContent('Atelier fermé');
  });

  it('jour, mois, période précédente et retour à la période en cours', async () => {
    setup();
    await screen.findByText('Semaine du 28 sept. au 4 oct.');
    expect(screen.queryByRole('button', { name: 'Cette semaine' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Période précédente' }));
    expect(screen.getByText('Semaine du 21 sept. au 27 sept.')).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkshopWorkload).toHaveBeenCalledWith('2026-09-21', '2026-09-27'));
    await userEvent.click(screen.getByRole('button', { name: 'Cette semaine' }));
    expect(screen.getByText('Semaine du 28 sept. au 4 oct.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Jour' }));
    expect(screen.getByText('Jeudi 1 octobre')).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkshopWorkload).toHaveBeenCalledWith('2026-10-01', '2026-10-01'));

    await userEvent.click(screen.getByRole('tab', { name: 'Mois' }));
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkshopWorkload).toHaveBeenCalledWith('2026-10-01', '2026-10-31'));
    await userEvent.click(screen.getByRole('button', { name: 'Période suivante' }));
    expect(screen.getByText('Novembre 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ce mois-ci' })).toBeInTheDocument();
  });
});
