import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { formatHours } from '@/features/repair-orders/constants';
import { formatEuro } from '@/lib/numbers';
import { removePackage, type ServicePackage } from './api';
import { CatalogTabs } from './CatalogTabs';
import { packagesKey, useCatalogMutation, usePackages } from './hooks';
import { PackageDialog } from './PackageDialog';
import { categoryLabel, wearFieldLabel } from './package-form';
import { cn } from '@/lib/utils';

const CATEGORY_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'pl', label: 'PL' },
  { value: 'vul', label: 'VUL' },
  { value: 'remorque', label: 'Remorque' },
] as const;

/** Forfaits d'entretien (direction) : détectés sur les OR par mots-clés ou par la fiche de contrôle. */
export function PackagesPage() {
  const packages = usePackages();
  const [editing, setEditing] = useState<{ pkg: ServicePackage | null } | null>(null);
  const [toRemove, setToRemove] = useState<ServicePackage | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORY_FILTERS)[number]['value']>('all');
  const remove = useCatalogMutation(packagesKey, (id: string) => removePackage(id), 'Forfait supprimé');

  const list = (packages.data ?? []).filter(
    (pkg) => category === 'all' || pkg.category === null || pkg.category === category,
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Stock et catalogues' }, { label: 'Forfaits' }]}
        title="Forfaits"
        actions={
          <>
            <span className="sub hidden xl:inline">
              Détectés automatiquement dans la tâche de l’OR grâce aux mots-clés
            </span>
            <Button onClick={() => setEditing({ pkg: null })}>
              <Plus /> Nouveau forfait
            </Button>
          </>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <CatalogTabs />
          <div className="seg" role="group" aria-label="Type de véhicule">
            {CATEGORY_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(category === option.value && 'on')}
                aria-pressed={category === option.value}
                onClick={() => setCategory(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">
          Un forfait remplace automatiquement une ligne de travaux quand tous les mots d’un de ses mots-clés
          s’y trouvent, ou quand une case de la fiche de contrôle passe à « HS » ou « 50 % ».
        </p>

        {packages.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {packages.isError && <p className="text-destructive">Impossible de charger les forfaits.</p>}
        {packages.isSuccess && list.length === 0 && <p className="empty">Aucun forfait pour l’instant.</p>}

        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((pkg) => (
            <li key={pkg.id} className="min-w-0">
              <article aria-label={pkg.name} className="card flex h-full flex-col">
                <div className="card-h items-start">
                  <div className="col gap-1">
                    <b className="text-[15px]">{pkg.name}</b>
                    <span className="row gap-1.5">
                      <span className="tag">{categoryLabel(pkg.category)}</span>
                      <span className="hint">{formatHours(pkg.standard_hours)} barème</span>
                    </span>
                  </div>
                  <div className="row shrink-0 gap-0.5">
                    <button
                      type="button"
                      className="ibtn sm ghost"
                      aria-label={`Modifier ${pkg.name}`}
                      onClick={() => setEditing({ pkg })}
                    >
                      <Pencil className="i s" />
                    </button>
                    <button
                      type="button"
                      className="ibtn sm ghost text-destructive"
                      aria-label={`Supprimer ${pkg.name}`}
                      onClick={() => setToRemove(pkg)}
                    >
                      <Trash2 className="i s" />
                    </button>
                  </div>
                </div>
                <div className="card-b col grow gap-2.5">
                  {pkg.details && <p className="hint whitespace-pre-line">{pkg.details}</p>}
                  {pkg.keywords.length > 0 && (
                    <div className="row wrap gap-1.5">
                      <span className="hint">Mots-clés :</span>
                      {pkg.keywords.map((keyword) => (
                        <span key={keyword} className="tag">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                  {pkg.trigger_fields.length > 0 && (
                    <span className="hint">
                      Fiche de contrôle :{' '}
                      <b className="text-foreground">{pkg.trigger_fields.map(wearFieldLabel).join(', ')}</b>
                    </span>
                  )}
                </div>
                <div className="tfoot">
                  <span className="hint">Prix forfaitaire HT</span>
                  <b className="disp num text-[22px]">{pkg.price !== null ? formatEuro(pkg.price) : '—'}</b>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>

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
    </>
  );
}
