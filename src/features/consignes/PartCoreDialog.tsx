import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/FormField';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { deletePartCore, updatePartCore, type PartCore } from './api';
import {
  PART_CORE_META,
  PART_CORE_STATUSES,
  partCoreFromForm,
  partCoreSchema,
  partCoreToForm,
  type PartCoreValues,
} from './domain';
import { usePartCoreMutation } from './hooks';

/** Suivi d'une consigne par le bureau : montant, renvoi, remboursement, ou retrait. */
export function PartCoreDialog({ core, onClose }: { core: PartCore; onClose: () => void }) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PartCoreValues>({
    resolver: zodResolver(partCoreSchema),
    defaultValues: partCoreToForm(core),
  });
  const status = useWatch({ control, name: 'status' });
  const [removing, setRemoving] = useState(false);
  const save = usePartCoreMutation(
    (values: PartCoreValues) => updatePartCore(core.id, partCoreFromForm(values)),
    'Consigne enregistrée',
  );
  const remove = usePartCoreMutation(() => deletePartCore(core.id), 'Consigne retirée');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Consigne · {core.part_name}</DialogTitle>
          <DialogDescription>
            Ancienne pièce de l’OR {core.repair_order_number}
            {core.vehicle_plate ? ` · ${core.vehicle_plate}` : ''}, à renvoyer au fournisseur pour le
            remboursement de la consigne.
          </DialogDescription>
        </DialogHeader>
        <form
          id="part-core-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="part-core-supplier" label="Fournisseur" {...register('supplier_name')} />
            <FormField
              id="part-core-amount"
              label="Consigne HT (€)"
              inputMode="decimal"
              className="num"
              error={errors.amount_ht?.message}
              {...register('amount_ht')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="part-core-status">Statut</Label>
            <select id="part-core-status" className="inp" {...register('status')}>
              {PART_CORE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PART_CORE_META[value].label}
                </option>
              ))}
            </select>
          </div>
          {status !== 'to_return' && (
            <FormField
              id="part-core-returned-on"
              label="Renvoyée le"
              type="date"
              hint="Vide : aujourd’hui"
              {...register('returned_on')}
            />
          )}
          {status === 'refunded' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id="part-core-refunded-on"
                label="Remboursée le"
                type="date"
                hint="Vide : aujourd’hui"
                error={errors.refunded_on?.message}
                {...register('refunded_on')}
              />
              <FormField
                id="part-core-refunded-amount"
                label="Avoir reçu HT (€)"
                inputMode="decimal"
                className="num"
                hint="Vide : montant de la consigne"
                error={errors.refunded_amount_ht?.message}
                {...register('refunded_amount_ht')}
              />
            </div>
          )}
          <FormField id="part-core-notes" label="Notes (n° d’avoir, bon de retour…)" {...register('notes')} />
        </form>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-destructive" onClick={() => setRemoving(true)}>
            Retirer la consigne
          </Button>
          <span className="row gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" form="part-core-form" disabled={save.isPending}>
              {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Retirer la consigne de ${core.part_name} ?`}
        description="L’ancienne pièce ne sera plus à renvoyer. La pièce reste sur l’OR."
        confirmLabel="Retirer"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onClose })}
      />
    </Dialog>
  );
}
