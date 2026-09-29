import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { globalSearch } from './api';
import { searchSections } from './sections';

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

  let body: ReactNode = null;
  if (term.length < 2) {
    body = <p className="text-sm text-muted-foreground">Tape au moins 2 caractères.</p>;
  } else if (results.isError) {
    body = <p className="text-sm text-destructive">Recherche impossible.</p>;
  } else if (results.isSuccess && sections.length === 0) {
    body = <p className="text-sm text-muted-foreground">Aucun résultat.</p>;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="top-[10%] flex max-h-[85dvh] translate-y-0 flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Rechercher</DialogTitle>
          <DialogDescription>Immatriculation, client, n° d’OR, de devis ou de facture.</DialogDescription>
        </DialogHeader>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (!first) return;
            onClose();
            void navigate(first.to);
          }}
        >
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              autoFocus
              aria-label="Rechercher partout"
              placeholder="Ex : AB-123, Dupont, OR00012, F11890…"
              className="h-11 pl-9 text-base"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        </form>
        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          {body}
          {sections.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="mb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                {section.title}
              </h3>
              <ul className="divide-y rounded-md border">
                {section.items.map((item) => (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      onClick={onClose}
                      className="block px-3 py-2 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <span className="block font-medium">{item.title}</span>
                      {item.detail && (
                        <span className="block text-sm text-muted-foreground">{item.detail}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton « Rechercher » de l'en-tête du bureau ; raccourci Ctrl+K (⌘K sur Mac). */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label="Rechercher"
        aria-keyshortcuts="Control+K"
        onClick={() => setOpen(true)}
      >
        <Search /> <span className="hidden sm:inline">Rechercher</span>
      </Button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}
