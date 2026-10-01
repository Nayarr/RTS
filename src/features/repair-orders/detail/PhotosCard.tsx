import { Camera, ImageOff, TriangleAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useFileUrls } from '@/features/files/hooks';
import type { RoPhoto } from '../api';
import { formatDateTime } from '../constants';

/** Photos de l'OR (URL signées demandées en un seul appel) et photos obligatoires manquantes. */
export function PhotosCard({ photos, missingLabels }: { photos: RoPhoto[]; missingLabels: string[] }) {
  const urls = useFileUrls(photos.map((photo) => photo.file_id));

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
                    <a href={url} target="_blank" rel="noreferrer" title="Ouvrir en grand">
                      <img
                        src={url}
                        alt={photo.label}
                        loading="lazy"
                        className="h-[92px] w-full rounded-[7px] border object-cover"
                      />
                    </a>
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
    </section>
  );
}
