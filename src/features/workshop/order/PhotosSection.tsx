import { useState } from 'react';
import { Camera, Check, FileImage, Loader2, Wrench, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFileUrls } from '@/features/files/hooks';
import type { RoPhoto } from '@/features/repair-orders/api';
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
}: {
  repairOrderId: string;
  photos: RoPhoto[];
  requiredLabels: string[];
  capture: PhotoCapture;
  locked: boolean;
}) {
  const urls = useFileUrls(photos.map((photo) => photo.file_id));
  const [toDelete, setToDelete] = useState<RoPhoto | null>(null);
  const remove = useWorkshopMutation(
    repairOrderId,
    (photo: RoPhoto) => deletePhoto(photo.id),
    'Photo supprimée',
  );

  const slotButton = (label: string, icon: React.ReactNode, onClick: () => void) => {
    const done = photos.some((photo) => photo.label === label);
    const uploading = capture.uploadingLabel === label;
    return (
      <Button
        key={label}
        type="button"
        size="lg"
        variant={done ? 'default' : 'outline'}
        disabled={uploading}
        onClick={onClick}
      >
        {uploading ? <Loader2 className="animate-spin" /> : done ? <Check /> : icon}
        {label}
      </Button>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Photos</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!locked && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {requiredLabels.map((label) => slotButton(label, <Camera />, () => capture.openCamera(label)))}
            </div>
            <div className="flex flex-wrap gap-2">
              {slotButton(PARTS, <Wrench />, () => capture.openCamera(PARTS))}
              {slotButton(DIAGNOSTIC, <FileImage />, () => capture.openGallery(DIAGNOSTIC))}
            </div>
          </div>
        )}

        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune photo pour l’instant.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => {
              const url = urls.data?.[photo.file_id];
              return (
                <li key={photo.id} className="relative">
                  {url ? (
                    <img
                      src={url}
                      alt={photo.label}
                      className="aspect-4/3 w-full rounded-md border object-cover"
                    />
                  ) : (
                    <Skeleton className="aspect-4/3 w-full" />
                  )}
                  {!locked && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-1.5 right-1.5 size-8 rounded-full"
                      aria-label={`Supprimer la photo « ${photo.label} »`}
                      onClick={() => setToDelete(photo)}
                    >
                      <X />
                    </Button>
                  )}
                  <p className="mt-1 text-sm font-medium">{photo.label}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
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
    </Card>
  );
}
