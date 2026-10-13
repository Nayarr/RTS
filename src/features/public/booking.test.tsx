import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { bookAppointment, fetchPublicBooking, type PublicBooking } from './booking-api';
import { PublicBookingPage } from './PublicBookingPage';

vi.mock('./booking-api', () => ({ fetchPublicBooking: vi.fn(), bookAppointment: vi.fn() }));

const TOKEN = 'b'.repeat(64);
const booking = (overrides: Partial<PublicBooking> = {}): PublicBooking => ({
  company: {
    legal_name: 'RAPID TRUCK SERVICE',
    address_line: '19 rue Gaston Monmousseau',
    postal_code: '95190',
    city: 'Goussainville',
    email: 'atelier@rapidtruckservice.fr',
    phone: '01 23 45 67 89',
    siret: null,
  },
  plate: 'AB-123-CD',
  client_name: 'Transports Dupont',
  reason: 'Contrôle technique',
  due_date: '2026-10-16',
  appointment: null,
  slots: [
    { date: '2026-10-19', times: ['09:00', '10:00'] },
    { date: '2026-10-20', times: ['14:00'] },
  ],
  ...overrides,
});

const open = () =>
  renderRoutes([{ path: '/rdv/:token', element: <PublicBookingPage /> }], { initialPath: `/rdv/${TOKEN}` });

describe('prise de rendez-vous en ligne', () => {
  it('le client choisit un jour et une heure libres, la demande part', async () => {
    vi.mocked(fetchPublicBooking).mockResolvedValue(booking());
    vi.mocked(bookAppointment).mockResolvedValue({ date: '2026-10-20', time: '14:00', status: 'requested' });
    open();
    expect(await screen.findByRole('heading', { name: 'Contrôle technique', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/échéance le 16\/10\/2026/)).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Choisissez une heure' });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /mardi 20 octobre/ }));
    await userEvent.click(screen.getByRole('button', { name: '14h00' }));
    await userEvent.click(screen.getByRole('button', { name: 'Demander le mardi 20 octobre à 14h00' }));
    await waitFor(() => expect(bookAppointment).toHaveBeenCalledWith(TOKEN, '2026-10-20', '14:00'));
  });

  it('demande déjà envoyée, ou lien expiré', async () => {
    vi.mocked(fetchPublicBooking).mockResolvedValue(
      booking({ appointment: { date: '2026-10-20', time: '14:00', status: 'requested' }, slots: [] }),
    );
    open();
    expect(await screen.findByText(/Demande envoyée pour le mardi 20 octobre à 14h00/)).toBeInTheDocument();
  });

  it('lien inconnu : message clair', async () => {
    vi.mocked(fetchPublicBooking).mockResolvedValue(null);
    open();
    expect(await screen.findByText(/Ce lien est introuvable ou a expiré/)).toBeInTheDocument();
  });
});
