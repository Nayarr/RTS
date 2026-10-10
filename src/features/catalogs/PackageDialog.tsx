import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PACKAGE_TRIGGER_GROUPS } from '@/features/repair-orders/inspection';
import { savePackage, type ServicePackage } from './api';
import { packagesKey, useCatalogMutation } from './hooks';
import {
  PACKAGE_CATEGORIES,
  packageFromForm,
  packageSchema,
  packageToForm,
  type PackageValues,
} from './package-form';

/** Nouveau forfait, ou modification. */
export function PackageDialog({ pkg, onClose }: { pkg: ServicePackage | null; onClose: () => void }) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PackageValues>({ resolver: zodResolver(packageSchema), defaultValues: packageToForm(pkg) });
  const save = useCatalogMutation(
    packagesKey,
    (values: PackageValues) => savePackage(pkg?.id ?? null, packageFromForm(values)),
    pkg ? 'Forfait modifié' : 'Forfait ajouté',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pkg ? 'Modifier le forfait' : 'Nouveau forfait'}</DialogTitle>
          <DialogDescription>
            Un forfait insère le détail des opérations et son prix (ou temps barème) sur l’OR, le devis ou la
            facture.
          </DialogDescription>
        </DialogHeader>
        <form
          id="package-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField
            id="package-name"
            label="Nom du forfait"
            placeholder="Ex : Forfait disques et plaquettes arrière PL"
            error={errors.name?.message}
            {...register('name')}
          />
          <div className="space-y-2">
            <Label htmlFor="package-category">Catégorie</Label>
            <select id="package-category" className="inp" {...register('category')}>
              {PACKAGE_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="package-hours"
              label="Temps barème (heures)"
              inputMode="decimal"
              placeholder="Ex : 3"
              error={errors.standard_hours?.message}
              {...register('standard_hours')}
            />
            <FormField
              id="package-price"
              label="Prix forfaitaire HT (€)"
              inputMode="decimal"
              placeholder="Ex : 340"
              error={errors.price?.message}
              {...register('price')}
            />
          </div>
          <FormField
            id="package-keywords"
            label="Mots-clés déclencheurs (séparés par des virgules)"
            placeholder="Ex : disque arrière, plaquette arrière"
            {...register('keywords')}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Cases de la fiche de contrôle qui déclenchent ce forfait
            </legend>
            <Controller
              control={control}
              name="trigger_fields"
              render={({ field }) => (
                // Toutes les cases de la fiche, sauf les niveaux
                <div className="col gap-3">
                  {PACKAGE_TRIGGER_GROUPS.map((group) => (
                    <div key={group.title} className="col gap-1.5">
                      <span className="overline">{group.title}</span>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.fields.map(([value, label]) => {
                          const id = `package-trigger-${value.replace('.', '-')}`;
                          return (
                            <div key={value} className="flex items-center gap-2">
                              <Checkbox
                                id={id}
                                checked={field.value.includes(value)}
                                onCheckedChange={(checked) =>
                                  field.onChange(
                                    checked === true
                                      ? [...field.value, value]
                                      : field.value.filter((item) => item !== value),
                                  )
                                }
                              />
                              <Label htmlFor={id} className="font-normal">
                                {label}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="package-details">Détail des opérations (une par ligne)</Label>
            <Textarea
              id="package-details"
              rows={5}
              placeholder={'Dépose des roues arrière\nDémontage des anciens disques et plaquettes\n…'}
              {...register('details')}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="package-form" disabled={save.isPending}>
            {pkg ? 'Enregistrer' : 'Ajouter le forfait'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
