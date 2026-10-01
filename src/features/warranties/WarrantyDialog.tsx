import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { saveWarrantyClaim, type WarrantyClaim } from './api';
import {
  WARRANTY_META,
  WARRANTY_STATUSES,
  warrantyFromForm,
  warrantySchema,
  warrantyToForm,
  type WarrantyPreset,
  type WarrantyValues,
} from './domain';
import { useWarrantyMutation } from './hooks';

function description(claim: WarrantyClaim | null, fromPart: boolean) {
  if (claim?.repair_order_number) {
    return `Pièce de l’OR ${claim.repair_order_number}${claim.vehicle_plate ? ` — ${claim.vehicle_plate}` : ''}.`;
  }
  if (fromPart) return 'Le retour est rattaché à l’OR, au véhicule et au client.';
  return 'Pièce renvoyée au fournisseur : défaut, erreur de référence, casse…';
}

/** Nouveau retour / garantie (libre ou depuis une pièce d'OR), ou suivi d'un retour existant. */
export function WarrantyDialog({
  claim,
  preset,
  roLineId = null,
  onClose,
}: {
  claim: WarrantyClaim | null;
  preset?: WarrantyPreset;
  roLineId?: string | null;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WarrantyValues>({
    resolver: zodResolver(warrantySchema),
    defaultValues: warrantyToForm(claim, preset),
  });
  const save = useWarrantyMutation(
    (values: WarrantyValues) => saveWarrantyClaim(claim?.id ?? null, warrantyFromForm(values), roLineId),
    'Retour enregistré',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{claim ? 'Retour / garantie' : 'Nouveau retour / garantie'}</DialogTitle>
          <DialogDescription>{description(claim, roLineId !== null)}</DialogDescription>
        </DialogHeader>
        <form
          id="warranty-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField
            id="warranty-part"
            label="Pièce"
            error={errors.part_name?.message}
            {...register('part_name')}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="warranty-brand" label="Marque" {...register('brand')} />
            <FormField id="warranty-supplier" label="Fournisseur" {...register('supplier_name')} />
            <FormField id="warranty-reference" label="Référence" {...register('reference')} />
            <FormField
              id="warranty-amount"
              label="Montant HT (€)"
              inputMode="decimal"
              error={errors.amount_ht?.message}
              {...register('amount_ht')}
            />
          </div>
          <FormField
            id="warranty-reason"
            label="Motif du retour"
            placeholder="Ex : défaut, erreur de référence, casse…"
            {...register('reason')}
          />
          <div className="space-y-2">
            <Label htmlFor="warranty-status">Statut</Label>
            <select
              id="warranty-status"
              className="inp"
              {...register('status')}
            >
              {WARRANTY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {WARRANTY_META[status].label}
                </option>
              ))}
            </select>
          </div>
          <FormField id="warranty-notes" label="Notes (n° de retour, contact…)" {...register('notes')} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="warranty-form" disabled={save.isPending}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
