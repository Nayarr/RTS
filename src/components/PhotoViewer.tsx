import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, ImageOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { photoFileName, wrapIndex, type ViewerPhoto } from './photo-viewer';

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(' ', ' à ');

/** Téléchargement sous un nom lisible (le lien signé du stockage a un nom de fichier technique). */
async function download(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Photo indisponible');
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Visionneuse : photo en grand, flèches et clavier (← → Échap), « 3 / 8 », libellé, date et auteur,
 * téléchargement « plaque_libellé.jpg », vignettes pour aller directement à une photo.
 */
export function PhotoViewer({
  photos,
  startIndex,
  plate,
  title,
  reference,
  onClose,
}: {
  photos: ViewerPhoto[];
  startIndex: number;
  plate?: string | null | undefined;
  title: string;
  /** Référence affichée à côté du titre (numéro d'OR, de contrat). */
  reference?: ReactNode;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() => wrapIndex(startIndex, photos.length));
  const [downloading, setDownloading] = useState(false);
  const count = photos.length;
  const photo = photos[index];
  const go = (delta: number) => setIndex((current) => wrapIndex(current + delta, count));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setIndex((current) => wrapIndex(current + 1, count));
      if (event.key === 'ArrowLeft') setIndex((current) => wrapIndex(current - 1, count));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  if (!photo) return null;
  const fileName = photoFileName(plate, photos, index);
  const details = [
    `Photo ${index + 1} sur ${count}`,
    photo.takenAt ? `prise le ${dateTime(photo.takenAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const save = async () => {
    if (!photo.url) return;
    setDownloading(true);
    try {
      await download(photo.url, fileName);
    } catch {
      toast.error('Téléchargement impossible : réessaie dans un instant');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-4 sm:max-w-[900px]" aria-describedby="photo-viewer-caption">
        <div className="row flex-wrap gap-x-3 gap-y-1 pr-10">
          {plate && (
            <span className="plate rounded-md border-2 border-foreground px-2 py-0.5 text-[14px]">
              {plate}
            </span>
          )}
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          {reference && <span className="text-[13px] text-muted-foreground">{reference}</span>}
        </div>

        <div>
          <div className="relative flex aspect-[4/3] max-h-[60dvh] w-full items-center justify-center overflow-hidden rounded-xl bg-black sm:aspect-[16/9]">
            {photo.url ? (
              <img
                key={photo.id}
                src={photo.url}
                alt={photo.label}
                className="h-full w-full object-contain"
              />
            ) : (
              <ImageOff className="size-10 text-white/60" aria-label={`${photo.label} (indisponible)`} />
            )}
            <span
              className="absolute top-3 left-4 text-[13px] font-semibold text-white tabular-nums"
              aria-hidden
            >
              {index + 1} / {count}
            </span>
            {count > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Photo précédente"
                  className="absolute inset-y-0 left-0 flex w-14 items-center justify-center text-white/90 hover:bg-white/5 hover:text-white"
                  onClick={() => go(-1)}
                >
                  <ChevronLeft className="size-7" />
                </button>
                <button
                  type="button"
                  aria-label="Photo suivante"
                  className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-white/90 hover:bg-white/5 hover:text-white"
                  onClick={() => go(1)}
                >
                  <ChevronRight className="size-7" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="row flex-wrap items-start gap-3">
          <div className="col min-w-0 flex-1 gap-0.5" id="photo-viewer-caption">
            <b className="text-[15px]">{photo.label}</b>
            <DialogDescription className="text-[13px]">
              {details}
              {photo.author ? ` par ${photo.author}` : ''}
            </DialogDescription>
          </div>
          <Button variant="outline" disabled={!photo.url || downloading} onClick={() => void save()}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />} Télécharger
          </Button>
        </div>

        {count > 1 && (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Toutes les photos">
            {photos.map((item, position) => (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  aria-label={`${item.label} (${position + 1} sur ${count})`}
                  aria-current={position === index}
                  onClick={() => setIndex(position)}
                  className={cn(
                    'block h-[54px] w-[72px] overflow-hidden rounded-lg border-2 border-transparent bg-muted',
                    position === index ? 'border-primary' : 'opacity-75 hover:opacity-100',
                  )}
                >
                  {item.url && (
                    <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint max-sm:hidden">← → photo précédente / suivante · Échap fermer</p>
      </DialogContent>
    </Dialog>
  );
}
