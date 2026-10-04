import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
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
import { initials } from '@/app/nav';
import { verifyExitCode } from '@/features/kiosk/api';
import { technicianColor } from '@/features/planning/domain';
import { useKioskMode } from '@/features/kiosk/use-kiosk-mode';
import { taskSummary } from '@/features/repair-orders/tasks';
import { cn } from '@/lib/utils';
import { fetchWorkshopBoard } from './api';
import { boardColumns, cardMeta, expectedVehicles, setTvMode } from './domain';

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Sortie du mode télé : même code que la borne (réservé à la direction). */
function ExitDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      if (await verifyExitCode(code)) {
        setTvMode(false);
        void navigate('/', { replace: true });
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
          <DialogTitle>Quitter l’écran atelier</DialogTitle>
          <DialogDescription>Code de sortie réservé à la direction.</DialogDescription>
        </DialogHeader>
        <form id="tv-exit" onSubmit={(event) => void submit(event)}>
          <FormField
            id="tv-exit-code"
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
          <Button type="submit" form="tv-exit" disabled={pending || code.length < 4}>
            Quitter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Écran atelier (télé) : une colonne par technicien, véhicules attendus ; mis à jour toutes les 30 s. */
export function TvPage() {
  useKioskMode();
  const now = useNow();
  const [exitOpen, setExitOpen] = useState(false);
  const board = useQuery({
    queryKey: ['workshop-board'],
    queryFn: fetchWorkshopBoard,
    refetchInterval: 30_000,
  });
  useEffect(() => setTvMode(true), []);

  const columns = board.data ? boardColumns(board.data) : [];
  const expected = board.data ? expectedVehicles(board.data) : '';

  return (
    <div className="relative flex min-h-dvh flex-col gap-6 overflow-x-hidden bg-[#eef0ee] px-10 py-8 dark:bg-[#0d0d0d]">
      <header className="row between items-start gap-6">
        <div className="row gap-[18px]">
          <img src="/icons/icon-192.png" alt="" className="size-[72px] rounded-xl bg-white p-[3px]" />
          <div className="col gap-0.5">
            <h1 className="font-display text-[42px] leading-none font-bold tracking-[.03em] uppercase">
              {board.data?.company_name ?? 'Atelier'} · Atelier
            </h1>
            <span className="sub text-2xl! first-letter:uppercase">
              {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
        </div>
        <span className="num font-display text-8xl leading-[.9] font-bold" aria-label="Heure">
          {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </header>

      {board.isError && <p className="alert s-bad text-xl">Connexion perdue : nouvel essai dans 30 s…</p>}

      <div className="grid flex-1 auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-6 overflow-x-auto">
        {columns.map((column) => (
          <section
            key={column.id}
            aria-label={column.name}
            className="col min-w-0 gap-3.5"
            style={
              { '--c': technicianColor({ display_name: column.name, color: column.color }) } as CSSProperties
            }
          >
            <h2 className="col-h">
              <span
                className="av lg"
                style={
                  {
                    '--c': technicianColor({ display_name: column.name, color: column.color }),
                  } as CSSProperties
                }
              >
                {initials(column.name)}
              </span>
              <span className="truncate">{column.name}</span>
            </h2>
            {column.offLabel ? (
              <p className="sub px-1 py-2 text-[26px]!">{column.offLabel}</p>
            ) : column.cards.length === 0 ? (
              <p className="sub px-1 py-2 text-[26px]!">Disponible</p>
            ) : (
              column.cards.map((card) => (
                <article key={card.id} aria-label={card.plate} className={cn('tcard', card.running && 'run')}>
                  <span className="p">{card.plate}</span>
                  <span className="t line-clamp-2">{taskSummary(card.task).slice(0, 70)}</span>
                  <span className="m">{cardMeta(card)}</span>
                </article>
              ))
            )}
          </section>
        ))}
      </div>

      <footer className="card px-6 py-[18px] text-2xl">
        <b>Véhicules attendus aujourd’hui :</b> <span className="muted">{expected || 'aucun'}</span>
      </footer>

      <button
        type="button"
        aria-label="Quitter l’écran atelier"
        className="ibtn ghost fixed right-3.5 bottom-3.5 opacity-35 hover:opacity-100"
        onClick={() => setExitOpen(true)}
      >
        <Settings className="size-[18px]" />
      </button>
      {exitOpen && <ExitDialog onClose={() => setExitOpen(false)} />}
    </div>
  );
}
