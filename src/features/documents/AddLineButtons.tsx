import { useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleDot, Clock, Package, Plus, Type, Wrench } from 'lucide-react';
import { z } from 'zod';
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
import { toast } from 'sonner';
import { saveCatalogPart, type Part } from '@/features/catalogs/api';
import { PartFields } from '@/features/catalogs/PartFields';
import { partFromForm, partSchema, partToForm, type PartValues } from '@/features/catalogs/schemas';
import { decimalField, decimalValue, formatEuro } from '@/lib/numbers';
import { useServicePackages } from './hooks';
import { packagesFor, type NewLine, type ServicePackage, type VehicleType } from './lines';
import { PartSuggestions } from '@/features/catalogs/PartSuggestions';
import { useQueryClient } from '@tanstack/react-query';
import { partsKey } from '@/features/catalogs/hooks';
import { TirePickDialog } from '@/features/tires/TirePickDialog';

type Dialogs = 'labor' | 'package' | 'part' | 'tires' | null;

const laborSchema = z.object({
  description: z.string().trim().min(1, 'Indique la prestation').max(500),
  hours: decimalField({ required: true, positive: true }),
});
type LaborValues = z.infer<typeof laborSchema>;

const partLineSchema = partSchema.extend({ quantity: decimalField({ required: true, positive: true }) });
type PartLineValues = z.infer<typeof partLineSchema>;

function LaborDialog({
  rate,
  onAdd,
  onClose,
}: {
  rate: number;
  onAdd: (values: { description: string; hours: number }) => void;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LaborValues>({
    resolver: zodResolver(laborSchema),
    defaultValues: { description: '', hours: '' },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Main d’œuvre</DialogTitle>
          <DialogDescription>
            Chiffrée au taux horaire applicable : {formatEuro(rate)} HT / h.
          </DialogDescription>
        </DialogHeader>
        <form
          id="labor-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) =>
            onAdd({ description: values.description.trim(), hours: decimalValue(values.hours) ?? 0 }),
          )}
        >
          <FormField
            id="labor-description"
            label="Prestation"
            placeholder="Ex : Remplacement disques et plaquettes avant"
            error={errors.description?.message}
            {...register('description')}
          />
          <FormField
            id="labor-hours"
            label="Temps (heures)"
            inputMode="decimal"
            placeholder="Ex : 2,5"
            error={errors.hours?.message}
            {...register('hours')}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="labor-form">
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PackageDialog({
  vehicleType,
  onAdd,
  onClose,
}: {
  vehicleType: VehicleType;
  onAdd: (item: ServicePackage) => void;
  onClose: () => void;
}) {
  const packages = useServicePackages();
  const list = packagesFor(packages.data ?? [], vehicleType);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Insérer un forfait</DialogTitle>
          <DialogDescription>Forfaits applicables à ce type de véhicule.</DialogDescription>
        </DialogHeader>
        {packages.isSuccess && list.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun forfait défini pour ce type de véhicule.</p>
        )}
        <ul className="divide-y rounded-md border">
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                onClick={() => onAdd(item)}
              >
                <span>
                  <span className="font-medium">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    Barème {String(item.standard_hours).replace('.', ',')} h
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatEuro(item.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pièce saisie directement : propositions de la base pendant la frappe (désignation ou
 * référence), puis enregistrement dans la base avant l'ajout de la ligne.
 */
function PartDialog({ onAdd, onClose }: { onAdd: (line: NewLine) => Promise<unknown>; onClose: () => void }) {
  const form = useForm<PartLineValues>({
    resolver: zodResolver(partLineSchema),
    defaultValues: { ...partToForm(null), quantity: '1' },
  });
  const [picked, setPicked] = useState<Part | null>(null);
  const designation = useWatch({ control: form.control, name: 'designation' });
  const quantity = useWatch({ control: form.control, name: 'quantity' });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const pick = (part: Part) => {
    setPicked(part);
    form.reset({ ...partToForm(part), quantity: form.getValues('quantity') });
  };

  const submit = form.handleSubmit(async (values) => {
    const input = partFromForm(values);
    if (input.sale_price === null || input.sale_price === undefined) {
      form.setError('sale_price', { message: 'Indique le prix de vente ou la marge' });
      return;
    }
    const quantity = decimalValue(values.quantity) ?? 1;
    const shipping = input.shipping_cost ?? null;
    setSaving(true);
    try {
      // Même désignation, référence et marque : pièce du catalogue mise à jour ; sinon nouvelle pièce
      const partId = await saveCatalogPart(input);
      await queryClient.invalidateQueries({ queryKey: partsKey });
      await onAdd({
        line_type: 'part',
        description: input.designation,
        unit_price: input.sale_price,
        quantity,
        purchase_price: input.purchase_price ?? null,
        shipping_cost: shipping === null ? null : Math.round(shipping * quantity * 100) / 100,
        brand: input.brand ?? null,
        manufacturer_ref: input.manufacturer_ref ?? null,
        oem_ref: input.oem_ref ?? null,
        part_id: partId,
      });
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
          <DialogTitle>Ajouter une pièce</DialogTitle>
          <DialogDescription>
            Choisis une pièce de la base pour repartir de ses informations. Si la désignation, la référence et
            la marque restent les mêmes, ses prix sont mis à jour ; sinon une nouvelle pièce est créée.
          </DialogDescription>
        </DialogHeader>
        <form id="part-line-form" noValidate className="space-y-4" onSubmit={submit}>
          <PartFields
            form={form as unknown as UseFormReturn<PartValues>}
            idPrefix="part-line"
            quantity={quantity}
            designation={
              <div className="space-y-2">
                <FormField
                  id="part-line-designation"
                  label="Désignation"
                  autoComplete="off"
                  placeholder="Désignation ou référence"
                  error={form.formState.errors.designation?.message}
                  {...form.register('designation')}
                />
                {picked ? (
                  <p className="hint flex flex-wrap items-center gap-2">
                    Repris de la base : modifie ce qu’il faut avant d’ajouter.
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setPicked(null);
                        form.reset({ ...partToForm(null), quantity: form.getValues('quantity') });
                      }}
                    >
                      Nouvelle pièce
                    </button>
                  </p>
                ) : (
                  <PartSuggestions text={designation} hidden={false} onPick={pick} />
                )}
              </div>
            }
          />
          <FormField
            id="part-line-quantity"
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
          <Button type="submit" form="part-line-form" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Ajouter la pièce'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Boutons d'ajout de l'ancienne appli : ligne libre, forfait, pièce (saisie et gardée dans la base),
 * main d'œuvre au taux applicable, texte. Le document enregistre la ligne (`onAdd`).
 */
export function AddLineButtons({
  vehicleType,
  laborRate,
  onAdd,
  tires,
}: {
  vehicleType: VehicleType;
  laborRate: number;
  onAdd: (line: NewLine) => Promise<unknown>;
  /** Pneus du stock (taille relevée sur la fiche de contrôle de l'OR). */
  tires?: {
    documentLabel: 'devis' | 'facture';
    repairOrderId: string | null;
    repairOrderNumber: string | null;
  };
}) {
  const [open, setOpen] = useState<Dialogs>(null);
  const [pending, setPending] = useState(false);

  const add = (line: NewLine) => {
    setPending(true);
    onAdd(line)
      .then(() => setOpen(null))
      .catch(() => undefined) // l'erreur est déjà signalée par le document
      .finally(() => setPending(false));
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => add({ line_type: 'labor', labor_category: vehicleType })}
      >
        <Plus /> Ajouter une ligne
      </Button>
      <Button variant="outline" size="sm" onClick={() => setOpen('package')}>
        <Package /> Insérer un forfait
      </Button>
      <Button variant="outline" size="sm" onClick={() => setOpen('part')}>
        <Wrench /> Ajouter une pièce
      </Button>
      {tires && (
        <Button variant="outline" size="sm" onClick={() => setOpen('tires')}>
          <CircleDot /> Pneus du stock
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => setOpen('labor')}>
        <Clock /> Ajouter de la main d’œuvre
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => add({ line_type: 'text', quantity: 1 })}
      >
        <Type /> Insérer une ligne de texte
      </Button>

      {open === 'labor' && (
        <LaborDialog
          rate={laborRate}
          onClose={() => setOpen(null)}
          onAdd={({ description, hours }) =>
            add({
              line_type: 'labor',
              description,
              hours,
              quantity: hours,
              unit_price: laborRate,
              labor_category: vehicleType,
            })
          }
        />
      )}
      {open === 'package' && (
        <PackageDialog
          vehicleType={vehicleType}
          onClose={() => setOpen(null)}
          onAdd={(item) =>
            add({
              line_type: 'package',
              description: item.details ? `${item.name}\n${item.details}` : item.name,
              unit_price: item.price,
              standard_hours: item.standard_hours,
              package_id: item.id,
              labor_category: item.category ?? vehicleType,
            })
          }
        />
      )}
      {open === 'tires' && tires && (
        <TirePickDialog vehicleType={vehicleType} {...tires} onClose={() => setOpen(null)} onAdd={onAdd} />
      )}
      {open === 'part' && (
        <PartDialog
          onClose={() => setOpen(null)}
          // Fenêtre fermée une fois la ligne enregistrée (l'erreur est signalée par le document)
          onAdd={(line) => onAdd(line).then(() => setOpen(null))}
        />
      )}
    </div>
  );
}
