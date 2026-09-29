import { useEffect, useState, type FormEvent } from 'react';
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
import { verifyExitCode } from '@/features/kiosk/api';
import { useKioskMode } from '@/features/kiosk/use-kiosk-mode';
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
    <div className="flex min-h-dvh flex-col gap-4 bg-[#0d0d0d] p-5 text-white">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-wide uppercase">
            {board.data?.company_name ?? 'Atelier'} — Atelier
          </h1>
          <p className="text-lg text-white/70 capitalize">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <p className="text-5xl font-bold tabular-nums" aria-label="Heure">
          {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </header>

      {board.isError && <p className="text-xl text-red-300">Connexion perdue : nouvel essai dans 30 s…</p>}

      <div className="grid flex-1 auto-cols-fr grid-flow-col gap-3">
        {columns.map((column) => (
          <section key={column.id} aria-label={column.name} className="flex min-w-0 flex-col gap-2">
            <h2
              className="border-b-4 pb-1 text-2xl font-bold"
              style={{ borderColor: column.color ?? '#ffffff' }}
            >
              {column.name}
            </h2>
            {column.offLabel ? (
              <p className="text-xl text-white/60">{column.offLabel}</p>
            ) : column.cards.length === 0 ? (
              <p className="text-xl text-white/60">Disponible</p>
            ) : (
              column.cards.map((card) => (
                <article
                  key={card.id}
                  aria-label={card.plate}
                  className={cn(
                    'rounded-lg border-2 p-3',
                    card.running ? 'border-[#2e9a33] bg-[#16301a]' : 'border-white/20 bg-white/5',
                  )}
                >
                  <p className="text-2xl font-extrabold tracking-wide">{card.plate}</p>
                  <p className="line-clamp-2 text-lg text-white/85">{card.task.slice(0, 70)}</p>
                  <p className={cn('text-base', card.running ? 'text-[#7ee07f]' : 'text-white/60')}>
                    {cardMeta(card)}
                  </p>
                </article>
              ))
            )}
          </section>
        ))}
      </div>

      <footer className="rounded-lg bg-white/10 p-3 text-lg">
        <strong>Véhicules attendus aujourd’hui :</strong> {expected || 'aucun'}
      </footer>

      <button
        type="button"
        aria-label="Quitter l’écran atelier"
        className="fixed right-3 bottom-3 rounded-full p-2 text-white/30 hover:text-white/70"
        onClick={() => setExitOpen(true)}
      >
        <Settings className="size-6" />
      </button>
      {exitOpen && <ExitDialog onClose={() => setExitOpen(false)} />}
    </div>
  );
}
