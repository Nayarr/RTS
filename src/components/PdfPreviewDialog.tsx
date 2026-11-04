import { useEffect, useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMediaQuery } from '@/lib/use-media-query';
import { PdfPages } from './PdfPages';

export interface PdfFile {
  blob: Blob;
  fileName: string;
}

/** Aperçu d'un PDF généré, avec téléchargement (comme l'ancienne appli). */
export function PdfPreviewDialog({ file, onClose }: { file: PdfFile | null; onClose: () => void }) {
  // Écran tactile : pages dessinées par l'appli (le lecteur PDF des téléphones s'arrête à la page 1)
  const touch = useMediaQuery('(pointer: coarse)');
  const url = useMemo(() => (file ? URL.createObjectURL(file.blob) : null), [file]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-h-none flex-col sm:h-auto sm:max-h-[95dvh] sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Aperçu</DialogTitle>
          <DialogDescription>{file?.fileName}</DialogDescription>
        </DialogHeader>
        {file && touch && <PdfPages key={file.fileName} blob={file.blob} />}
        {url && !touch && (
          <iframe title="Aperçu du PDF" src={url} className="h-[70dvh] w-full rounded-md border bg-white" />
        )}
        <div className="flex gap-2">
          <Button asChild className="flex-1">
            <a href={url ?? undefined} download={file?.fileName}>
              <Download /> Télécharger
            </a>
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
