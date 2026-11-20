import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Euro, Pencil, Recycle, Truck } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { FilterChips } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { formatEuro } from '@/lib/numbers';
import { markPartCoresReturned, type PartCore } from './api';
import {
  CORE_FILTERS,
  CORE_LATE_DAYS,
  PART_CORE_META,
  coreStats,
  coreWaitingDays,
  groupBySupplier,
  isLateCore,
  matchesCoreFilter,
  type CoreFilter,
} from './domain';
import { usePartCoreMutation, usePartCores } from './hooks';
import { PartCoreDialog } from './PartCoreDialog';

function waitingLabel(core: PartCore, today: string) {
  const days = coreWaitingDays(core, today);
  if (days === null) {
    return core.status === 'refunded' && core.refunded_on
      ? `remboursée le ${formatDate(core.refunded_on)}`
      : core.returned_on
        ? `renvoyée le ${formatDate(core.returned_on)}`
        : null;
  }
  const count = days === 0 ? 'aujourd’hui' : `depuis ${days} j`;
  return core.status === 'returned' ? `renvoyée ${count}` : `au garage ${count}`;
}

function CoreRow({
  core,
  today,
  selected,
  onSelect,
  onEdit,
}: {
  core: PartCore;
  today: string;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
}) {
  const meta = PART_CORE_META[core.status];
  const late = isLateCore(core, today);
  const details = [core.reference ? `Réf. ${core.reference}` : null, core.brand, core.notes]
    .filter(Boolean)
    .join(' · ');
  return (
    <tr>
      <td className="w-[44px]">
        {core.status === 'to_return' && (
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect(checked === true)}
            aria-label={`Sélectionner ${core.part_name}`}
          />
        )}
      </td>
      <td>
        <span className="c2">
          <button
            type="button"
            className="cursor-pointer text-left font-semibold hover:underline"
            onClick={onEdit}
          >
            {core.part_name}
          </button>
          <span>{details || '-'}</span>
        </span>
      </td>
      <td>
        <span className="col gap-0">
          <Link to={`/or/${core.repair_order_id}`} className="ul">
            {core.repair_order_number}
          </Link>
          {core.vehicle_id && core.vehicle_plate && (
            <Link to={`/vehicules/${core.vehicle_id}`} className="hint hover:underline">
              {core.vehicle_plate}
            </Link>
          )}
        </span>
      </td>
      <td className="r num b">
        {core.amount_ht !== null ? formatEuro(core.amount_ht) : '-'}
        {core.status === 'refunded' &&
          core.refunded_amount_ht !== null &&
          core.refunded_amount_ht !== core.amount_ht && (
            <span className="hint block font-normal">avoir {formatEuro(core.refunded_amount_ht)}</span>
          )}
      </td>
      <td>
        <span className="col gap-0.5">
          <span className="badge" style={{ '--c': meta.color } as CSSProperties}>
            {meta.label}
          </span>
          <span className={late ? 'text-[12px] font-semibold text-destructive' : 'hint'}>
            {late && <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />}
            {waitingLabel(core, today)}
          </span>
        </span>
      </td>
      <td className="w-[48px]">
        <button
          type="button"
          className="ibtn sm ghost"
          aria-label={`Suivre la consigne de ${core.part_name}`}
          onClick={onEdit}
        >
          <Pencil className="i s" />
        </button>
      </td>
    </tr>
  );
}

/** Consignes : anciennes pièces à renvoyer aux fournisseurs et remboursement des consignes. */
export function ConsignesPage() {
  const cores = usePartCores();
  const today = todayIso();
  const [filter, setFilter] = useState<CoreFilter>('open');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [returnedOn, setReturnedOn] = useState(today);
  const [editing, setEditing] = useState<PartCore | null>(null);
  const markReturned = usePartCoreMutation(
    (ids: string[]) => markPartCoresReturned(ids, returnedOn),
    (ids) => (ids.length > 1 ? `${ids.length} anciennes pièces renvoyées` : 'Ancienne pièce renvoyée'),
  );

  const all = useMemo(() => cores.data ?? [], [cores.data]);
  const list = all.filter((core) => matchesCoreFilter(core, filter));
  const groups = groupBySupplier(list);
  const stats = coreStats(all, today);
  // Sélection limitée aux pièces encore au garage et visibles
  const selectable = new Set(list.filter((core) => core.status === 'to_return').map((core) => core.id));
  const chosen = [...selected].filter((id) => selectable.has(id));

  const toggle = (ids: string[], checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Facturation' }, { label: 'Consignes' }]}
        title="Consignes"
        actions={
          <span className="sub hidden md:inline">
            Anciennes pièces à renvoyer aux fournisseurs et remboursement des consignes
          </span>
        }
      />

      {cores.isSuccess && all.length > 0 && (
        <div className="grid gap-3.5 md:grid-cols-3">
          <div className="card kpi">
            <span className="kpi-ico">
              <Recycle className="i s" />
            </span>
            <div className="col gap-1">
              <span className="kpi-v">{stats.toReturn}</span>
              <span className="kpi-l">Anciennes pièces à renvoyer</span>
            </div>
          </div>
          <div className="card kpi">
            <span className="kpi-ico">
              <Euro className="i s" />
            </span>
            <div className="col gap-1">
              <span className="kpi-v">{formatEuro(stats.pendingAmount)}</span>
              <span className="kpi-l">Consignes pas encore remboursées (HT)</span>
            </div>
          </div>
          <div className="card kpi">
            <span className="kpi-ico">
              <AlertTriangle className="i s" />
            </span>
            <div className="col gap-1">
              <span className={stats.late > 0 ? 'kpi-v text-destructive' : 'kpi-v'}>{stats.late}</span>
              <span className="kpi-l">Au garage depuis plus de {CORE_LATE_DAYS} jours</span>
            </div>
          </div>
        </div>
      )}

      <FilterChips
        label="Filtrer par statut"
        value={filter}
        onChange={setFilter}
        options={CORE_FILTERS.map(({ value, label }) => ({
          value,
          label,
          count: all.filter((core) => matchesCoreFilter(core, value)).length,
          color:
            value in PART_CORE_META ? PART_CORE_META[value as keyof typeof PART_CORE_META].color : undefined,
        }))}
      />

      {chosen.length > 0 && (
        <div className="card row flex-wrap items-end gap-3 p-3" role="region" aria-label="Renvoi groupé">
          <span className="text-sm font-semibold">
            {chosen.length} ancienne{chosen.length > 1 ? 's' : ''} pièce{chosen.length > 1 ? 's' : ''}{' '}
            sélectionnée{chosen.length > 1 ? 's' : ''}
          </span>
          <label className="field ml-auto">
            <span className="text-[12.5px] font-medium">Renvoyées le</span>
            <input
              type="date"
              className="inp h-9"
              value={returnedOn}
              max={today}
              onChange={(event) => setReturnedOn(event.target.value || today)}
            />
          </label>
          <Button
            disabled={markReturned.isPending}
            onClick={() => markReturned.mutate(chosen, { onSuccess: () => setSelected(new Set()) })}
          >
            <Truck /> Marquer renvoyées
          </Button>
        </div>
      )}

      {cores.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {cores.isError && <p className="text-destructive">Impossible de charger les consignes.</p>}
      {cores.isSuccess && all.length === 0 && (
        <p className="empty">
          Aucune consigne. Coche « Ancienne pièce en consigne » sur une pièce d’OR pour la suivre ici.
        </p>
      )}
      {cores.isSuccess && all.length > 0 && list.length === 0 && (
        <p className="empty">Aucune consigne dans cette catégorie.</p>
      )}

      {groups.map((group) => {
        const groupSelectable = group.items
          .filter((core) => core.status === 'to_return')
          .map((core) => core.id);
        const allChosen = groupSelectable.length > 0 && groupSelectable.every((id) => selected.has(id));
        const name = group.supplier || 'Sans fournisseur';
        return (
          <section key={group.supplier} className="card tbl-wrap overflow-x-auto!" aria-label={name}>
            <div className="card-h">
              <h2 className="h2">
                {name}{' '}
                <span className="cnt" aria-hidden>
                  {group.items.length}
                </span>
              </h2>
              <span className="sub">
                Consignes : <b className="num">{formatEuro(group.total)} HT</b>
              </span>
            </div>
            <table className="tbl" aria-label={`Consignes · ${name}`}>
              <thead>
                <tr>
                  <th className="w-[44px]">
                    {groupSelectable.length > 0 && (
                      <Checkbox
                        checked={allChosen}
                        onCheckedChange={(checked) => toggle(groupSelectable, checked === true)}
                        aria-label={`Tout sélectionner · ${name}`}
                      />
                    )}
                  </th>
                  <th>Pièce</th>
                  <th>OR</th>
                  <th className="r">Consigne HT</th>
                  <th>Statut</th>
                  <th className="w-[48px]">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((core) => (
                  <CoreRow
                    key={core.id}
                    core={core}
                    today={today}
                    selected={selected.has(core.id)}
                    onSelect={(checked) => toggle([core.id], checked)}
                    onEdit={() => setEditing(core)}
                  />
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      {editing && <PartCoreDialog core={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
