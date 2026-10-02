import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
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
import { KioskSignatureDialog } from '@/features/signature/KioskSignatureDialog';
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
  info: 's-blue',
  success: 's-green',
  warning: 's-warn',
  error: 's-bad',
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
      // Saisie dans un champ (nom du client dans la fenêtre de signature) : pas pour le code PIN.
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [role="dialog"]'))
        return;
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === 'Enter') press('OK');
      else if (event.key === 'Backspace' && !busy) setPin((current) => current.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, busy, exitOpen]);

  const idle = message === IDLE_MESSAGE;
  const dots = Math.max(4, pin.length);

  return (
    <div className="fixed inset-0 z-50 grid overflow-y-auto bg-background p-6 select-none lg:grid-cols-[1fr_460px] lg:gap-10 lg:px-12 lg:py-10">
      <div className="col gap-6">
        <div className="row gap-3">
          <img src="/icons/icon-192.png" alt="" className="size-12 rounded-[8px] bg-white p-0.5" />
          <div className="col gap-0">
            <b className="font-display text-2xl leading-tight">{company.data ?? 'RTS Atelier'}</b>
            <span className="hint">Borne de pointage</span>
          </div>
        </div>
        <div className="col gap-0" aria-label="Heure">
          <span className="num font-display text-[84px] leading-[.95] font-bold lg:text-[120px]">
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="sub text-[22px]! first-letter:uppercase">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        <div className="relative flex min-h-56 grow items-center justify-center overflow-hidden rounded-[20px] bg-[#1c1d1f] text-white/60">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 size-full -scale-x-100 object-cover"
          />
          {cameraState === 'ready' ? (
            <span className="badge dot s-bad absolute top-3.5 left-3.5 border-transparent! bg-black/40! text-white!">
              REC
            </span>
          ) : (
            <p className="relative max-w-sm p-6 text-center text-sm">
              {cameraState === 'starting'
                ? 'Activation de la caméra…'
                : cameraState === 'denied'
                  ? 'Caméra indisponible : autorise la caméra pour cette page, sinon le pointage est bloqué.'
                  : 'Caméra non prise en charge sur cet appareil.'}
            </p>
          )}
        </div>
      </div>

      <div className="card col mt-6 justify-center gap-[22px] p-7 lg:mt-0">
        <div className="col gap-1 text-center">
          <h1 className="title text-[30px]!">Tape ton code</h1>
          <span className="sub">Arrivée ou départ, la borne le sait.</span>
        </div>
        <div className="dots" aria-label="Code saisi" data-length={pin.length}>
          {Array.from({ length: dots }, (_, index) => (
            <i key={index} className={cn(index < pin.length && 'f')} />
          ))}
        </div>
        <div className="pad" role="group" aria-label="Clavier">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              aria-label={key === 'C' ? 'Effacer' : key === 'OK' ? 'Valider' : key}
              onClick={() => press(key)}
              className={cn('key', key === 'C' && 'c', key === 'OK' && 'ok')}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        className={cn(
          idle
            ? 'sr-only'
            : cn(
                'alert fixed right-6 bottom-6 left-6 z-10 px-[18px]! py-4! text-base shadow-(--pop) lg:right-auto lg:bottom-12 lg:left-12 lg:w-[560px]',
                'bg-[color-mix(in_srgb,var(--c)_14%,var(--card))]!',
                TONE_CLASS[message.tone],
              ),
        )}
      >
        <div className="col gap-0">
          <b className="text-lg">{message.title}</b>
          {message.detail && <span className="muted">{message.detail}</span>}
        </div>
      </div>

      <button
        type="button"
        aria-label="Quitter la borne"
        onClick={() => setExitOpen(true)}
        className="ibtn ghost absolute right-3.5 bottom-3.5 opacity-50 hover:opacity-100"
      >
        <Settings className="size-[18px]" />
      </button>
      {exitOpen && <ExitDialog onClose={() => setExitOpen(false)} />}
      {/* Signature demandée par l'accueil (client sur place) */}
      <KioskSignatureDialog />
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
