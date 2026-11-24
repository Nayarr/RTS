import { Camera, Check, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MonthYearField } from '@/components/MonthYearField';
import { cn } from '@/lib/utils';
import { updateDeadlines, type DeadlineRenewal, type VehicleDeadlines } from '../api';
import {
  CT_PHOTO_LABEL,
  hasCtPhoto,
  RENEWAL_LABELS,
  RENEWAL_PHOTO_LABELS,
  renewalDueLabel,
  type RenewalKind,
} from '../domain';
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
  renewals,
}: {
  repairOrderId: string;
  vehicleId: string;
  locked: boolean;
  capture: PhotoCapture;
  /** Libellés des photos déjà prises sur l'OR. */
  photoLabels: string[];
  /** Photo du contrôle technique exigée (pas pour une remorque). */
  ctRequired: boolean;
  /** Échéances renouvelées sur l'OR, avec leur enregistrement quand la nouvelle étiquette est prise. */
  renewals: { kind: RenewalKind; done: DeadlineRenewal | undefined }[];
}) {
  const ctTaken = hasCtPhoto(photoLabels);
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
      {renewals.length > 0 && (
        <div
          className={cn(
            'col rounded-lg border px-3 pt-2.5 pb-1',
            renewals.every((renewal) => renewal.done)
              ? 'border-success/35 bg-success/5'
              : 'border-destructive/35 bg-destructive/5',
          )}
          role="group"
          aria-label="À renouveler sur cet OR"
        >
          <b className="text-[13px]">À renouveler sur cet OR</b>
          {renewals.map(({ kind, done }) => {
            const photoLabel = RENEWAL_PHOTO_LABELS[kind];
            return (
              <div key={kind} className="row gap-2.5 border-t py-2.5 first-of-type:border-t-0">
                <div className="col min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{RENEWAL_LABELS[kind]}</span>
                  {done ? (
                    <span className="text-xs text-success">
                      Renouvelé : prochain {renewalDueLabel(kind, done.new_due)}
                    </span>
                  ) : (
                    <span className="text-xs text-destructive">
                      Photo de la nouvelle étiquette obligatoire
                    </span>
                  )}
                </div>
                {done && (
                  <span className="badge s-ok shrink-0">
                    <Check className="size-3" /> Photo
                  </span>
                )}
                {!locked && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn('shrink-0', !done && 'border-destructive text-destructive')}
                      aria-label={`Photo de la nouvelle étiquette : ${RENEWAL_LABELS[kind]}${done ? ' (reprendre)' : ''}`}
                      disabled={capture.uploadingLabel === photoLabel}
                      onClick={() => capture.openCamera(photoLabel)}
                    >
                      <Camera className="size-5" />
                    </Button>
                    {!done && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Importer la nouvelle étiquette (photo ou PDF) : ${RENEWAL_LABELS[kind]}`}
                        disabled={capture.uploadingLabel === photoLabel}
                        onClick={() => capture.openDocument(photoLabel)}
                      >
                        <FileUp className="size-5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
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
                {key === 'ct_due_date' && !locked && (
                  // Procès-verbal reçu par mail : PDF ou photo, lu par l'assistant comme la photo
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label="Importer le contrôle technique (photo ou PDF)"
                    disabled={capture.uploadingLabel === CT_PHOTO_LABEL}
                    onClick={() => capture.openDocument(CT_PHOTO_LABEL)}
                  >
                    <FileUp className="size-5" />
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
