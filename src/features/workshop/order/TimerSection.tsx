import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatDuration } from '@/features/repair-orders/constants';
import { useLiveSeconds } from '@/features/repair-orders/use-live-seconds';
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
  const toggle = useWorkshopMutation(order.id, () => (running ? stopTimer(order.id) : startTimer(order.id)));

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
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="tech-mileage">Kilométrage</Label>
          <Input
            id="tech-mileage"
            inputMode="numeric"
            placeholder="Ex : 184320"
            className="h-12 max-w-xs text-lg"
            value={mileage}
            disabled={locked}
            onChange={(event) => setMileage(event.target.value.replace(/\D/g, '').slice(0, 7))}
            onBlur={commitMileage}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </div>

        <div className="rounded-xl bg-muted p-5 text-center">
          <p
            className="font-display text-5xl font-bold tabular-nums"
            role="timer"
            aria-label="Temps passé sur cet OR"
          >
            {formatDuration(seconds)}
          </p>
          <p className="text-sm text-muted-foreground">Temps passé sur cet OR</p>
          {!locked && (
            <Button
              size="lg"
              className="mt-4 h-14 w-full text-lg"
              variant={running ? 'destructive' : canStart ? 'default' : 'outline'}
              disabled={toggle.isPending || (!running && !canStart)}
              onClick={() => toggle.mutate(undefined)}
            >
              {running ? <Pause /> : <Play />}
              {running ? 'Mettre en pause' : 'Démarrer le badgeage'}
            </Button>
          )}
          {!locked && !running && !canStart && (
            <p className="mt-2 text-sm text-muted-foreground">
              Avant de démarrer : renseigne {missing.join(' et ')}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
