import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Droplet, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/features/repair-orders/schemas';
import { mileageValue } from '@/features/repair-orders/upcoming-work';
import { addOilChange, deleteOilChange, fetchOilChanges } from '@/features/repair-orders/upcoming-work-api';

const frenchDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Historique de la fiche véhicule : vidanges faites hors atelier, dites par le client (à la création
 * de l'OR ou ici). Elles comptent pour proposer la prochaine vidange.
 */
export function DeclaredOilChangesCard({ vehicleId }: { vehicleId: string }) {
  const queryClient = useQueryClient();
  const key = ['vehicles', vehicleId, 'oil-changes'];
  const changes = useQuery({ queryKey: key, queryFn: () => fetchOilChanges(vehicleId) });
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [mileage, setMileage] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['vehicles', vehicleId] });

  const add = useMutation({
    mutationFn: () => addOilChange({ vehicleId, date, mileage: mileageValue(mileage) }),
    onSuccess: async () => {
      toast.success('Vidange notée');
      setAdding(false);
      setDate('');
      setMileage('');
      await refresh();
    },
    onError: () => toast.error('Vidange non enregistrée'),
  });
  const remove = useMutation({
    mutationFn: deleteOilChange,
    onSuccess: refresh,
    onError: () => toast.error('Vidange non supprimée'),
  });
  const list = changes.data ?? [];

  return (
    <section data-slot="card" className="card" aria-labelledby="vehicle-oil-changes">
      <div className="card-h">
        <h2 className="h2" id="vehicle-oil-changes">
          <Droplet className="i" /> Vidanges hors atelier
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(!adding)}>
          <Plus /> Ajouter
        </Button>
      </div>
      <div className="card-b col gap-3">
        {list.length === 0 && !adding && (
          <p className="hint">
            Aucune vidange dite par le client. Celles faites à l’atelier sont dans les passages.
          </p>
        )}
        {list.length > 0 && (
          <ul aria-label="Vidanges hors atelier">
            {list.map((change) => (
              <li key={change.id} className="row between gap-2 border-b py-2 last:border-b-0">
                <span>
                  Vidange du <b className="num">{frenchDate(change.date)}</b>
                  {change.mileage !== null && ` · ${change.mileage.toLocaleString('fr-FR')} km`}
                  <span className="hint"> · dite par le client</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Supprimer la vidange du ${frenchDate(change.date)}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(change.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {adding && (
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <FormField
              id="oil-change-date"
              label="Date de la vidange"
              type="date"
              max={todayIso()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <FormField
              id="oil-change-mileage"
              label="Kilométrage (facultatif)"
              inputMode="numeric"
              className="num"
              value={mileage}
              onChange={(event) => setMileage(event.target.value)}
            />
            <Button type="button" disabled={!date || add.isPending} onClick={() => add.mutate()}>
              Enregistrer
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
