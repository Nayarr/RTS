import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { formatHours } from '@/features/repair-orders/constants';
import { formatEuro } from '@/lib/numbers';
import { removePackage, type ServicePackage } from './api';
import { CatalogTabs } from './CatalogTabs';
import { packagesKey, useCatalogMutation, usePackages } from './hooks';
import { PackageDialog } from './PackageDialog';
import { categoryLabel, wearFieldLabel } from './package-form';

/** Forfaits d'entretien (direction) : détectés sur les OR par mots-clés ou par la fiche de contrôle. */
export function PackagesPage() {
  const packages = usePackages();
  const [editing, setEditing] = useState<{ pkg: ServicePackage | null } | null>(null);
  const [toRemove, setToRemove] = useState<ServicePackage | null>(null);
  const remove = useCatalogMutation(packagesKey, (id: string) => removePackage(id), 'Forfait supprimé');

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Stock et catalogues</h1>
        <Button onClick={() => setEditing({ pkg: null })}>
          <Plus /> Nouveau forfait
        </Button>
      </div>
      <CatalogTabs />
      <p className="text-sm text-muted-foreground">
        Un forfait remplace automatiquement une ligne de travaux quand tous les mots d’un de ses mots-clés s’y
        trouvent, ou quand une case de la fiche de contrôle passe à « HS » ou « 50 % ».
      </p>

      {packages.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {packages.isError && <p className="text-destructive">Impossible de charger les forfaits.</p>}
      {packages.isSuccess && packages.data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun forfait pour l’instant.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(packages.data ?? []).map((pkg) => (
          <li key={pkg.id} className="min-w-0">
            <article
              aria-label={pkg.name}
              className="flex h-full flex-col gap-2 rounded-lg border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <strong>{pkg.name}</strong>
                <div className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Modifier ${pkg.name}`}
                    onClick={() => setEditing({ pkg })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`Supprimer ${pkg.name}`}
                    onClick={() => setToRemove(pkg)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {categoryLabel(pkg.category)} — {formatHours(pkg.standard_hours)} barème
                {pkg.price !== null ? ` — ${formatEuro(pkg.price)} HT` : ''}
              </p>
              {pkg.keywords.length > 0 && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Mots-clés : </span>
                  {pkg.keywords.join(', ')}
                </p>
              )}
              {pkg.trigger_fields.length > 0 && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Fiche de contrôle : </span>
                  {pkg.trigger_fields.map(wearFieldLabel).join(', ')}
                </p>
              )}
              {pkg.details && (
                <p className="text-sm whitespace-pre-line text-muted-foreground">{pkg.details}</p>
              )}
            </article>
          </li>
        ))}
      </ul>

      {editing && <PackageDialog pkg={editing.pkg} onClose={() => setEditing(null)} />}
      {toRemove && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setToRemove(null)}
          title={`Supprimer « ${toRemove.name} » ?`}
          description="Il ne sera plus proposé ni détecté. Les OR, devis et factures qui l’utilisent ne changent pas."
          confirmLabel="Supprimer"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toRemove.id, { onSuccess: () => setToRemove(null) })}
        />
      )}
    </div>
  );
}
