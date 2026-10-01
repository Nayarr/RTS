import { useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatEuro, marginPercent } from '@/lib/numbers';
import { useIsDesktop } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { deletePart, type Part } from './api';
import { CatalogTabs } from './CatalogTabs';
import { partsKey, useCatalogMutation, useParts } from './hooks';
import { PartDialog } from './PartDialog';

/** Marge : en vert à partir de 20 % (comme l'ancienne appli). */
function Margin({ part }: { part: Part }) {
  const margin = marginPercent(part.purchase_price, part.sale_price);
  if (margin === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('font-medium', margin >= 20 ? 'text-emerald-700' : 'text-destructive')}>
      {margin} %
    </span>
  );
}

const refs = (part: Part) => [part.manufacturer_ref, part.oem_ref].filter(Boolean).join(' · ') || '—';

interface RowProps {
  part: Part;
  onEdit: () => void;
  onDelete: () => void;
}

function Actions({ part, onEdit, onDelete }: RowProps) {
  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="icon" aria-label={`Modifier ${part.designation}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive"
        aria-label={`Supprimer ${part.designation}`}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function PartsTable({ parts, rowProps }: { parts: Part[]; rowProps: (part: Part) => RowProps }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Désignation</TableHead>
          <TableHead>Marque</TableHead>
          <TableHead>Références</TableHead>
          <TableHead>Fournisseur</TableHead>
          <TableHead className="text-right">Achat HT</TableHead>
          <TableHead className="text-right">Vente HT</TableHead>
          <TableHead className="text-right">Marge</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {parts.map((part) => (
          <TableRow key={part.id}>
            <TableCell className="font-medium whitespace-normal">{part.designation}</TableCell>
            <TableCell>{part.brand ?? '—'}</TableCell>
            <TableCell className="text-xs">{refs(part)}</TableCell>
            <TableCell>{part.supplier_name ?? '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{formatEuro(part.purchase_price)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatEuro(part.sale_price)}</TableCell>
            <TableCell className="text-right">
              <Margin part={part} />
            </TableCell>
            <TableCell>
              <Actions {...rowProps(part)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PartCard(props: RowProps) {
  const { part } = props;
  return (
    <Card role="article" aria-label={part.designation}>
      <CardContent className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{part.designation}</p>
          <Actions {...props} />
        </div>
        <p className="text-sm text-muted-foreground">
          {[part.brand, part.supplier_name].filter(Boolean).join(' · ') || '—'} · {refs(part)}
        </p>
        <p className="text-sm">
          Achat {formatEuro(part.purchase_price)} → vente {formatEuro(part.sale_price)} ·{' '}
          <Margin part={part} />
        </p>
      </CardContent>
    </Card>
  );
}

/** Catalogue de pièces : références et prix repris sur les OR et les devis. */
export function PartsPage() {
  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState('');
  const parts = useParts(search);
  const [editing, setEditing] = useState<Part | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Part | null>(null);

  const remove = useCatalogMutation(
    partsKey,
    (part: Part) => deletePart(part.id),
    (_result, part) => `${part.designation} retirée du catalogue`,
  );

  const rowProps = (part: Part): RowProps => ({
    part,
    onEdit: () => setEditing(part),
    onDelete: () => setDeleting(part),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Stock et catalogues</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus /> Nouvelle pièce
        </Button>
      </div>
      <CatalogTabs />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Rechercher une pièce"
          placeholder="Désignation, marque, référence…"
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {parts.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {parts.isError && <p className="text-destructive">Impossible de charger le catalogue.</p>}
      {parts.data?.length === 0 && (
        <p className="py-10 text-center text-muted-foreground">
          {search.trim() ? 'Aucune pièce correspondante.' : 'Aucune pièce dans le catalogue.'}
        </p>
      )}
      {parts.data &&
        parts.data.length > 0 &&
        (isDesktop ? (
          <PartsTable parts={parts.data} rowProps={rowProps} />
        ) : (
          <div className="space-y-3">
            {parts.data.map((part) => (
              <PartCard key={part.id} {...rowProps(part)} />
            ))}
          </div>
        ))}

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
    </div>
  );
}
