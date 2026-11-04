import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/** Largeur maximale d'une page dessinée, en pixels : nette au zoom, sans saturer la mémoire d'un téléphone. */
const MAX_WIDTH = 1400;

export interface PdfView {
  pageCount: number;
  /** Dessine une page (à partir de 1) sur le canevas, à la largeur affichée. */
  renderPage: (pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number) => Promise<void>;
  destroy: () => void;
}

/** PDF ouvert avec pdf.js (build « legacy » : iPhone plus anciens), chargé à la première utilisation. */
export async function openPdf(blob: Blob): Promise<PdfView> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true });
  const doc = await task.promise;
  return {
    pageCount: doc.numPages,
    renderPage: async (pageNumber, canvas, cssWidth) => {
      const page = await doc.getPage(pageNumber);
      const width = Math.min(cssWidth * (window.devicePixelRatio || 1), MAX_WIDTH);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
    },
    destroy: () => void task.destroy(),
  };
}
