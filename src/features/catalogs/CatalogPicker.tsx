import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatEuro } from '@/lib/numbers';
import type { Part } from './api';
import { useParts } from './hooks';

/** Recherche dans le catalogue : un clic reprend désignation, références, fournisseur et prix. */
export function CatalogPicker({
  onPick,
  emptyHint = 'Aucune pièce correspondante : saisis-la ci-dessous.',
}: {
  onPick: (part: Part) => void;
  emptyHint?: string;
}) {
  const [search, setSearch] = useState('');
  const parts = useParts(search);
  const results = search.trim().length >= 2 ? (parts.data ?? []).slice(0, 5) : [];

  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Chercher dans le catalogue"
          placeholder="Chercher dans le catalogue (désignation, référence…)"
          className="h-10 pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {results.length > 0 && (
        <ul aria-label="Pièces du catalogue" className="divide-y rounded-md border bg-card">
          {results.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(part);
                  setSearch('');
                }}
              >
                <span>
                  <span className="font-medium">{part.designation}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[part.brand, part.manufacturer_ref, part.supplier_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatEuro(part.sale_price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {search.trim().length >= 2 && parts.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  );
}
