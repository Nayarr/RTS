import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MonthYearField } from '@/components/MonthYearField';
import { cn } from '@/lib/utils';
import { updateDeadlines, type VehicleDeadlines } from '../api';
import { CT_PHOTO_LABEL } from '../domain';
import { useVehicleDeadlines, useWorkshopMutation } from '../hooks';
import type { PhotoCapture } from './use-photo-capture';

const FIELDS: [keyof VehicleDeadlines, string][] = [
  ['ct_due_date', 'Prochain contrôle technique'],
  ['tailgate_due_date', 'Prochain contrôle hayon'],
];

/** Échéances du véhicule relevées pendant l'intervention (alertes du bureau). */
export function DeadlinesSection({
  repairOrderId,
  vehicleId,
  locked,
  capture,
  photoLabels,
  ctRequired,
}: {
  repairOrderId: string;
  vehicleId: string;
  locked: boolean;
  capture: PhotoCapture;
  /** Libellés des photos déjà prises sur l'OR. */
  photoLabels: string[];
  /** Photo du contrôle technique exigée (pas pour une remorque). */
  ctRequired: boolean;
}) {
  const ctTaken = photoLabels.includes(CT_PHOTO_LABEL);
  const deadlines = useVehicleDeadlines(vehicleId);
  const save = useWorkshopMutation(
    repairOrderId,
    (patch: Partial<VehicleDeadlines>) => updateDeadlines(repairOrderId, patch),
    'Échéance enregistrée',
  );

  return (
    <section data-slot="card" className="card sec" aria-labelledby="tech-deadlines">
      <h2 className="sec-t" id="tech-deadlines">
        Échéances du véhicule
      </h2>
      <span className="hint">Relevées sur le véhicule (contrôle technique, étiquette du hayon).</span>
      {ctRequired && !ctTaken && !locked && (
        <p className="err">Photo du contrôle technique obligatoire avant de terminer l’OR.</p>
      )}
      {/* Sur téléphone, l'une sous l'autre : les libellés longs ne décalent plus les dates */}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end sm:gap-2">
        {FIELDS.map(([key, label]) =>
          key === 'tailgate_due_date' ? (
            // Hayon : mois et année seulement, comme sur l'étiquette
            <MonthYearField
              key={key}
              id="deadline-tailgate"
              label={label}
              disabled={locked || deadlines.isPending}
              value={deadlines.data?.tailgate_due_date ?? ''}
              onChange={(value) => {
                if (value !== (deadlines.data?.tailgate_due_date ?? ''))
                  save.mutate({ [key]: value || null });
              }}
            />
          ) : (
            <div key={key} className="field">
              <Label htmlFor={`deadline-${key}`}>{label}</Label>
              <div className="row gap-2">
                <Input
                  id={`deadline-${key}`}
                  type="date"
                  className="grow"
                  disabled={locked || deadlines.isPending}
                  defaultValue={deadlines.data?.[key] ?? ''}
                  key={deadlines.data?.[key] ?? 'vide'}
                  onBlur={(event) => {
                    const value = event.target.value || null;
                    if (value !== (deadlines.data?.[key] ?? null)) save.mutate({ [key]: value });
                  }}
                />
                {key === 'ct_due_date' && !locked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(
                      'shrink-0',
                      ctTaken ? 'text-success' : ctRequired && 'border-destructive text-destructive',
                    )}
                    aria-label={`Photo du contrôle technique${ctTaken ? ' (déjà prise)' : ''}`}
                    disabled={capture.uploadingLabel === CT_PHOTO_LABEL}
                    onClick={() => capture.openCamera(CT_PHOTO_LABEL)}
                  >
                    <Camera className="size-5" />
                  </Button>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
