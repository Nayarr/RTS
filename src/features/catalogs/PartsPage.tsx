import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pager, SearchField, TableFooterBar } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import { formatEuro } from '@/lib/numbers';
import { usePagination } from '@/lib/use-pagination';
import { cn } from '@/lib/utils';
import { deletePart, type Part, type PartStats } from './api';
import { CatalogTabs } from './CatalogTabs';
import { partsKey, useCatalogMutation, usePartStats } from './hooks';
import { PartDialog } from './PartDialog';
import { filterGroups, groupParts, type PartGroup } from './part-groups';

type Sort = 'used' | 'margin' | 'name';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'used', label: 'Plus utilisées' },
  { value: 'margin', label: 'Meilleure marge' },
  { value: 'name', label: 'A à Z' },
];

/** Taux de marge réalisé sur les ventes : en vert à partir de 20 % (comme l'ancienne appli). */
function MarginRate({ part }: { part: PartStats }) {
  const revenue = part.revenue_ht ?? 0;
  if (revenue <= 0) return <span className="muted">-</span>;
  const rate = Math.round(((part.margin_ht ?? 0) / revenue) * 100);
  return <span className={cn('badge', rate >= 20 ? 's-ok' : 's-bad')}>{rate} %</span>;
}

/** Marge réglée sur la pièce : « 30 % » ou « 25,00 € ». */
const marginSetting = (part: PartStats) =>
  part.margin_value === null
    ? '-'
    : part.margin_kind === 'amount'
      ? formatEuro(part.margin_value)
      : `${String(part.margin_value).replace('.', ',')} %`;

const PAGE_SIZE = 25;

/**
 * Base de pièces : chaque pièce saisie sur un devis ou une facture y est gardée.
 * Chiffres sur les factures émises : pièces les plus utilisées et marges réalisées.
 */
export function PartsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('used');
  const stats = usePartStats();
  const [editing, setEditing] = useState<PartStats | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PartStats | null>(null);

  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<Part | null>(null);

  const groups = useMemo(() => groupParts(stats.data ?? []), [stats.data]);
  const rows = useMemo(() => {
    const by: Record<Sort, (a: PartGroup, b: PartGroup) => number> = {
      used: (a, b) => b.quantitySold - a.quantitySold || b.quotesCount - a.quotesCount,
      margin: (a, b) => b.margin - a.margin,
      name: (a, b) => a.designation.localeCompare(b.designation, 'fr'),
    };
    return [...filterGroups(groups, search)].sort(by[sort]);
  }, [groups, search, sort]);
  const pages = usePagination(rows, PAGE_SIZE, `${search}|${sort}`);

  const totals = useMemo(() => {
    const all = stats.data ?? [];
    const revenue = all.reduce((sum, part) => sum + (part.revenue_ht ?? 0), 0);
    const margin = all.reduce((sum, part) => sum + (part.margin_ht ?? 0), 0);
    return {
      count: groups.length,
      references: all.length,
      sold: all.reduce((sum, part) => sum + (part.quantity_sold ?? 0), 0),
      revenue,
      margin,
      rate: revenue > 0 ? Math.round((margin / revenue) * 100) : null,
    };
  }, [stats.data, groups]);

  const toggle = (key: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  /** Une ligne de fiche : référence fabricant / fournisseur, prix, chiffres, actions. */
  const partRow = (part: PartStats, nested: boolean) => {
    const name = `${part.designation}${nested && part.manufacturer_ref ? ` ${part.manufacturer_ref}` : ''}`;
    const details = [part.brand, part.supplier_name, part.vehicle_ref].filter(Boolean).join(' · ');
    return (
      <tr key={part.id} aria-label={name}>
        <td className={cn('b whitespace-normal', nested && 'pl-10 font-normal')}>
          {part.designation}
          {(part.quotes_count ?? 0) > 0 && (
            <span className="muted block text-xs font-normal">Sur {part.quotes_count} devis</span>
          )}
        </td>
        <td>
          <span className="c2">
            <b className="num font-medium">{part.manufacturer_ref ?? '-'}</b>
            {!nested && part.oem_ref && <span className="num">Constructeur {part.oem_ref}</span>}
            {details && <span>{details}</span>}
          </span>
        </td>
        <td className="r num">
          {part.purchase_price === null
            ? '-'
            : formatEuro((part.purchase_price ?? 0) + (part.shipping_cost ?? 0))}
        </td>
        <td className="r num">{marginSetting(part)}</td>
        <td className="r num b">{formatEuro(part.sale_price)}</td>
        <td className="r num">{String(part.quantity_sold ?? 0).replace('.', ',')}</td>
        <td className="r num">{formatEuro(part.revenue_ht ?? 0)}</td>
        <td className="r">
          <span className="row justify-end gap-2">
            <span className="num">{formatEuro(part.margin_ht ?? 0)}</span>
            <MarginRate part={part} />
          </span>
        </td>
        <td>
          <div className="row justify-end gap-0.5">
            <button
              type="button"
              className="ibtn sm ghost"
              aria-label={`Modifier ${name}`}
              onClick={() => setEditing(part)}
            >
              <Pencil className="i s" />
            </button>
            <button
              type="button"
              className="ibtn sm ghost text-destructive"
              aria-label={`Supprimer ${name}`}
              onClick={() => setDeleting(part)}
            >
              <Trash2 className="i s" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  /** Pièce à plusieurs références : une ligne de synthèse, ses références dessous. */
  const groupRows = (group: PartGroup) => {
    const open = opened.has(group.key) || search.trim() !== '';
    const prices = group.variants.map((part) => part.sale_price ?? 0);
    const [low, high] = [Math.min(...prices), Math.max(...prices)];
    const rate = group.revenue > 0 ? Math.round((group.margin / group.revenue) * 100) : null;
    return (
      <Fragment key={group.key}>
        <tr aria-label={group.designation} className="bg-head">
          <td className="b whitespace-normal">
            <button
              type="button"
              className="row cursor-pointer gap-1.5 text-left"
              aria-expanded={open}
              aria-label={`${open ? 'Masquer' : 'Voir'} les références de ${group.designation}`}
              onClick={() => toggle(group.key)}
            >
              <ChevronRight className={cn('i s shrink-0 transition-transform', open && 'rotate-90')} />
              {group.designation}
            </button>
          </td>
          <td>
            <span className="c2">
              <b className="num font-medium">Constructeur {group.oemRef}</b>
              <span>{group.variants.length} références</span>
            </span>
          </td>
          <td />
          <td />
          <td className="r num b">
            {low === high ? formatEuro(low) : `${formatEuro(low)} à ${formatEuro(high)}`}
          </td>
          <td className="r num">{String(group.quantitySold).replace('.', ',')}</td>
          <td className="r num">{formatEuro(group.revenue)}</td>
          <td className="r">
            <span className="row justify-end gap-2">
              <span className="num">{formatEuro(group.margin)}</span>
              {rate !== null && <span className={cn('badge', rate >= 20 ? 's-ok' : 's-bad')}>{rate} %</span>}
            </span>
          </td>
          <td>
            <div className="row justify-end">
              <button
                type="button"
                className="ibtn sm ghost"
                aria-label={`Ajouter une référence à ${group.designation}`}
                title="Ajouter une référence fabricant ou fournisseur"
                onClick={() => {
                  setTemplate({
                    ...group.variants[0],
                    manufacturer_ref: null,
                    brand: null,
                    supplier_name: null,
                    purchase_price: null,
                    shipping_cost: null,
                    margin_value: null,
                    sale_price: null,
                  } as unknown as Part);
                  setEditing('new');
                }}
              >
                <Plus className="i s" />
              </button>
            </div>
          </td>
        </tr>
        {open && group.variants.map((part) => partRow(part, true))}
      </Fragment>
    );
  };

  const remove = useCatalogMutation(
    partsKey,
    (part: PartStats) => deletePart(part.id),
    (_result, part) => `${part.designation} retirée de la base`,
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Stock et catalogues' }, { label: 'Pièces' }]}
        title="Pièces"
        actions={
          <Button
            onClick={() => {
              setTemplate(null);
              setEditing('new');
            }}
          >
            <Plus /> Nouvelle pièce
          </Button>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <CatalogTabs />
          <SearchField
            className="sm:w-[380px]"
            aria-label="Rechercher une pièce"
            placeholder="Désignation, réf. constructeur, fabricant, fournisseur…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {stats.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {stats.isError && <p className="text-destructive">Impossible de charger les pièces.</p>}

        {stats.data && (
          <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4" aria-label="Chiffres des pièces">
            <li className="card kpi">
              <span className="kpi-l">Pièces dans la base</span>
              <span className="kpi-v">
                {totals.count}
                {totals.references !== totals.count && (
                  <span className="muted ml-2 text-base">{totals.references} références</span>
                )}
              </span>
            </li>
            <li className="card kpi">
              <span className="kpi-l">Pièces vendues</span>
              <span className="kpi-v">{String(totals.sold).replace('.', ',')}</span>
            </li>
            <li className="card kpi">
              <span className="kpi-l">Ventes HT</span>
              <span className="kpi-v">{formatEuro(totals.revenue)}</span>
            </li>
            <li className="card kpi">
              <span className="kpi-l">Marge réalisée</span>
              <span className="kpi-v">
                {formatEuro(totals.margin)}
                {totals.rate !== null && <span className="muted ml-2 text-base">{totals.rate} %</span>}
              </span>
            </li>
          </ul>
        )}

        {stats.data?.length === 0 && (
          <p className="empty">
            Aucune pièce : elles s’ajoutent ici dès qu’une pièce est saisie sur un devis ou une facture.
          </p>
        )}
        {stats.data && stats.data.length > 0 && (
          <div className="card tbl-wrap overflow-x-auto!">
            <div className="toolbar border-b px-4 py-2.5">
              <div className="seg" role="group" aria-label="Tri des pièces">
                {SORTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(sort === option.value && 'on')}
                    aria-pressed={sort === option.value}
                    onClick={() => setSort(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="empty">Aucune pièce correspondante.</p>
            ) : (
              <table className="tbl" aria-label="Pièces">
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th>Références</th>
                    <th className="r">Achat + port</th>
                    <th className="r">Marge</th>
                    <th className="r">Vente HT</th>
                    <th className="r">Vendues</th>
                    <th className="r">Ventes HT</th>
                    <th className="r">Marge réalisée</th>
                    <th className="w-[90px]">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pages.items.map((group) =>
                    group.variants.length > 1
                      ? groupRows(group)
                      : group.variants.map((part) => partRow(part, false)),
                  )}
                </tbody>
              </table>
            )}
            <TableFooterBar
              pager={<Pager page={pages.page} pageCount={pages.pageCount} onChange={pages.setPage} />}
            >
              {pages.shown} sur {pages.total} pièces
            </TableFooterBar>
          </div>
        )}
      </div>

      {editing && (
        <PartDialog
          part={editing === 'new' ? null : (editing as unknown as Part)}
          template={template}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Retirer ${deleting?.designation ?? ''} de la base ?`}
        description="Les OR, devis et factures qui la contiennent ne sont pas modifiés."
        confirmLabel="Retirer"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}
