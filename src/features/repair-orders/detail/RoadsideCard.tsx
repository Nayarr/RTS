import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/features/settings/hooks';
import { supabase } from '@/lib/supabase';
import { updateRepairOrder } from '../api';
import { useRepairOrderMutation } from '../hooks';
import { roadsideFromOrder, roadsidePatch, roadsideProblem, type RoadsideValue } from '../roadside';
import { RoadsideFields } from '../RoadsideFields';

async function fetchRoadside(repairOrderId: string) {
  const { data, error } = await supabase
    .from('repair_orders')
    .select('intervention_type, roadside_address, roadside_km, roadside_minutes, roadside_price_ht')
    .eq('id', repairOrderId)
    .single();
  if (error) throw error;
  return roadsideFromOrder(data);
}

/** Fiche OR (bureau) : dépannage extérieur, lieu, trajet et prix du déplacement repris à la facture. */
export function RoadsideCard({ repairOrderId, editable }: { repairOrderId: string; editable: boolean }) {
  const saved = useQuery({
    queryKey: ['repair-orders', repairOrderId, 'roadside'],
    queryFn: () => fetchRoadside(repairOrderId),
  });
  if (!saved.data) return null;
  return <RoadsideEditor repairOrderId={repairOrderId} saved={saved.data} editable={editable} />;
}

function RoadsideEditor({
  repairOrderId,
  saved,
  editable,
}: {
  repairOrderId: string;
  saved: RoadsideValue;
  editable: boolean;
}) {
  const settings = useSettings();
  const [value, setValue] = useState(saved);
  const save = useRepairOrderMutation(
    (next: RoadsideValue) => updateRepairOrder(repairOrderId, roadsidePatch(next)),
    'Dépannage enregistré',
  );
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  if (!editable && !saved.enabled) return null;
  return (
    <section data-slot="card" className="card" aria-labelledby="ro-roadside">
      <div className="card-h">
        <h2 className="h2" id="ro-roadside">
          <MapPin className="i" /> Lieu d’intervention
        </h2>
      </div>
      <div className="card-b col gap-3">
        {editable ? (
          <>
            <RoadsideFields value={value} onChange={setValue} />
            {dirty && (
              <div className="row justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setValue(saved)}>
                  Annuler
                </Button>
                <Button
                  size="sm"
                  disabled={save.isPending}
                  onClick={() => {
                    const problem = roadsideProblem(value, settings.data?.app);
                    if (problem) toast.error(problem);
                    else save.mutate(value);
                  }}
                >
                  Enregistrer
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-[13.5px]">
            Dépannage extérieur : <b>{saved.address}</b>
            {saved.km !== null && ` · ${String(saved.km).replace('.', ',')} km aller-retour`}
          </p>
        )}
      </div>
    </section>
  );
}
