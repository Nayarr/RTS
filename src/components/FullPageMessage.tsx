import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

/** Écran plein page : chargement ou message bloquant. */
export function FullPageMessage({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      {title ? (
        <>
          <h1 className="title xl">{title}</h1>
          {children}
        </>
      ) : (
        <LoaderCircle className="size-8 animate-spin text-primary" aria-label="Chargement" />
      )}
    </main>
  );
}
