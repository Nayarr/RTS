import { useNavigate } from 'react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Plus } from 'lucide-react';
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
import { MarginField } from '@/features/catalogs/MarginField';
import {
  addTires,
  ensureSupplier,
  saveTireBrand,
  fetchTireBrands,
  updateTireLot,
  type TireBrand,
  type TireLot,
} from './api';
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  PROFILE_LABELS,
  formatTireSize,
  profilesFor,
  tireSizeKey,
  type TireCategory,
  type TireProfile,
} from './domain';
import { useSuppliers, useTireBrands, useTireLines, useTireMutation } from './hooks';
import {
  addTiresFromForm,
  emptyTire,
  lotUpdateFromForm,
  tireSchema,
  tireToForm,
  type TireValues,
} from './schemas';
import { Seg } from './Seg';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

const findBrand = (brands: TireBrand[], name: string) =>
  brands.find((brand) => normalize(brand.name) === normalize(name));

/** Marque saisie : reprise si elle existe, créée sinon. */
async function brandIdFor(name: string, brands: TireBrand[]) {
  const known = findBrand(brands, name);
  if (known) return known.id;
  await saveTireBrand(null, name);
  const created = findBrand(await fetchTireBrands(), name);
  if (!created) throw new Error('Marque introuvable');
  return created.id;
}

const supplierIdFor = async (name: string) => (name.trim() ? ensureSupplier(name.trim()) : null);

/**
 * Ajout au stock (P02) ou modification d'un lot. Même dimension, marque, modèle et état qu'un
 * lot existant : sa quantité et ses prix sont mis à jour. Marge et prix de vente liés.
 */
export function TireDialog({
  lot = null,
  category: initialCategory = 'pl',
  onClose,
}: {
  lot?: TireLot | null;
  category?: TireCategory;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const editing = lot !== null;
  const brands = useTireBrands();
  const suppliers = useSuppliers();
  const lines = useTireLines();
  const form = useForm<TireValues>({
    resolver: zodResolver(tireSchema),
    defaultValues: lot ? tireToForm(lot) : emptyTire(initialCategory),
  });
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = form;
  const values = useWatch({ control });
  const category = values.category ?? 'pl';
  const existingLine = (lines.data ?? []).find(
    (line) =>
      line.category === category &&
      line.profile === values.profile &&
      line.size !== '' &&
      tireSizeKey(line.size) === tireSizeKey(values.size ?? ''),
  );

  const save = useTireMutation(
    async (form: TireValues) => {
      const supplierId = await supplierIdFor(form.supplier_name);
      if (lot) {
        const brandId = await brandIdFor(form.brand, brands.data ?? []);
        await updateTireLot(lot.id, lotUpdateFromForm(form, brandId, supplierId));
        return lot.id;
      }
      return addTires(addTiresFromForm(form, supplierId));
    },
    (_id, form) =>
      editing
        ? 'Pneu modifié'
        : Number(form.quantity) > 0
          ? `${form.quantity} pneu${Number(form.quantity) > 1 ? 's' : ''} ajouté${Number(form.quantity) > 1 ? 's' : ''} au stock`
          : 'Pneu ajouté au catalogue du stock',
  );

  const setCategory = (next: TireCategory) => {
    setValue('category', next);
    setValue('profile', profilesFor(next)[0] as TireProfile);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Modifier · ${lot.brand_name} ${lot.model} ${lot.size}` : 'Ajouter un pneu au stock'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'La dimension et le profil ne changent pas : pour une autre taille, ajoute un nouveau pneu.'
              : 'Même dimension, marque, modèle et état qu’un pneu existant : sa quantité et ses prix sont mis à jour.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id="tire-form"
          noValidate
          className="col gap-5"
          onSubmit={handleSubmit((form) =>
            save.mutate(form, {
              onSuccess: (id) => {
                onClose();
                if (!editing) void navigate(`/stock/pneumatiques/${id}`);
              },
            }),
          )}
        >
          <section className="col gap-3" aria-label="Le pneu">
            <h3 className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              Le pneu
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <span className="text-sm font-medium">Catégorie</span>
                <Seg
                  label="Catégorie"
                  className="w-full [&>button]:flex-1"
                  value={category}
                  disabled={editing}
                  options={(['pl', 'vul'] as const).map((value) => ({
                    value,
                    label: CATEGORY_LABELS[value],
                  }))}
                  onChange={setCategory}
                />
              </div>
              <div className="field">
                <span className="text-sm font-medium">État</span>
                <Controller
                  control={control}
                  name="condition"
                  render={({ field }) => (
                    <Seg
                      label="État"
                      className="w-full [&>button]:flex-1"
                      value={field.value}
                      options={(['neuf', 'rechape', 'occasion'] as const).map((value) => ({
                        value,
                        label: CONDITION_LABELS[value],
                      }))}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>
            <Controller
              control={control}
              name="size"
              render={({ field }) => (
                <FormField
                  id="tire-size"
                  label="Dimension"
                  className="num"
                  inputMode="text"
                  placeholder="31580225"
                  autoFocus={!editing}
                  readOnly={editing}
                  hint="Tape 31580225 : barres, R et point se mettent tout seuls, comme sur la fiche de contrôle. Ajoute C pour un utilitaire (2356516C)."
                  error={errors.size?.message}
                  value={field.value}
                  onChange={(event) => field.onChange(formatTireSize(event.target.value))}
                  onBlur={field.onBlur}
                />
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id="tire-brand"
                label="Marque"
                list="tire-brands"
                placeholder="Michelin"
                autoComplete="off"
                hint={
                  values.brand && brands.data && !findBrand(brands.data, values.brand)
                    ? 'Nouvelle marque : ajoutée à la liste'
                    : undefined
                }
                error={errors.brand?.message}
                {...register('brand')}
              />
              <datalist id="tire-brands">
                {(brands.data ?? []).map((brand) => (
                  <option key={brand.id} value={brand.name} />
                ))}
              </datalist>
              <FormField id="tire-model" label="Modèle" placeholder="X Multi Z" {...register('model')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <span className="text-sm font-medium">Profil</span>
                <Controller
                  control={control}
                  name="profile"
                  render={({ field }) => (
                    <Seg
                      label="Profil"
                      className="w-full [&>button]:flex-1"
                      value={field.value}
                      disabled={editing}
                      options={profilesFor(category).map((value) => ({
                        value,
                        label: PROFILE_LABELS[value],
                      }))}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              <FormField
                id="tire-load"
                label="Indices charge / vitesse"
                className="num"
                placeholder="156/150 L"
                {...register('load_index')}
              />
            </div>
          </section>

          <section className="col gap-3" aria-label="Stock">
            <h3 className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              Stock
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              {!editing && (
                <>
                  <FormField
                    id="tire-quantity"
                    label="Quantité"
                    inputMode="numeric"
                    className="num"
                    placeholder="0"
                    error={errors.quantity?.message}
                    {...register('quantity')}
                  />
                  <FormField
                    id="tire-min"
                    label="Stock mini"
                    inputMode="numeric"
                    className="num"
                    placeholder={existingLine ? String(existingLine.min_qty) : '0'}
                    hint={
                      existingLine
                        ? `Vide : seuil actuel gardé (${existingLine.min_qty})`
                        : 'En dessous : alerte « À commander »'
                    }
                    error={errors.min_qty?.message}
                    {...register('min_qty')}
                  />
                </>
              )}
              <FormField
                id="tire-location"
                label="Emplacement"
                placeholder="Rack A1"
                {...register('location')}
              />
              <FormField
                id="tire-dot"
                label="DOT (fabrication)"
                className="num"
                placeholder="24/2026"
                {...register('dot')}
              />
            </div>
          </section>

          <section className="col gap-3" aria-label="Prix par pneu">
            <h3 className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              Prix (par pneu)
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <FormField
                id="tire-purchase"
                label="Prix d’achat HT (€)"
                inputMode="decimal"
                className="num"
                error={errors.purchase_price?.message}
                {...register('purchase_price')}
              />
              <MarginField
                id="tire-margin"
                purchase={values.purchase_price ?? ''}
                sale={values.sale_price ?? ''}
                onSale={(sale) => setValue('sale_price', sale, { shouldValidate: true })}
              />
              <FormField
                id="tire-sale"
                label="Prix de vente HT (€)"
                inputMode="decimal"
                className="num"
                error={errors.sale_price?.message}
                {...register('sale_price')}
              />
              <FormField
                id="tire-supplier"
                label="Fournisseur"
                list="tire-suppliers"
                autoComplete="off"
                {...register('supplier_name')}
              />
              <datalist id="tire-suppliers">
                {(suppliers.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.name} />
                ))}
              </datalist>
            </div>
            <p className="alert s-green row items-start gap-2 text-[13px]">
              <Info className="mt-0.5 size-4 shrink-0" />
              Marge et prix de vente liés, comme pour les pièces : (vente - achat) / achat. Montage et
              recyclage restent dans les forfaits pneus.
            </p>
          </section>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="tire-form" disabled={save.isPending}>
            {editing ? (
              'Enregistrer'
            ) : (
              <>
                <Plus /> Ajouter au stock
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
