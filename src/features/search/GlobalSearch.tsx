import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { FileText, Receipt, Search, Truck, Users, Wrench, type LucideIcon } from 'lucide-react';
import { globalSearch } from './api';
import { searchSections } from './sections';

const SECTION_ICONS: Record<string, LucideIcon> = {
  'Ordres de réparation': Wrench,
  Clients: Users,
  Véhicules: Truck,
  Devis: FileText,
  Factures: Receipt,
};

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const term = useDebounced(text.trim());
  const navigate = useNavigate();
  const results = useQuery({
    queryKey: ['global-search', term.toLowerCase()],
    queryFn: () => globalSearch(term),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
  });
  const sections = term.length >= 2 && results.data ? searchSections(results.data) : [];
  const first = sections[0]?.items[0];
  const count = sections.reduce((sum, section) => sum + section.items.length, 0);

  let body: ReactNode = null;
  if (term.length < 2) {
    body = <p className="hint px-3 py-1.5">Tape au moins 2 caractères.</p>;
  } else if (results.isError) {
    body = <p className="err px-3 py-1.5">Recherche impossible.</p>;
  } else if (results.isSuccess && sections.length === 0) {
    body = <p className="hint px-3 py-1.5">Aucun résultat.</p>;
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(12,14,12,.42)] data-[state=open]:animate-in data-[state=open]:fade-in-0 dark:bg-black/60" />
        <DialogPrimitive.Content className="modal fixed top-[110px] left-1/2 z-50 flex max-h-[calc(100dvh-140px)] w-[640px] max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <DialogPrimitive.Title className="sr-only">Rechercher</DialogPrimitive.Title>
          <form
            role="search"
            className="row gap-3 border-b px-[18px] py-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!first) return;
              onClose();
              void navigate(first.to);
            }}
          >
            <Search className="i l muted" />
            <input
              type="search"
              autoFocus
              aria-label="Rechercher partout"
              placeholder="Ex : AB-123, Dupont, OR00012, F11890…"
              className="grow border-0 bg-transparent text-lg outline-none [&::-webkit-search-cancel-button]:hidden"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <span className="kbd">Échap</span>
          </form>
          <DialogPrimitive.Description className="hint px-5 pt-3">
            Immatriculation, client, n° d’OR, de devis ou de facture.
          </DialogPrimitive.Description>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-2.5">
            {body}
            {sections.map((section) => {
              const Icon = SECTION_ICONS[section.title] ?? Search;
              return (
                <section key={section.title} aria-label={section.title}>
                  <h3 className="px-3 pt-2.5 pb-1 overline">{section.title}</h3>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.key}>
                        <Link
                          to={item.to}
                          onClick={onClose}
                          className="row gap-3 rounded-[9px] px-3 py-[9px] hover:bg-hover focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground">
                            <Icon className="i s" />
                          </span>
                          <span className="col grow gap-0">
                            <b>{item.title}</b>
                            {item.detail && <span className="hint">{item.detail}</span>}
                          </span>
                          {item === first && <span className="kbd">Entrée</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <div className="row between border-t bg-head px-[18px] py-2.5">
            <span className="hint row gap-1.5">
              <span className="kbd">Tab</span> naviguer <span className="kbd">Entrée</span> ouvrir
            </span>
            {term.length >= 2 && results.isSuccess && (
              <span className="hint">
                {count} résultat{count > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Recherche partout : champ de la barre latérale (raccourci Ctrl+K / ⌘K),
 * ou bouton icône (barre du téléphone).
 */
export function GlobalSearch({ variant = 'sidebar' }: { variant?: 'sidebar' | 'icon' }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (variant !== 'sidebar') return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant]);

  return (
    <>
      {variant === 'icon' ? (
        <button type="button" className="ibtn" aria-label="Rechercher" onClick={() => setOpen(true)}>
          <Search className="i" />
        </button>
      ) : (
        <button
          type="button"
          className="side-search cursor-pointer text-left"
          aria-label="Rechercher"
          aria-keyshortcuts="Control+K"
          onClick={() => setOpen(true)}
        >
          <Search className="i s" />
          <span className="grow">Rechercher…</span>
          <span className="kbd">Ctrl</span>
          <span className="kbd">K</span>
        </button>
      )}
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}
