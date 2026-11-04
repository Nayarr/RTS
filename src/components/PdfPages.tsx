import { useEffect, useRef, useState } from 'react';
import { openPdf, type PdfView } from '@/lib/pdf-viewer';

function PdfPage({ view, pageNumber }: { view: PdfView; pageNumber: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (target) void view.renderPage(pageNumber, target, target.clientWidth).catch(() => undefined);
  }, [view, pageNumber]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={`Page ${pageNumber} sur ${view.pageCount}`}
      className="block h-auto w-full rounded-sm border bg-white"
    />
  );
}

/**
 * Toutes les pages d'un PDF, les unes sous les autres. Safari sur iPhone et iPad n'affiche que la
 * première page d'un PDF dans une iframe, Chrome sur Android aucune.
 */
export function PdfPages({ blob }: { blob: Blob }) {
  const [view, setView] = useState<PdfView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current: PdfView | null = null;
    let closed = false;
    openPdf(blob)
      .then((opened) => {
        if (closed) {
          opened.destroy();
          return;
        }
        current = opened;
        setView(opened);
      })
      .catch(() => {
        if (!closed) setFailed(true);
      });
    return () => {
      closed = true;
      current?.destroy();
    };
  }, [blob]);

  return (
    <div className="col min-h-0 flex-1 gap-2 overflow-y-auto rounded-md border bg-muted p-2">
      {failed && <p className="hint p-3">Aperçu indisponible : télécharge le PDF pour le lire.</p>}
      {!failed && !view && <p className="hint p-3">Chargement de l’aperçu…</p>}
      {view &&
        Array.from({ length: view.pageCount }, (_, index) => (
          <PdfPage key={index} view={view} pageNumber={index + 1} />
        ))}
    </div>
  );
}
