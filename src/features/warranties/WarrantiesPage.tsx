import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Euro, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { FilterChips } from '@/components/ListControls';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/features/repair-orders/constants';
import { formatEuro } from '@/lib/numbers';
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

function ClaimRow({
  claim,
  onEdit,
  onDelete,
}: {
  claim: WarrantyClaim;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = WARRANTY_META[claim.status];
  return (
    <tr>
      <td>
        <span className="c2">
          <button
            type="button"
            className="cursor-pointer text-left font-semibold hover:underline"
            onClick={onEdit}
          >
            {claim.part_name}
          </button>
          <span>
            {claim.reference ? `Réf. ${claim.reference}` : '—'}
            {claim.notes && ` · ${claim.notes}`}
          </span>
        </span>
      </td>
      <td>
        {[claim.supplier_name, claim.brand].filter(Boolean).join(' · ') || <span className="muted">—</span>}
      </td>
      <td className="muted max-w-[280px] whitespace-normal">{claim.reason ?? '—'}</td>
      <td>
        <span className="col gap-0">
          {claim.repair_order_id && claim.repair_order_number && (
            <Link to={`/or/${claim.repair_order_id}`} className="ul">
              {claim.repair_order_number}
            </Link>
          )}
          {claim.vehicle_id && claim.vehicle_plate && (
            <Link to={`/vehicules/${claim.vehicle_id}`} className="hint hover:underline">
              {claim.vehicle_plate}
            </Link>
          )}
          {!claim.repair_order_number && !claim.vehicle_plate && <span className="muted">—</span>}
        </span>
      </td>
      <td className="r num b">{claim.amount_ht !== null ? formatEuro(claim.amount_ht) : '—'}</td>
      <td>
        <span className="col gap-0.5">
          <span className="badge" style={{ '--c': meta.color } as CSSProperties}>
            {meta.label}
          </span>
          <span className="hint">créé le {formatDate(claim.created_at)}</span>
        </span>
      </td>
      <td>
        <span className="row gap-0.5">
          <button
            type="button"
            className="ibtn sm ghost"
            aria-label={`Modifier ${claim.part_name}`}
            onClick={onEdit}
          >
            <Pencil className="i s" />
          </button>
          <button
            type="button"
            className="ibtn sm ghost text-destructive"
            aria-label={`Supprimer ${claim.part_name}`}
            onClick={onDelete}
          >
            <Trash2 className="i s" />
          </button>
        </span>
      </td>
    </tr>
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
  const maxSupplier = Math.max(1, ...stats.bySupplier.map(({ count }) => count));
  const chipOrder: WarrantyFilter[] = ['open', 'to_return', 'sent', 'accepted', 'refunded', 'refused', 'all'];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Facturation' }, { label: 'Garanties et retours' }]}
        title="Garanties et retours"
        actions={
          <>
            <span className="sub hidden md:inline">
              Pièces renvoyées aux fournisseurs et leur remboursement
            </span>
            <Button onClick={() => setEditing({ claim: null })}>
              <Plus /> Nouveau retour
            </Button>
          </>
        }
      />

      {claims.isSuccess && all.length > 0 && (
        <div className="grid gap-3.5 md:grid-cols-[1fr_1fr_2fr]">
          <div className="card kpi">
            <span className="kpi-ico">
              <Undo2 className="i s" />
            </span>
            <div className="col gap-1">
              <span className="kpi-v">{stats.openCount}</span>
              <span className="kpi-l">Retours en cours</span>
            </div>
          </div>
          <div className="card kpi">
            <span className="kpi-ico">
              <Euro className="i s" />
            </span>
            <div className="col gap-1">
              <span className="kpi-v">{formatEuro(stats.pendingAmount)}</span>
              <span className="kpi-l">Montant en attente (HT)</span>
            </div>
          </div>
          <section className="card kpi gap-2.5" aria-label="Retours par fournisseur / marque">
            <span className="kpi-l">Retours par fournisseur / marque</span>
            <ul className="col gap-2">
              {stats.bySupplier.map(({ label, count }) => (
                <li key={label} className="row gap-2.5">
                  <span className="w-[140px] truncate text-[13px]">{label}</span>
                  <div className="bar" aria-hidden>
                    <i style={{ width: `${(count / maxSupplier) * 100}%` }} />
                  </div>
                  <b className="num w-[18px]">{count}</b>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <FilterChips
        label="Filtrer par statut"
        value={filter}
        onChange={setFilter}
        options={chipOrder.map((value) => ({
          value,
          label: WARRANTY_FILTERS.find((option) => option.value === value)?.label ?? value,
          count: all.filter((claim) => matchesWarrantyFilter(claim, value)).length,
          color:
            value in WARRANTY_META ? WARRANTY_META[value as keyof typeof WARRANTY_META].color : undefined,
        }))}
      />

      {claims.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {claims.isError && <p className="text-destructive">Impossible de charger les retours.</p>}
      {claims.isSuccess && list.length === 0 && <p className="empty">Aucun retour dans cette catégorie.</p>}

      {list.length > 0 && (
        <div className="card tbl-wrap overflow-x-auto!">
          <table className="tbl" aria-label="Retours">
            <thead>
              <tr>
                <th>Pièce</th>
                <th>Fournisseur / marque</th>
                <th>Motif du retour</th>
                <th>OR</th>
                <th className="r">Montant HT</th>
                <th>Statut</th>
                <th className="w-[90px]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((claim) => (
                <ClaimRow
                  key={claim.id}
                  claim={claim}
                  onEdit={() => setEditing({ claim })}
                  onDelete={() => setToDelete(claim)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

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
    </>
  );
}
