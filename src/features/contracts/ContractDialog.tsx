import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import { SuggestField } from '@/components/SuggestField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { NewClientValues } from '@/features/customers/domain';
import { NewClientFields } from '@/features/repair-orders/NewClientFields';
import { todayIso } from '@/features/repair-orders/schemas';
import { useClientEntry } from '@/features/repair-orders/use-client-entry';
import { cn } from '@/lib/utils';
import { endContract, saveContract, type Contract } from './api';
import { contractFromForm, contractSchema, contractToForm, type ContractValues } from './domain';
import { useContractMutation } from './hooks';

/** Nouveau contrat d'entretien, ou modification / fin d'un contrat. */
export function ContractDialog({ contract, onClose }: { contract: Contract | null; onClose: () => void }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ContractValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: contractToForm(contract),
  });
  const clientName = useWatch({ control, name: 'client_name' });
  const clientEntry = useClientEntry(clientName, { label: 'enregistrer le contrat' });
  const save = useContractMutation(
    async ({ values, client }: { values: ContractValues; client: NewClientValues | null }) => {
      const name = client ? await clientEntry.createNewClient(client) : values.client_name;
      return saveContract(contract?.id ?? null, contractFromForm({ ...values, client_name: name }));
    },
    'Contrat enregistré',
  );
  const end = useContractMutation((id: string) => endContract(id, todayIso()), 'Contrat terminé');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn('max-h-[90dvh] overflow-y-auto sm:max-w-lg', clientEntry.isNewClient && 'sm:max-w-2xl')}
      >
        <DialogHeader>
          <DialogTitle>{contract ? 'Contrat d’entretien' : 'Nouveau contrat d’entretien'}</DialogTitle>
          <DialogDescription>
            L’entretien de chaque véhicule est suivi automatiquement (date et kilométrage).
          </DialogDescription>
        </DialogHeader>
        <form
          id="contract-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(
            async (values) => {
              const result = await clientEntry.check(values.client_name);
              if (result.ok) save.mutate({ values, client: result.client }, { onSuccess: onClose });
            },
            () => {
              if (clientEntry.isNewClient) void clientEntry.form.trigger();
            },
          )}
        >
          <Controller
            control={control}
            name="client_name"
            render={({ field }) => (
              <SuggestField
                id="contract-client"
                label="Client"
                placeholder="Nom du client / société"
                error={errors.client_name?.message}
                value={field.value}
                onBlur={field.onBlur}
                onValueChange={field.onChange}
                suggestions={clientEntry.suggestions.map((item) => ({ key: item.id, label: item.name }))}
                onPick={(item) => field.onChange(item.label)}
              />
            )}
          />
          {clientEntry.isNewClient && (
            <NewClientFields form={clientEntry.form} onKindChange={clientEntry.changeKind} />
          )}
          <FormField
            id="contract-service"
            label="Prestation"
            placeholder="Ex : vidange + contrôle général"
            {...register('service_description')}
          />
          <FormField
            id="contract-plates"
            label="Véhicules (immatriculations séparées par des virgules)"
            className="uppercase"
            error={errors.plates?.message}
            {...register('plates')}
          />
          <div className="grid grid-cols-3 gap-3">
            <FormField
              id="contract-months"
              label="Tous les … mois"
              inputMode="numeric"
              error={errors.frequency_months?.message}
              {...register('frequency_months')}
            />
            <FormField
              id="contract-km"
              label="ou tous les … km"
              inputMode="numeric"
              error={errors.frequency_km?.message}
              {...register('frequency_km')}
            />
            <FormField
              id="contract-price"
              label="Prix mensuel HT"
              inputMode="decimal"
              placeholder="Facultatif"
              error={errors.monthly_price_ht?.message}
              {...register('monthly_price_ht')}
            />
          </div>
          <FormField
            id="contract-start"
            label="Début du contrat"
            type="date"
            error={errors.starts_on?.message}
            {...register('starts_on')}
          />
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          {contract?.is_active ? (
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmEnd(true)}>
              Mettre fin au contrat
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" form="contract-form" disabled={save.isPending}>
              Enregistrer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {contract && (
        <ConfirmDialog
          open={confirmEnd}
          onOpenChange={setConfirmEnd}
          title="Mettre fin à ce contrat ?"
          description={`${contract.client_name} : l’entretien de ses véhicules ne sera plus suivi.`}
          confirmLabel="Mettre fin au contrat"
          destructive
          pending={end.isPending}
          onConfirm={() => end.mutate(contract.id, { onSuccess: onClose })}
        />
      )}
    </Dialog>
  );
}
