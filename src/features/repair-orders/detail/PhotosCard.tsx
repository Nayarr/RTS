import { ImageOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFileUrls } from '@/features/files/hooks';
import type { RoPhoto } from '../api';
import { formatDateTime } from '../constants';

/** Photos de l'OR (URL signées demandées en un seul appel) et photos obligatoires manquantes. */
export function PhotosCard({ photos, missingLabels }: { photos: RoPhoto[]; missingLabels: string[] }) {
  const urls = useFileUrls(photos.map((photo) => photo.file_id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Photos</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {missingLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Photos obligatoires manquantes :</span>
            {missingLabels.map((label) => (
              <Badge key={label} variant="outline" className="border-warning text-warning">
                {label}
              </Badge>
            ))}
          </div>
        )}
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune photo pour l’instant.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => {
              const url = urls.data?.[photo.file_id];
              return (
                <li key={photo.id} className="space-y-1">
                  {urls.isPending ? (
                    <Skeleton className="aspect-4/3 w-full" />
                  ) : url ? (
                    <a href={url} target="_blank" rel="noreferrer" title="Ouvrir en grand">
                      <img
                        src={url}
                        alt={photo.label}
                        loading="lazy"
                        className="aspect-4/3 w-full rounded-md border object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex aspect-4/3 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <ImageOff className="size-6" aria-label={`${photo.label} (indisponible)`} />
                    </div>
                  )}
                  <p className="text-sm font-medium">{photo.label}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(photo.taken_at)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
