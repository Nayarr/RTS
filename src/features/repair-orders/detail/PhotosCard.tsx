import { useState } from 'react';
import { Camera, ImageOff, TriangleAlert } from 'lucide-react';
import { PhotoViewer } from '@/components/PhotoViewer';
import { Skeleton } from '@/components/ui/skeleton';
import { useFileUrls } from '@/features/files/hooks';
import type { RoPhoto } from '../api';
import { formatDateTime } from '../constants';

/** Photos de l'OR (URL signées demandées en un seul appel), visionneuse et photos obligatoires manquantes. */
export function PhotosCard({
  photos,
  missingLabels,
  plate,
  number,
}: {
  photos: RoPhoto[];
  missingLabels: string[];
  plate?: string | null | undefined;
  number?: string | undefined;
}) {
  const urls = useFileUrls(photos.map((photo) => photo.file_id));
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section data-slot="card" className="card" aria-labelledby="ro-photos">
      <div className="card-h">
        <h2 className="h2" id="ro-photos">
          Photos{' '}
          <span className="cnt" aria-hidden>
            {photos.length}
          </span>
        </h2>
      </div>
      <div className="card-b col gap-3.5">
        {missingLabels.length > 0 && (
          <div className="alert s-bad px-3.5 py-2.5">
            <TriangleAlert className="i" />
            <span>
              <b>Photos obligatoires manquantes :</b> {missingLabels.join(', ')}
            </span>
          </div>
        )}
        {photos.length === 0 && missingLabels.length === 0 ? (
          <p className="hint">Aucune photo pour l’instant.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {photos.map((photo) => {
              const url = urls.data?.[photo.file_id];
              return (
                <li key={photo.id} className="col gap-1.5">
                  {urls.isPending ? (
                    <Skeleton className="h-[92px] w-full" />
                  ) : url ? (
                    <button
                      type="button"
                      className="block w-full cursor-zoom-in"
                      aria-label={`Voir la photo « ${photo.label} » en grand`}
                      onClick={() => setOpen(photos.indexOf(photo))}
                    >
                      <img
                        src={url}
                        alt={photo.label}
                        loading="lazy"
                        className="h-[92px] w-full rounded-[7px] border object-cover"
                      />
                    </button>
                  ) : (
                    <div className="photo h-[92px]">
                      <ImageOff className="i" aria-label={`${photo.label} (indisponible)`} />
                    </div>
                  )}
                  <span className="hint" title={formatDateTime(photo.taken_at)}>
                    {photo.label}
                  </span>
                </li>
              );
            })}
            {missingLabels.map((label) => (
              <li key={`missing-${label}`} className="col gap-1.5" aria-hidden>
                <div className="photo miss h-[92px]">
                  <Camera className="i" />
                  Manquante
                </div>
                <span className="hint">{label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
    </section>
  );
}
