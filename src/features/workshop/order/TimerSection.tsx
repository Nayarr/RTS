import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatDuration } from '@/features/repair-orders/constants';
import { useLiveSeconds } from '@/features/repair-orders/use-live-seconds';
import { cn } from '@/lib/utils';
import { startTimer, stopTimer, updateMileage } from '../api';
import { useWorkshopMutation } from '../hooks';

/** Kilométrage et badgeage : démarrage possible une fois le kilométrage et les photos obligatoires faits. */
export function TimerSection({
  order,
  loadedAt,
  locked,
}: {
  order: RepairOrderOverview;
  /** Heure du chargement des données (ms). */
  loadedAt: number;
  locked: boolean;
}) {
  const seconds = useLiveSeconds(order.worked_seconds, order.running_since, loadedAt);
  const running = Boolean(order.running_since);
  const saved = order.mileage === null ? '' : String(order.mileage);
  const [mileage, setMileage] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setMileage(saved);
  }

  const saveMileage = useWorkshopMutation(
    order.id,
    (value: number | null) => updateMileage(order.id, value),
    'Kilométrage enregistré',
  );
  // L'heure du badgeage est celle du serveur : jamais mise en attente hors connexion.
  const toggle = useWorkshopMutation(
    order.id,
    () => (running ? stopTimer(order.id) : startTimer(order.id)),
    undefined,
    { offlineMessage: 'Hors connexion : le badgeage a besoin du réseau, réessaie dès qu’il revient' },
  );

  const missing = [
    ...(order.mileage === null ? ['le kilométrage'] : []),
    ...(order.missing_photo_labels.length ? [`les photos (${order.missing_photo_labels.join(', ')})`] : []),
  ];
  const canStart = missing.length === 0;

  const commitMileage = () => {
    const clean = mileage.replace(/\D/g, '');
    if (clean === saved) return;
    saveMileage.mutate(clean ? Number(clean) : null);
  };

  return (
    <section
      data-slot="card"
      className="card sec items-center gap-3! px-4! py-[18px]! text-center"
      aria-label="Chrono"
    >
      <span className="hint">Temps passé sur cet OR</span>
      <span
        className="num font-display text-[52px] leading-none font-bold"
        role="timer"
        aria-label="Temps passé sur cet OR"
      >
        {running && (
          <span className="warn-t align-middle text-[26px]" aria-hidden>
            ●{' '}
          </span>
        )}
        {formatDuration(seconds)}
      </span>
      {!locked && (
        <Button
          size="lg"
          className={cn(
            'h-14! w-full text-[17px]',
            running && 'border-warning bg-warning text-[#1c1d1f] hover:bg-warning/90',
          )}
          variant={running || canStart ? 'default' : 'outline'}
          disabled={toggle.isPending || (!running && !canStart)}
          onClick={() => toggle.mutate(undefined)}
        >
          {running ? <Pause /> : <Play />}
          {running ? 'Mettre en pause' : 'Démarrer le badgeage'}
        </Button>
      )}
      {!locked && !running && !canStart && (
        <p className="hint">Avant de démarrer : renseigne {missing.join(' et ')}.</p>
      )}
      <div className="row w-full items-end gap-2 text-left">
        <div className="field grow">
          <Label htmlFor="tech-mileage">Kilométrage</Label>
          <Input
            id="tech-mileage"
            inputMode="numeric"
            placeholder="Ex : 184320"
            className="num"
            value={mileage}
            disabled={locked}
            onChange={(event) => setMileage(event.target.value.replace(/\D/g, '').slice(0, 7))}
            onBlur={commitMileage}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </div>
        {!locked && (
          <Button type="button" variant="outline" onClick={commitMileage}>
            OK
          </Button>
        )}
      </div>
    </section>
  );
}
