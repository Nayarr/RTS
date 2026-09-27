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
import { savePart, type Part } from './api';
import { partsKey, useCatalogMutation } from './hooks';
import { partFromForm, partSchema, partToForm, type PartValues } from './schemas';

interface PartDialogProps {
  /** Pièce modifiée, ou `null` pour en ajouter une. */
  part: Part | null;
  onClose: () => void;
}

export function PartDialog({ part, onClose }: PartDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PartValues>({ resolver: zodResolver(partSchema), defaultValues: partToForm(part) });

  const save = useCatalogMutation(
    partsKey,
    (values: PartValues) => savePart(part?.id ?? null, partFromForm(values)),
    part ? 'Pièce mise à jour' : 'Pièce ajoutée au catalogue',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{part ? 'Modifier la pièce' : 'Nouvelle pièce'}</DialogTitle>
          <DialogDescription>
            Les prix sont repris quand la pièce est ajoutée à un OR ou un devis.
          </DialogDescription>
        </DialogHeader>
        <form
          id="part-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField
            id="part-designation"
            label="Désignation"
            error={errors.designation?.message}
            {...register('designation')}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="part-brand" label="Marque" {...register('brand')} />
            <FormField id="part-supplier" label="Fournisseur" {...register('supplier_name')} />
            <FormField id="part-manufacturer-ref" label="Réf. fabricant" {...register('manufacturer_ref')} />
            <FormField id="part-oem-ref" label="Réf. constructeur" {...register('oem_ref')} />
            <FormField
              id="part-purchase"
              label="Prix d’achat HT (€)"
              inputMode="decimal"
              error={errors.purchase_price?.message}
              {...register('purchase_price')}
            />
            <FormField
              id="part-sale"
              label="Prix de vente HT (€)"
              inputMode="decimal"
              error={errors.sale_price?.message}
              {...register('sale_price')}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="part-form" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : part ? 'Enregistrer' : 'Ajouter au catalogue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
