import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateDeadlines, type VehicleDeadlines } from '../api';
import { useVehicleDeadlines, useWorkshopMutation } from '../hooks';

const FIELDS: [keyof VehicleDeadlines, string][] = [
  ['ct_due_date', 'Prochain contrôle technique'],
  ['tailgate_due_date', 'Prochain contrôle hayon'],
];

/** Échéances du véhicule relevées pendant l'intervention (alertes du bureau). */
export function DeadlinesSection({
  repairOrderId,
  vehicleId,
  locked,
}: {
  repairOrderId: string;
  vehicleId: string;
  locked: boolean;
}) {
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
      <span className="hint">Relevées sur le véhicule (vignette, étiquette du hayon).</span>
      {/* Sur téléphone, l'une sous l'autre : les libellés longs ne décalent plus les dates */}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end sm:gap-2">
        {FIELDS.map(([key, label]) => (
          <div key={key} className="field">
            <Label htmlFor={`deadline-${key}`}>{label}</Label>
            <Input
              id={`deadline-${key}`}
              type="date"
              disabled={locked || deadlines.isPending}
              defaultValue={deadlines.data?.[key] ?? ''}
              key={deadlines.data?.[key] ?? 'vide'}
              onBlur={(event) => {
                const value = event.target.value || null;
                if (value !== (deadlines.data?.[key] ?? null)) save.mutate({ [key]: value });
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
