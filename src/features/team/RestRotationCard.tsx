import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateRestReferenceMonday } from './api';
import { restReferenceQueryKey, useRestReferenceMonday } from './hooks';

const isMonday = (iso: string) => new Date(`${iso}T12:00:00`).getDay() === 1;

/** Lundi de référence du repos tournant : ce lundi-là, le groupe A est en repos. */
export function RestRotationCard() {
  const queryClient = useQueryClient();
  const { data: saved, isPending } = useRestReferenceMonday();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved ?? '';

  const save = useMutation({
    mutationFn: updateRestReferenceMonday,
    onSuccess: async () => {
      toast.success('Repos tournant enregistré');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: restReferenceQueryKey });
    },
    onError: () => toast.error('Enregistrement impossible'),
  });

  const invalid = value !== '' && !isMonday(value);

  return (
    <section data-slot="card" className="card" aria-labelledby="rest-rotation">
      <div className="card-h">
        <h2 className="h2" id="rest-rotation">
          Repos tournant
        </h2>
      </div>
      <div className="card-b col gap-3">
        <p className="hint">
          Choisis un lundi où le groupe A était en repos : l’alternance A / B est ensuite calculée
          automatiquement. Le groupe de chaque technicien se règle dans son compte.
        </p>
        <div className="field">
          <Label htmlFor="rest-reference">Lundi de référence (groupe A en repos)</Label>
          <Input
            id="rest-reference"
            type="date"
            className="w-full"
            value={value}
            disabled={isPending}
            aria-invalid={invalid || undefined}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button
          size="sm"
          className="self-end"
          disabled={draft === null || invalid || save.isPending}
          onClick={() => save.mutate(value === '' ? null : value)}
        >
          Enregistrer
        </Button>
        {invalid && <p className="w-full text-sm text-destructive">Cette date n’est pas un lundi.</p>}
      </div>
    </section>
  );
}
