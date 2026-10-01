import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signOut } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { uploadFile } from '@/features/files/api';
import type * as FilesApi from '@/features/files/api';
import { isTvMode, setTvMode } from '@/features/workshop-board/domain';
import { renderRoutes } from '@/test/render';
import { fetchCompanyName, kioskClock, verifyExitCode } from './api';
import type * as KioskApi from './api';
import { kioskMessage } from './domain';
import { KioskPage } from './KioskPage';

const camera = vi.hoisted(() => ({ photo: true }));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof KioskApi>()),
  kioskClock: vi.fn(),
  verifyExitCode: vi.fn(),
  fetchCompanyName: vi.fn(),
}));
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  uploadFile: vi.fn(),
}));
vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  signOut: vi.fn(),
}));
// Caméra simulée : pas de getUserMedia dans jsdom.
vi.mock('./use-camera', () => ({
  useCamera: () => ({
    videoRef: { current: null },
    state: 'ready',
    capture: () => Promise.resolve(camera.photo ? new Blob(['jpeg'], { type: 'image/jpeg' }) : null),
  }),
}));

const renderKiosk = () => renderRoutes([{ path: '/', element: <KioskPage /> }]);

const typePin = async (pin: string) => {
  for (const digit of pin) await userEvent.click(screen.getByRole('button', { name: digit }));
};

beforeEach(() => {
  camera.photo = true;
  vi.mocked(fetchCompanyName).mockResolvedValue('RAPID TRUCK SERVICE');
  vi.mocked(uploadFile).mockResolvedValue('photo-1');
});

afterEach(() => vi.useRealTimers());

describe('borne : messages', () => {
  it('arrivée, départ, refus', () => {
    const at = '2026-10-05T06:57:00Z';
    expect(
      kioskMessage({
        ok: true,
        technician_name: 'Alice',
        event_type: 'in',
        occurred_at: at,
        during_leave_type: null,
      }),
    ).toMatchObject({ tone: 'success', title: 'Bonjour Alice', detail: 'Arrivée enregistrée à 08:57' });
    expect(
      kioskMessage({
        ok: true,
        technician_name: 'Alice',
        event_type: 'out',
        occurred_at: at,
        during_leave_type: null,
      }),
    ).toMatchObject({ tone: 'warning', title: 'Au revoir Alice', detail: 'Départ enregistré à 08:57' });
    expect(kioskMessage({ ok: false, message: 'Code incorrect' })).toMatchObject({
      tone: 'error',
      resetAfter: 1800,
    });
    expect(
      kioskMessage({ ok: false, message: 'Déjà pointé il y a moins d’une minute (arrivée).' }),
    ).toMatchObject({
      tone: 'warning',
    });
  });
});

describe('borne : écran', () => {
  it('le PIN est masqué ; photo envoyée puis pointage', async () => {
    vi.mocked(kioskClock).mockResolvedValue({
      ok: true,
      technician_name: 'Alice',
      event_type: 'in',
      occurred_at: '2026-10-05T06:57:00Z',
      during_leave_type: null,
    });
    renderKiosk();
    expect(await screen.findByText('RAPID TRUCK SERVICE')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tape ton code PIN puis OK');

    await typePin('123');
    expect(screen.getByLabelText('Code saisi')).toHaveAttribute('data-length', '3');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(kioskClock).not.toHaveBeenCalled(); // 4 chiffres minimum

    await typePin('4');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText('Bonjour Alice')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Arrivée enregistrée à 08:57');
    expect(uploadFile).toHaveBeenCalledWith(expect.any(Blob), {
      category: 'clock_photo',
      name: 'pointage.jpg',
    });
    expect(kioskClock).toHaveBeenCalledWith('1234', 'photo-1');
  });

  it('clavier physique, effacement, retour à la saisie après un mauvais code', async () => {
    vi.mocked(kioskClock).mockResolvedValue({ ok: false, message: 'Code incorrect' });
    renderKiosk();
    await screen.findByText('RAPID TRUCK SERVICE');
    await userEvent.keyboard('98');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(screen.getByLabelText('Code saisi')).toHaveAttribute('data-length', '0');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    await userEvent.keyboard('0000{Enter}');
    expect(await screen.findByText('Code incorrect')).toBeInTheDocument();
    expect(kioskClock).toHaveBeenCalledWith('0000', 'photo-1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Tape ton code PIN puis OK');
    expect(screen.getByLabelText('Code saisi')).toHaveAttribute('data-length', '0');
  });

  it('sans photo, pas de pointage', async () => {
    camera.photo = false;
    renderKiosk();
    await screen.findByText('RAPID TRUCK SERVICE');
    await typePin('1234');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText(/Caméra indisponible — pointage impossible/)).toBeInTheDocument();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(kioskClock).not.toHaveBeenCalled();
  });

  it('erreur réseau signalée', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('offline'));
    renderKiosk();
    await screen.findByText('RAPID TRUCK SERVICE');
    await typePin('1234');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText('Erreur réseau — réessaie')).toBeInTheDocument();
  });

  it('sortie de la borne avec le code de la direction', async () => {
    vi.mocked(verifyExitCode).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.mocked(signOut).mockResolvedValue(undefined);
    renderKiosk();
    await userEvent.click(await screen.findByRole('button', { name: 'Quitter la borne' }));
    const field = screen.getByLabelText('Code de sortie');
    await userEvent.type(field, '12ab34');
    expect(field).toHaveValue('1234');
    await userEvent.click(screen.getByRole('button', { name: 'Quitter' }));
    expect(await screen.findByText('Code incorrect')).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Code de sortie'), '9753');
    await userEvent.click(screen.getByRole('button', { name: 'Quitter' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(verifyExitCode).toHaveBeenLastCalledWith('9753');
  });

  it('la borne devient l’écran atelier (télé) avec le même code', async () => {
    vi.mocked(verifyExitCode).mockResolvedValue(true);
    renderRoutes([
      { path: '/', element: <KioskPage /> },
      { path: '/tele', element: <h1>Télé</h1> },
    ]);
    await userEvent.click(await screen.findByRole('button', { name: 'Quitter la borne' }));
    await userEvent.type(screen.getByLabelText('Code de sortie'), '9753');
    await userEvent.click(screen.getByRole('button', { name: 'Écran atelier (télé)' }));
    expect(await screen.findByRole('heading', { name: 'Télé' })).toBeInTheDocument();
    expect(isTvMode()).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
    setTvMode(false);
  });
});
