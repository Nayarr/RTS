import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
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
import { formatEuro, parseDecimal } from '@/lib/numbers';
import { useRepairOrderMutation } from '../hooks';
import {
  resalePrice,
  SUBCONTRACT_META,
  subcontractFromForm,
  subcontractSchema,
  subcontractToForm,
  type SubcontractValues,
} from '../supplies';
import { deleteSubcontract, saveSubcontract, type Subcontract } from '../supplies-api';

interface SubcontractDialogProps {
  repairOrderId: string;
  /** Travail modifié, ou `null` pour en confier un nouveau. */
  subcontract: Subcontract | null;
  onClose: () => void;
}

/** Travail confié à un prestataire, refacturé avec la marge. */
export function SubcontractDialog({ repairOrderId, subcontract, onClose }: SubcontractDialogProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubcontractValues>({
    resolver: zodResolver(subcontractSchema),
    defaultValues: subcontractToForm(subcontract),
  });
  const [cost, margin] = useWatch({ control, name: ['cost_ht', 'margin_percent'] });
  const resale = resalePrice(parseDecimal(cost), parseDecimal(margin));

  const save = useRepairOrderMutation(
    (values: SubcontractValues) =>
      saveSubcontract(repairOrderId, subcontract?.id ?? null, subcontractFromForm(values, subcontract)),
    subcontract ? 'Sous-traitance mise à jour' : 'Travail confié au prestataire',
  );
  const remove = useRepairOrderMutation((id: string) => deleteSubcontract(id), 'Sous-traitance supprimée');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sous-traitance</DialogTitle>
          <DialogDescription>Refacturée au client au coût plus ta marge.</DialogDescription>
        </DialogHeader>
        <form
          id="subcontract-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField
            id="subcontract-service"
            label="Prestation"
            placeholder="Ex : rectification disques, géométrie, contrôle tachygraphe"
            error={errors.service?.message}
            {...register('service')}
          />
          <FormField
            id="subcontract-supplier"
            label="Prestataire"
            error={errors.supplier_name?.message}
            {...register('supplier_name')}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="subcontract-cost"
              label="Coût HT (€)"
              inputMode="decimal"
              error={errors.cost_ht?.message}
              {...register('cost_ht')}
            />
            <FormField
              id="subcontract-margin"
              label="Marge (%)"
              inputMode="decimal"
              error={errors.margin_percent?.message}
              {...register('margin_percent')}
            />
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Refacturé : <strong className="text-foreground">{formatEuro(resale)} HT</strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              id="subcontract-sent"
              label="Envoyé le"
              type="date"
              error={errors.sent_on?.message}
              {...register('sent_on')}
            />
            <FormField
              id="subcontract-return"
              label="Retour prévu"
              type="date"
              error={errors.expected_return_on?.message}
              {...register('expected_return_on')}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label htmlFor="subcontract-status">Statut</Label>
                  <select
                    id="subcontract-status"
                    className="h-11 w-full rounded-md border bg-transparent px-3 text-base"
                    value={field.value}
                    onChange={field.onChange}
                  >
                    {Object.entries(SUBCONTRACT_META).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            />
          </div>
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          {subcontract ? (
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" form="subcontract-form" disabled={save.isPending}>
              {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {subcontract && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Supprimer « ${subcontract.service} » ?`}
          description="Ce travail sous-traité ne sera plus refacturé."
          confirmLabel="Supprimer"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(subcontract.id, { onSuccess: onClose })}
        />
      )}
    </Dialog>
  );
}
