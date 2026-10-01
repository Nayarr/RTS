import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle>Repos tournant</CardTitle>
        <CardDescription>
          Choisis un lundi où le groupe A était en repos : l’alternance A / B est ensuite calculée
          automatiquement. Le groupe de chaque technicien se règle dans son compte.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="rest-reference">Lundi de référence (groupe A en repos)</Label>
          <Input
            id="rest-reference"
            type="date"
            className="w-48"
            value={value}
            disabled={isPending}
            aria-invalid={invalid || undefined}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button
          disabled={draft === null || invalid || save.isPending}
          onClick={() => save.mutate(value === '' ? null : value)}
        >
          Enregistrer
        </Button>
        {invalid && <p className="w-full text-sm text-destructive">Cette date n’est pas un lundi.</p>}
      </CardContent>
    </Card>
  );
}
