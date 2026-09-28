import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/features/repair-orders/constants';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { deleteWarrantyClaim, type WarrantyClaim } from './api';
import {
  WARRANTY_FILTERS,
  WARRANTY_META,
  matchesWarrantyFilter,
  warrantyStats,
  type WarrantyFilter,
} from './domain';
import { useWarrantyClaims, useWarrantyMutation } from './hooks';
import { WarrantyDialog } from './WarrantyDialog';

function ClaimCard({
  claim,
  onEdit,
  onDelete,
}: {
  claim: WarrantyClaim;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = WARRANTY_META[claim.status];
  const details = [claim.brand, claim.supplier_name, claim.reference].filter(Boolean).join(' — ');
  return (
    <article aria-label={claim.part_name} className="space-y-1 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="text-left font-bold hover:underline" onClick={onEdit}>
          {claim.part_name}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-sm font-bold" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            aria-label={`Supprimer ${claim.part_name}`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {(details || claim.amount_ht !== null) && (
        <p className="text-sm text-muted-foreground">
          {details}
          {claim.amount_ht !== null && `${details ? ' — ' : ''}${formatEuro(claim.amount_ht)} HT`}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {claim.reason && `${claim.reason} — `}
        {claim.repair_order_id && claim.repair_order_number && (
          <>
            <Link to={`/or/${claim.repair_order_id}`} className="font-medium text-foreground hover:underline">
              {claim.repair_order_number}
            </Link>
            {' — '}
          </>
        )}
        {claim.vehicle_id && claim.vehicle_plate && (
          <>
            <Link
              to={`/vehicules/${claim.vehicle_id}`}
              className="font-medium text-foreground hover:underline"
            >
              {claim.vehicle_plate}
            </Link>
            {' — '}
          </>
        )}
        créé le {formatDate(claim.created_at)}
      </p>
      {claim.notes && <p className="text-sm">{claim.notes}</p>}
    </article>
  );
}

/** Garanties et retours de pièces aux fournisseurs. */
export function WarrantiesPage() {
  const claims = useWarrantyClaims();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<WarrantyFilter>(
    () => WARRANTY_FILTERS.find(({ value }) => value === params.get('filtre'))?.value ?? 'open',
  );
  const [editing, setEditing] = useState<{ claim: WarrantyClaim | null } | null>(null);
  const [toDelete, setToDelete] = useState<WarrantyClaim | null>(null);
  const remove = useWarrantyMutation((id: string) => deleteWarrantyClaim(id), 'Retour supprimé');

  const all = useMemo(() => claims.data ?? [], [claims.data]);
  const list = all.filter((claim) => matchesWarrantyFilter(claim, filter));
  const stats = useMemo(() => warrantyStats(all), [all]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Garanties et retours</h1>
          <p className="text-muted-foreground">Pièces renvoyées aux fournisseurs et leur remboursement.</p>
        </div>
        <Button size="lg" onClick={() => setEditing({ claim: null })}>
          <Plus /> Nouveau retour
        </Button>
      </div>

      {claims.isSuccess && all.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">{stats.openCount}</p>
            <p className="text-sm text-muted-foreground">Retours en cours</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">{formatEuro(stats.pendingAmount)}</p>
            <p className="text-sm text-muted-foreground">Montant en attente</p>
          </div>
          <section aria-label="Retours par fournisseur / marque" className="rounded-lg border bg-card p-3">
            <p className="mb-1 text-sm text-muted-foreground">Retours par fournisseur / marque</p>
            <ul className="text-sm">
              {stats.bySupplier.map(({ label, count }) => (
                <li key={label}>
                  {label} : <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <div role="group" aria-label="Filtrer par statut" className="flex gap-2 overflow-x-auto pb-1">
        {WARRANTY_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
              filter === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {claims.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {claims.isError && <p className="text-destructive">Impossible de charger les retours.</p>}
      {claims.isSuccess && list.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun retour dans cette catégorie.
        </p>
      )}

      <ul className="space-y-3">
        {list.map((claim) => (
          <li key={claim.id}>
            <ClaimCard
              claim={claim}
              onEdit={() => setEditing({ claim })}
              onDelete={() => setToDelete(claim)}
            />
          </li>
        ))}
      </ul>

      {editing && <WarrantyDialog claim={editing.claim} onClose={() => setEditing(null)} />}
      {toDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setToDelete(null)}
          title={`Supprimer le retour « ${toDelete.part_name} » ?`}
          description="Le retour disparaît de la liste. L’historique de l’OR n’est pas modifié."
          confirmLabel="Supprimer"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
        />
      )}
    </div>
  );
}
