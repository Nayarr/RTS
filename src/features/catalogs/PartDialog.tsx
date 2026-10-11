import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { PartFields } from './PartFields';
import { partFromForm, partSchema, partToForm, type PartValues } from './schemas';

interface PartDialogProps {
  /** Pièce modifiée, ou `null` pour en ajouter une. */
  part: Part | null;
  onClose: () => void;
}

export function PartDialog({ part, onClose }: PartDialogProps) {
  const form = useForm<PartValues>({ resolver: zodResolver(partSchema), defaultValues: partToForm(part) });

  const save = useCatalogMutation(
    partsKey,
    (values: PartValues) => savePart(part?.id ?? null, partFromForm(values)),
    part ? 'Pièce mise à jour' : 'Pièce ajoutée à la base',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{part ? 'Modifier la pièce' : 'Nouvelle pièce'}</DialogTitle>
          <DialogDescription>
            Proposée ensuite quand une pièce est ajoutée à un devis, une facture ou un OR.
          </DialogDescription>
        </DialogHeader>
        <form
          id="part-form"
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <PartFields form={form} idPrefix="part" />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="part-form" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : part ? 'Enregistrer' : 'Ajouter à la base'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
