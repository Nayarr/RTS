import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Package, Plus, Type, Wrench } from 'lucide-react';
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
import { CatalogPicker } from '@/features/catalogs/CatalogPicker';
import type { Part } from '@/features/catalogs/api';
import { decimalField, decimalValue, formatEuro } from '@/lib/numbers';
import { addQuoteLine, type NewQuoteLine, type QuoteDetail, type ServicePackage } from '../api';
import { nextPosition, packagesFor } from '../domain';
import { useQuoteMutation, useServicePackages } from '../hooks';

type Dialogs = 'labor' | 'package' | 'part' | null;

const laborSchema = z.object({
  description: z.string().trim().min(1, 'Indique la prestation').max(500),
  hours: decimalField({ required: true, positive: true }),
});
type LaborValues = z.infer<typeof laborSchema>;

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
  detail,
  onAdd,
  onClose,
}: {
  detail: QuoteDetail;
  onAdd: (item: ServicePackage) => void;
  onClose: () => void;
}) {
  const packages = useServicePackages();
  const list = packagesFor(packages.data ?? [], detail.quote.vehicle_type);
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

function PartDialog({ onAdd, onClose }: { onAdd: (part: Part) => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une pièce du catalogue</DialogTitle>
          <DialogDescription>Désignation, références et prix de vente sont repris.</DialogDescription>
        </DialogHeader>
        <CatalogPicker
          onPick={onAdd}
          emptyHint="Aucune pièce correspondante : ajoute une ligne libre et saisis-la."
        />
      </DialogContent>
    </Dialog>
  );
}

/** Ajouts dans « Travaux à prévoir » : remise du client et TVA par défaut appliquées. */
export function AddLineButtons({ detail, vatRate }: { detail: QuoteDetail; vatRate: number }) {
  const [open, setOpen] = useState<Dialogs>(null);
  const { quote, lines, laborRate, clientDiscount } = detail;
  const category = quote.vehicle_type;

  const add = useQuoteMutation(
    (line: NewQuoteLine) =>
      addQuoteLine(quote.id, {
        section: 'planned',
        position: nextPosition(lines, 'planned'),
        vat_rate: vatRate,
        discount_percent: line.line_type === 'text' ? 0 : clientDiscount,
        ...line,
      }),
    null,
  );
  const addAndClose = (line: NewQuoteLine) => add.mutate(line, { onSuccess: () => setOpen(null) });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={add.isPending}
        onClick={() => add.mutate({ line_type: 'labor', labor_category: category })}
      >
        <Plus /> Ajouter une ligne
      </Button>
      <Button variant="outline" onClick={() => setOpen('package')}>
        <Package /> Insérer un forfait
      </Button>
      <Button variant="outline" onClick={() => setOpen('part')}>
        <Wrench /> Ajouter une pièce du catalogue
      </Button>
      <Button variant="outline" onClick={() => setOpen('labor')}>
        <Clock /> Ajouter de la main d’œuvre
      </Button>
      <Button
        variant="outline"
        disabled={add.isPending}
        onClick={() => add.mutate({ line_type: 'text', quantity: 1 })}
      >
        <Type /> Insérer une ligne de texte
      </Button>

      {open === 'labor' && (
        <LaborDialog
          rate={laborRate}
          onClose={() => setOpen(null)}
          onAdd={({ description, hours }) =>
            addAndClose({
              line_type: 'labor',
              description,
              estimated_hours: hours,
              quantity: hours,
              unit_price: laborRate,
              labor_category: category,
            })
          }
        />
      )}
      {open === 'package' && (
        <PackageDialog
          detail={detail}
          onClose={() => setOpen(null)}
          onAdd={(item) =>
            addAndClose({
              line_type: 'package',
              description: item.details ? `${item.name}\n${item.details}` : item.name,
              unit_price: item.price,
              standard_hours: item.standard_hours,
              package_id: item.id,
              labor_category: item.category ?? category,
            })
          }
        />
      )}
      {open === 'part' && (
        <PartDialog
          onClose={() => setOpen(null)}
          onAdd={(part) =>
            addAndClose({
              line_type: 'part',
              description: part.designation,
              unit_price: part.sale_price,
              purchase_price: part.purchase_price,
              supplier_id: part.supplier_id,
              brand: part.brand,
              manufacturer_ref: part.manufacturer_ref,
              oem_ref: part.oem_ref,
              part_id: part.id,
            })
          }
        />
      )}
    </div>
  );
}
