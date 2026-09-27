import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Échéances du véhicule</h2>
        </CardTitle>
        <CardDescription>Relevées sur le véhicule (vignette, étiquette du hayon).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`deadline-${key}`}>{label}</Label>
            <Input
              id={`deadline-${key}`}
              type="date"
              className="h-11"
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
      </CardContent>
    </Card>
  );
}
