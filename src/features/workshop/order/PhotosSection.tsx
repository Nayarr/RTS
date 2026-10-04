import { useState } from 'react';
import { Camera, CheckCircle2, FileImage, Loader2, Wrench, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PhotoViewer } from '@/components/PhotoViewer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFileUrls } from '@/features/files/hooks';
import type { RoPhoto } from '@/features/repair-orders/api';
import { cn } from '@/lib/utils';
import { deletePhoto } from '../api';
import { useWorkshopMutation } from '../hooks';
import type { PhotoCapture } from './use-photo-capture';

const PARTS = 'Pièces';
const DIAGNOSTIC = 'Rapport diagnostique valise';

/** Photos obligatoires (avant le badgeage), pièces et rapport de diagnostic. */
export function PhotosSection({
  repairOrderId,
  photos,
  requiredLabels,
  capture,
  locked,
  plate,
  number,
}: {
  repairOrderId: string;
  photos: RoPhoto[];
  requiredLabels: string[];
  capture: PhotoCapture;
  locked: boolean;
  plate?: string | null | undefined;
  number?: string | undefined;
}) {
  const urls = useFileUrls(photos.map((photo) => photo.file_id));
  const [toDelete, setToDelete] = useState<RoPhoto | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const remove = useWorkshopMutation(
    repairOrderId,
    (photo: RoPhoto) => deletePhoto(photo.id),
    'Photo supprimée',
  );

  const has = (label: string) => photos.some((photo) => photo.label === label);
  const doneCount = requiredLabels.filter(has).length;

  const slot = (label: string, icon: React.ReactNode, onClick: () => void, required: boolean) => {
    const done = has(label);
    const uploading = capture.uploadingLabel === label;
    return (
      <button
        key={label}
        type="button"
        className={cn('slot', done ? 'done' : 'todo', !done && required && 'req')}
        disabled={uploading || locked}
        onClick={onClick}
      >
        {uploading ? <Loader2 className="i animate-spin" /> : done ? <CheckCircle2 className="i" /> : icon}
        {label}
      </button>
    );
  };

  return (
    <section data-slot="card" className="card sec" aria-labelledby="tech-photos">
      <div className="sec-t">
        <h2 id="tech-photos">Photos</h2>
        <span className="hint font-sans! text-[12.5px]! font-medium!">
          {doneCount} / {requiredLabels.length} obligatoires
        </span>
      </div>
      {!locked && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {requiredLabels.map((label) =>
              slot(label, <Camera className="i" />, () => capture.openCamera(label), true),
            )}
            {slot(PARTS, <Wrench className="i" />, () => capture.openCamera(PARTS), false)}
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={capture.uploadingLabel === DIAGNOSTIC}
            onClick={() => capture.openGallery(DIAGNOSTIC)}
          >
            {capture.uploadingLabel === DIAGNOSTIC ? <Loader2 className="animate-spin" /> : <FileImage />}
            {DIAGNOSTIC}
          </Button>
        </>
      )}

      {photos.length === 0 ? (
        <p className="hint">Aucune photo pour l’instant.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo) => {
            const url = urls.data?.[photo.file_id];
            return (
              <li key={photo.id} className="relative">
                {url ? (
                  <button
                    type="button"
                    className="block w-full"
                    aria-label={`Voir la photo « ${photo.label} » en grand`}
                    onClick={() => setOpen(photos.indexOf(photo))}
                  >
                    <img
                      src={url}
                      alt={photo.label}
                      className="aspect-4/3 w-full rounded-[7px] border object-cover"
                    />
                  </button>
                ) : (
                  <Skeleton className="aspect-4/3 w-full rounded-[7px]" />
                )}
                {!locked && (
                  <button
                    type="button"
                    className="absolute top-1 right-1 flex size-7 cursor-pointer items-center justify-center rounded-full bg-destructive text-white shadow"
                    aria-label={`Supprimer la photo « ${photo.label} »`}
                    onClick={() => setToDelete(photo)}
                  >
                    <X className="size-4" />
                  </button>
                )}
                <p className="hint mt-1 truncate">{photo.label}</p>
              </li>
            );
          })}
        </ul>
      )}
      {open !== null && (
        <PhotoViewer
          photos={photos.map((photo) => ({
            id: photo.id,
            url: urls.data?.[photo.file_id] ?? null,
            label: photo.label,
            takenAt: photo.taken_at,
            author: photo.author_name,
          }))}
          startIndex={open}
          plate={plate}
          title="Photos de l’OR"
          reference={number}
          onClose={() => setOpen(null)}
        />
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Supprimer cette photo ?"
        description={toDelete?.label}
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete, { onSettled: () => setToDelete(null) })}
      />
    </section>
  );
}
