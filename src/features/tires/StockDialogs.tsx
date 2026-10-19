import { useForm, useWatch } from 'react-hook-form';
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
import { decimalText, decimalValue } from '@/lib/numbers';
import { correctTireStock, ensureSupplier, receiveTires, type TireLot } from './api';
import { tiresCount } from './domain';
import { useSuppliers, useTireMutation } from './hooks';
import { correctionSchema, receiveSchema, type CorrectionValues, type ReceiveValues } from './schemas';
import { Seg } from './Seg';

const lotName = (lot: TireLot) => [lot.brand_name, lot.model, lot.size].filter(Boolean).join(' ');

/** Entrée de stock d'un lot : quantité reçue, prix d'achat du pneu, fournisseur, bon de livraison. */
export function ReceiveDialog({ lot, onClose }: { lot: TireLot; onClose: () => void }) {
  const suppliers = useSuppliers();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReceiveValues>({
    resolver: zodResolver(receiveSchema),
    defaultValues: {
      quantity: '',
      purchase_price: decimalText(lot.purchase_price),
      supplier_name: lot.supplier_name ?? '',
      reference: '',
    },
  });
  const save = useTireMutation(
    async (values: ReceiveValues) =>
      receiveTires(lot.id, {
        quantity: Number(values.quantity),
        purchase_price: decimalValue(values.purchase_price),
        supplier_id: values.supplier_name.trim() ? await ensureSupplier(values.supplier_name.trim()) : null,
        reference: values.reference.trim() || null,
      }),
    (_data, values) => `${tiresCount(Number(values.quantity))} entrés en stock`,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entrée de stock · {lotName(lot)}</DialogTitle>
          <DialogDescription>
            Stock actuel : {tiresCount(lot.stock_qty)}. La quantité reçue s’ajoute au stock.
          </DialogDescription>
        </DialogHeader>
        <form
          id="receive-form"
          noValidate
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField
            id="receive-quantity"
            label="Quantité reçue"
            inputMode="numeric"
            className="num"
            autoFocus
            error={errors.quantity?.message}
            {...register('quantity')}
          />
          <FormField
            id="receive-price"
            label="Prix d’achat HT du pneu (€)"
            inputMode="decimal"
            className="num"
            error={errors.purchase_price?.message}
            {...register('purchase_price')}
          />
          <FormField
            id="receive-supplier"
            label="Fournisseur"
            list="receive-suppliers"
            autoComplete="off"
            {...register('supplier_name')}
          />
          <datalist id="receive-suppliers">
            {(suppliers.data ?? []).map((supplier) => (
              <option key={supplier.id} value={supplier.name} />
            ))}
          </datalist>
          <FormField
            id="receive-reference"
            label="Bon de livraison (facultatif)"
            placeholder="BL-44711"
            {...register('reference')}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="receive-form" disabled={save.isPending}>
            Valider l’entrée
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sortie (pneus retirés) ou inventaire (stock compté) : motif obligatoire, l'écart est gardé. */
export function CorrectionDialog({ lot, onClose }: { lot: TireLot; onClose: () => void }) {
  const {
    register,
    control,
    setValue,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CorrectionValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: { mode: 'exit', quantity: '', note: '' },
  });
  const mode = useWatch({ control, name: 'mode' });
  const save = useTireMutation(
    (values: CorrectionValues) =>
      correctTireStock(
        lot.id,
        values.mode === 'exit' ? lot.stock_qty - Number(values.quantity) : Number(values.quantity),
        values.note.trim(),
      ),
    'Stock corrigé',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sortie / correction · {lotName(lot)}</DialogTitle>
          <DialogDescription>
            Stock actuel : {tiresCount(lot.stock_qty)}. Les pneus posés sur un OR sortent seuls à l’émission
            de la facture : ici, seulement la casse, les retours ou l’inventaire.
          </DialogDescription>
        </DialogHeader>
        <form
          id="correction-form"
          noValidate
          className="col gap-3"
          onSubmit={handleSubmit((values) => {
            if (values.mode === 'exit' && Number(values.quantity) > lot.stock_qty) {
              setError('quantity', { message: `Au plus ${tiresCount(lot.stock_qty)}` });
              return;
            }
            save.mutate(values, { onSuccess: onClose });
          })}
        >
          <Seg
            label="Type de correction"
            className="self-start"
            value={mode}
            options={[
              { value: 'exit', label: 'Sortie de pneus' },
              { value: 'count', label: 'Inventaire (stock compté)' },
            ]}
            onChange={(value) => setValue('mode', value)}
          />
          <FormField
            id="correction-quantity"
            label={mode === 'exit' ? 'Pneus sortis' : 'Stock compté'}
            inputMode="numeric"
            className="num"
            autoFocus
            error={errors.quantity?.message}
            {...register('quantity')}
          />
          <FormField
            id="correction-note"
            label="Motif"
            placeholder={mode === 'exit' ? 'Ex : pneu abîmé au stockage' : 'Ex : inventaire mensuel'}
            error={errors.note?.message}
            {...register('note')}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="correction-form" disabled={save.isPending}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
