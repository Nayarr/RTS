import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pager, SearchField, TableFooterBar } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import { formatEuro, marginPercent } from '@/lib/numbers';
import { usePagination } from '@/lib/use-pagination';
import { cn } from '@/lib/utils';
import { deletePart, type Part } from './api';
import { CatalogTabs } from './CatalogTabs';
import { partsKey, useCatalogMutation, useParts } from './hooks';
import { PartDialog } from './PartDialog';

/** Marge : en vert à partir de 20 % (comme l'ancienne appli). */
function Margin({ part }: { part: Part }) {
  const margin = marginPercent(part.purchase_price, part.sale_price);
  if (margin === null) return <span className="muted">-</span>;
  return <span className={cn('badge', margin >= 20 ? 's-ok' : 's-bad')}>{margin} %</span>;
}

const PAGE_SIZE = 25;

/** Catalogue de pièces : références et prix repris sur les OR et les devis. */
export function PartsPage() {
  const [search, setSearch] = useState('');
  const parts = useParts(search);
  const [editing, setEditing] = useState<Part | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Part | null>(null);
  const pages = usePagination(parts.data ?? [], PAGE_SIZE, search);

  const remove = useCatalogMutation(
    partsKey,
    (part: Part) => deletePart(part.id),
    (_result, part) => `${part.designation} retirée du catalogue`,
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Stock et catalogues' }, { label: 'Catalogue pièces' }]}
        title="Catalogue pièces"
        actions={
          <Button onClick={() => setEditing('new')}>
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
            placeholder="Désignation, marque, référence…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {parts.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {parts.isError && <p className="text-destructive">Impossible de charger le catalogue.</p>}
        {parts.data?.length === 0 && (
          <p className="empty">
            {search.trim() ? 'Aucune pièce correspondante.' : 'Aucune pièce dans le catalogue.'}
          </p>
        )}
        {parts.data && parts.data.length > 0 && (
          <div className="card tbl-wrap overflow-x-auto!">
            <table className="tbl" aria-label="Catalogue pièces">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Marque</th>
                  <th>Références</th>
                  <th>Fournisseur</th>
                  <th className="r">Achat HT</th>
                  <th className="r">Vente HT</th>
                  <th className="r">Marge</th>
                  <th className="w-[90px]">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pages.items.map((part) => (
                  <tr key={part.id} aria-label={part.designation}>
                    <td className="b whitespace-normal">{part.designation}</td>
                    <td>{part.brand ?? '-'}</td>
                    <td>
                      <span className="c2">
                        <b className="num font-medium">{part.manufacturer_ref ?? '-'}</b>
                        {part.oem_ref && <span>{part.oem_ref}</span>}
                      </span>
                    </td>
                    <td>{part.supplier_name ?? '-'}</td>
                    <td className="r num">{formatEuro(part.purchase_price)}</td>
                    <td className="r num b">{formatEuro(part.sale_price)}</td>
                    <td className="r">
                      <Margin part={part} />
                    </td>
                    <td>
                      <div className="row justify-end gap-0.5">
                        <button
                          type="button"
                          className="ibtn sm ghost"
                          aria-label={`Modifier ${part.designation}`}
                          onClick={() => setEditing(part)}
                        >
                          <Pencil className="i s" />
                        </button>
                        <button
                          type="button"
                          className="ibtn sm ghost text-destructive"
                          aria-label={`Supprimer ${part.designation}`}
                          onClick={() => setDeleting(part)}
                        >
                          <Trash2 className="i s" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TableFooterBar
              pager={<Pager page={pages.page} pageCount={pages.pageCount} onChange={pages.setPage} />}
            >
              {pages.shown} sur {pages.total} pièces
            </TableFooterBar>
          </div>
        )}
      </div>

      {editing && <PartDialog part={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Retirer ${deleting?.designation ?? ''} du catalogue ?`}
        description="Les OR, devis et factures qui la contiennent ne sont pas modifiés."
        confirmLabel="Retirer"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}
