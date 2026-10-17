import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { createClient } from '@/features/customers/api';
import { newClientFromForm, type NewClientValues } from '@/features/customers/domain';
import { NewClientFields } from '@/features/repair-orders/NewClientFields';
import { orNewClientDefaults, orNewClientSchema } from '@/features/repair-orders/schemas';

/**
 * Location ou prêt pour un client pas encore en base : sa fiche complète se remplit ici,
 * sans quitter la location. Le client créé est choisi aussitôt.
 */
export function NewClientInline({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (clientId: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const form = useForm<NewClientValues>({
    resolver: zodResolver(orNewClientSchema),
    defaultValues: orNewClientDefaults('pro', initialName),
  });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const changeKind = (next: NewClientValues['kind']) => {
    const { phone, email, billing_address } = form.getValues();
    form.reset({ ...orNewClientDefaults(next, name), phone, email, billing_address });
  };

  const create = useMutation({
    mutationFn: async (values: NewClientValues) => {
      const id = await createClient(newClientFromForm(values));
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      return id;
    },
    onSuccess: (id) => {
      toast.success('Client créé');
      onCreated(id);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Client non créé'),
  });

  const submit = async () => {
    // Pro : raison sociale saisie ici ; particulier : nom et prénom de la fiche
    const trimmed = name.trim();
    const nameOk = kind === 'individual' || trimmed.length > 0;
    setNameError(nameOk ? null : 'Indique le nom du client');
    if (kind === 'pro') form.setValue('name', trimmed);
    const valid = await form.trigger();
    if (nameOk && valid) create.mutate(form.getValues());
  };

  return (
    <div className="col gap-3">
      {kind === 'pro' && (
        <FormField
          id="rental-new-client-name"
          label="Raison sociale *"
          autoComplete="off"
          value={name}
          error={nameError ?? undefined}
          onChange={(event) => setName(event.target.value)}
        />
      )}
      <NewClientFields form={form} onKindChange={changeKind} />
      <div className="row justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="button" disabled={create.isPending} onClick={() => void submit()}>
          {create.isPending ? 'Création…' : 'Créer le client'}
        </Button>
      </div>
    </div>
  );
}
