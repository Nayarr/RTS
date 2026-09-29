import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Delete, Settings } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { signOut } from '@/features/auth/api';
import { uploadFile } from '@/features/files/api';
import { setTvMode } from '@/features/workshop-board/domain';
import { cn } from '@/lib/utils';
import { fetchCompanyName, kioskClock, verifyExitCode } from './api';
import {
  CAMERA_MESSAGE,
  IDLE_MESSAGE,
  kioskMessage,
  NETWORK_MESSAGE,
  type KioskMessage,
  type KioskTone,
} from './domain';
import { useCamera } from './use-camera';
import { useKioskMode } from './use-kiosk-mode';

const MAX_PIN = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'] as const;

const TONE_CLASS: Record<KioskTone, string> = {
  info: 'text-white',
  success: 'text-emerald-400',
  warning: 'text-amber-300',
  error: 'text-red-400',
};

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Borne de pointage : code PIN + photo, arrivée ou départ. */
export function KioskPage() {
  useKioskMode();
  const now = useNow();
  const { videoRef, state: cameraState, capture } = useCamera();
  const company = useQuery({
    queryKey: ['kiosk', 'company-name'],
    queryFn: fetchCompanyName,
    staleTime: Infinity,
  });
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<KioskMessage>(IDLE_MESSAGE);
  const [exitOpen, setExitOpen] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const show = useCallback((next: KioskMessage) => {
    setMessage(next);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setPin('');
      setBusy(false);
      setMessage(IDLE_MESSAGE);
    }, next.resetAfter);
  }, []);

  const validate = useCallback(async () => {
    if (busy || pin.length < 4) return;
    setBusy(true);
    setMessage({ tone: 'info', title: 'Vérification…', resetAfter: 0 });
    const photo = await capture();
    if (!photo) {
      show(CAMERA_MESSAGE);
      return;
    }
    try {
      const photoId = await uploadFile(photo, { category: 'clock_photo', name: 'pointage.jpg' });
      show(kioskMessage(await kioskClock(pin, photoId)));
    } catch {
      show(NETWORK_MESSAGE);
    }
  }, [busy, pin, capture, show]);

  const press = useCallback(
    (key: string) => {
      if (busy) return;
      if (key === 'C') setPin('');
      else if (key === 'OK') void validate();
      else if (/^\d$/.test(key)) setPin((current) => (current.length < MAX_PIN ? current + key : current));
    },
    [busy, validate],
  );

  // Clavier physique (tablette avec clavier, tests) : chiffres, Entrée, Retour arrière.
  useEffect(() => {
    if (exitOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === 'Enter') press('OK');
      else if (event.key === 'Backspace' && !busy) setPin((current) => current.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, busy, exitOpen]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-neutral-950 text-white select-none">
      <header className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-2xl font-bold tracking-wide">{company.data ?? 'RTS Atelier'}</p>
          <p className="text-neutral-400">Borne de pointage</p>
        </div>
        <div className="text-right" aria-label="Heure">
          <p className="text-4xl font-bold tabular-nums">
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-sm text-neutral-400">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </header>

      <main className="grid flex-1 items-center gap-6 px-5 pb-5 md:grid-cols-2">
        <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl bg-neutral-900">
          <video ref={videoRef} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
          {cameraState !== 'ready' && (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-neutral-300">
              {cameraState === 'starting'
                ? 'Activation de la caméra…'
                : cameraState === 'denied'
                  ? 'Caméra indisponible : autorise la caméra pour cette page, sinon le pointage est bloqué.'
                  : 'Caméra non prise en charge sur cet appareil.'}
            </p>
          )}
        </div>

        <div className="mx-auto w-full max-w-sm space-y-4">
          <p aria-label="Code saisi" className="h-12 text-center text-4xl tracking-[0.5em] text-white">
            {'●'.repeat(pin.length)}
          </p>
          <div className="grid grid-cols-3 gap-3" role="group" aria-label="Clavier">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={busy}
                aria-label={key === 'C' ? 'Effacer' : key === 'OK' ? 'Valider' : key}
                onClick={() => press(key)}
                className={cn(
                  'h-20 rounded-2xl text-3xl font-bold transition active:scale-95 disabled:opacity-50',
                  key === 'OK'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : key === 'C'
                      ? 'bg-neutral-700 hover:bg-neutral-600'
                      : 'bg-neutral-800 hover:bg-neutral-700',
                )}
              >
                {key === 'C' ? <Delete className="mx-auto size-8" /> : key}
              </button>
            ))}
          </div>
          <div
            role="status"
            aria-live="polite"
            className={cn('min-h-20 text-center', TONE_CLASS[message.tone])}
          >
            <p className={cn('font-bold', message.detail ? 'text-3xl' : 'text-xl')}>{message.title}</p>
            {message.detail && <p className="text-xl">{message.detail}</p>}
          </div>
        </div>
      </main>

      <button
        type="button"
        aria-label="Quitter la borne"
        onClick={() => setExitOpen(true)}
        className="absolute bottom-3 left-3 rounded-full p-3 text-neutral-600 hover:text-neutral-300"
      >
        <Settings className="size-6" />
      </button>
      {exitOpen && <ExitDialog onClose={() => setExitOpen(false)} />}
    </div>
  );
}

/** Sortie de la borne : code de sortie choisi par la direction, puis déconnexion ou écran télé. */
function ExitDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  /** « Quitter » : déconnexion ; « Écran atelier (télé) » : la borne devient la télé de l'atelier. */
  const submit = async (event: FormEvent, target: 'sign-out' | 'tv' = 'sign-out') => {
    event.preventDefault();
    setPending(true);
    try {
      if (await verifyExitCode(code)) {
        if (target === 'tv') {
          setTvMode(true);
          void navigate('/tele', { replace: true });
        } else {
          await signOut();
        }
        return;
      }
      setError('Code incorrect');
    } catch {
      setError('Vérification impossible : vérifie la connexion');
    }
    setPending(false);
    setCode('');
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Quitter la borne</DialogTitle>
          <DialogDescription>Code de sortie réservé à la direction.</DialogDescription>
        </DialogHeader>
        <form id="kiosk-exit" onSubmit={(event) => void submit(event)}>
          <FormField
            id="kiosk-exit-code"
            label="Code de sortie"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={code}
            error={error}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="outline"
            disabled={pending || code.length < 4}
            onClick={(event) => void submit(event, 'tv')}
          >
            Écran atelier (télé)
          </Button>
          <Button type="submit" form="kiosk-exit" disabled={pending || code.length < 4}>
            Quitter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
