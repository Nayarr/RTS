import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMERA_AWAKE_MS, useActivity } from './use-activity';
import { useCamera } from './use-camera';

/** Caméra simulée : chaque allumage donne un flux dont on suit l'arrêt. */
const tracks: { stop: ReturnType<typeof vi.fn> }[] = [];
const getUserMedia = vi.fn(() => {
  const track = { stop: vi.fn() };
  tracks.push(track);
  return Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream);
});

function Kiosk() {
  const awake = useActivity();
  const { videoRef, state } = useCamera(awake);
  return (
    <div>
      <video ref={videoRef} />
      <p>Caméra : {state}</p>
      <button type="button">1</button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  tracks.length = 0;
  getUserMedia.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});

afterEach(() => vi.useRealTimers());

const flush = () => act(async () => {});

describe('borne : caméra allumée à l’activité', () => {
  it('éteinte au repos, allumée au premier geste, éteinte après 45 s sans activité', async () => {
    render(<Kiosk />);
    expect(screen.getByText('Caméra : off')).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole('button', { name: '1' }));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Caméra : ready')).toBeInTheDocument();

    // Nouveau geste à 30 s : encore 45 s à partir de là
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    fireEvent.keyDown(window, { key: '2' });
    await act(() => vi.advanceTimersByTimeAsync(CAMERA_AWAKE_MS - 1_000));
    expect(screen.getByText('Caméra : ready')).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByText('Caméra : off')).toBeInTheDocument();
    expect(tracks[0]?.stop).toHaveBeenCalled();

    // Quelqu'un revient : la caméra se rallume
    fireEvent.pointerDown(document.body);
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Caméra : ready')).toBeInTheDocument();
  });

  it('caméra refusée : signalée seulement quand elle doit s’allumer', async () => {
    getUserMedia.mockImplementationOnce(() => Promise.reject(new Error('refus')));
    render(<Kiosk />);
    expect(screen.getByText('Caméra : off')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    await flush();
    expect(screen.getByText('Caméra : denied')).toBeInTheDocument();
  });
});
