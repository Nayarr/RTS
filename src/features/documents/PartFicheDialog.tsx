import { useEffect, useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { fetchPart, saveCatalogPart } from '@/features/catalogs/api';
import { partsKey } from '@/features/catalogs/hooks';
import { PartFields } from '@/features/catalogs/PartFields';
import {
  partFromForm,
  partLinePatch,
  partLineSchema,
  partToForm,
  type PartLinePatch,
  type PartLineValues,
  type PartValues,
} from '@/features/catalogs/schemas';
import { decimalText, decimalValue } from '@/lib/numbers';

/** Ligne de pièce d'un devis ou d'une facture. */
export interface PartLine {
  description: string;
  unit_price: number | null;
  quantity: number;
  purchase_price: number | null;
  shipping_cost: number | null;
  brand: string | null;
  manufacturer_ref: string | null;
  oem_ref: string | null;
  part_id: string | null;
}

/**
 * Fiche de la pièce ouverte depuis une ligne du document. Une autre référence, marque ou un autre
 * fournisseur : nouvelle fiche au catalogue (même référence constructeur), l'ancienne ne change pas.
 */
export function PartFicheDialog({
  line,
  onSave,
  onClose,
}: {
  line: PartLine;
  onSave: (patch: PartLinePatch) => Promise<unknown>;
  onClose: () => void;
}) {
  const catalog = useQuery({
    queryKey: [...partsKey, 'fiche', line.part_id],
    queryFn: () => fetchPart(line.part_id ?? ''),
    enabled: Boolean(line.part_id),
  });
  const form = useForm<PartLineValues>({
    resolver: zodResolver(partLineSchema),
    defaultValues: {
      ...partToForm(null),
      designation: line.description,
      manufacturer_ref: line.manufacturer_ref ?? '',
      oem_ref: line.oem_ref ?? '',
      brand: line.brand ?? '',
      purchase_price: decimalText(line.purchase_price),
      shipping_cost: decimalText(
        line.shipping_cost === null ? null : Math.round((line.shipping_cost / line.quantity) * 100) / 100,
      ),
      sale_price: decimalText(line.unit_price),
      quantity: decimalText(line.quantity),
    },
  });
  const quantity = useWatch({ control: form.control, name: 'quantity' });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Fournisseur et référence véhicule : sur la fiche du catalogue, reçue après l'ouverture
  const { supplier_name: supplier, vehicle_ref: vehicle } = partToForm(catalog.data ?? null);
  useEffect(() => {
    form.setValue('supplier_name', supplier);
    form.setValue('vehicle_ref', vehicle);
  }, [form, supplier, vehicle]);

  const submit = form.handleSubmit(async (submitted) => {
    const input = partFromForm(submitted);
    if (input.sale_price === null || input.sale_price === undefined) {
      form.setError('sale_price', { message: 'Indique le prix de vente ou la marge' });
      return;
    }
    setSaving(true);
    try {
      const partId = await saveCatalogPart(input);
      await queryClient.invalidateQueries({ queryKey: partsKey });
      await onSave(partLinePatch(input, decimalValue(submitted.quantity) ?? 1, partId));
      toast.success(
        partId === line.part_id
          ? 'Fiche de la pièce enregistrée'
          : 'Nouvelle pièce ajoutée à la base, l’ancienne ne change pas',
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pièce non enregistrée');
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fiche de la pièce</DialogTitle>
          <DialogDescription>
            Une autre référence, marque ou un autre fournisseur crée une nouvelle pièce dans la base, rangée
            sous la même référence constructeur : la fiche d’origine ne change pas.
          </DialogDescription>
        </DialogHeader>
        <form id="part-fiche-form" noValidate className="space-y-4" onSubmit={(event) => void submit(event)}>
          <PartFields
            form={form as unknown as UseFormReturn<PartValues>}
            idPrefix="part-fiche"
            quantity={quantity}
          />
          <FormField
            id="part-fiche-quantity"
            label="Quantité"
            inputMode="decimal"
            className="num sm:max-w-[10rem]"
            error={form.formState.errors.quantity?.message}
            {...form.register('quantity')}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="part-fiche-form" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
