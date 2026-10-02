import { useRef, useState } from 'react';
import { compressImage } from '@/features/files/image';
import { addPhoto } from '../api';
import { useWorkshopMutation } from '../hooks';

const ACCEPTED = 'image/jpeg,image/png,image/webp';

/**
 * Prise de photo pour un OR : appareil photo (téléphone / tablette) ou galerie,
 * compression puis envoi. `label` = emplacement (« Face avant », « Pièces »…).
 */
export function usePhotoCapture(
  repairOrderId: string,
  { onUploaded }: { onUploaded?: (label: string, fileId: string) => void } = {},
) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState<string | null>(null);

  const upload = useWorkshopMutation(
    repairOrderId,
    async ({ file, label }: { file: File; label: string }) => {
      const fileId = await addPhoto(repairOrderId, await compressImage(file), label);
      onUploaded?.(label, fileId);
      return fileId;
    },
    'Photo ajoutée',
  );

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!label) return;
    for (const file of files) upload.mutate({ file, label });
  };

  const open = (target: 'camera' | 'gallery', photoLabel: string) => {
    setLabel(photoLabel);
    (target === 'camera' ? camera : gallery).current?.click();
  };

  const inputs = (
    <>
      <input
        ref={camera}
        type="file"
        accept={ACCEPTED}
        capture="environment"
        hidden
        onChange={onChange}
        data-testid="photo-camera"
      />
      <input
        ref={gallery}
        type="file"
        accept={ACCEPTED}
        multiple
        hidden
        onChange={onChange}
        data-testid="photo-gallery"
      />
    </>
  );

  return {
    inputs,
    openCamera: (photoLabel: string) => open('camera', photoLabel),
    openGallery: (photoLabel: string) => open('gallery', photoLabel),
    /** Libellé en cours d'envoi (bouton en attente). */
    uploadingLabel: upload.isPending ? upload.variables.label : null,
  };
}

export type PhotoCapture = ReturnType<typeof usePhotoCapture>;
